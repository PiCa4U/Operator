
import { useCallback, useEffect, useRef, useState } from "react";
import { Inviter, Session, SessionState, UserAgent, UserAgentOptions } from "sip.js";
import { attachIceDebug, logSelectedIcePair, onlyTurnServers } from "./iceDebug";

export type ViewerStatus = "idle" | "connecting" | "connected";

type Options = {
    ua: UserAgent | null;
};

type Result = {
    status: ViewerStatus;
    error: string | null;
    videoStreams: MediaStream[];

    joinRoom: (room: string) => Promise<void>;
    leaveRoom: () => Promise<void>;
};

type VideoInbound = {
    bytesReceived?: number;
    framesDecoded?: number;
    keyFramesDecoded?: number;
    packetsReceived?: number;
    pliCount?: number;
    firCount?: number;
    nackCount?: number;
    framesDropped?: number;
    freezeCount?: number;
};

type JoinMode = "relay" | "all";

function resolveSipDomain(ua: UserAgent): string {
    const uri: any = (ua.configuration as UserAgentOptions).uri;
    return uri?.host || "24webrtc.ru";
}

function getPcConfigFromUa(ua: UserAgent) {
    const factoryOpts = (ua.configuration as any).sessionDescriptionHandlerFactoryOptions || {};
    return (factoryOpts.peerConnectionConfiguration || undefined) as RTCConfiguration | undefined;
}

function buildPcConfigForMode(ua: UserAgent, mode: JoinMode): RTCConfiguration {
    const fromUa = (getPcConfigFromUa(ua) || {}) as RTCConfiguration;

    if (mode === "all") {
        return {
            ...fromUa,
            iceTransportPolicy: "all",
            iceServers: fromUa.iceServers,
        };
    }

    const turnOnly = onlyTurnServers(fromUa.iceServers);
    return {
        ...fromUa,
        iceTransportPolicy: "relay",
        iceServers: turnOnly,
    };
}

export function useScreenShareViewer({ ua }: Options): Result {
    const [status, _setStatus] = useState<ViewerStatus>("idle");
    const statusRef = useRef<ViewerStatus>("idle");
    const setStatus = useCallback((s: ViewerStatus) => {
        statusRef.current = s;
        _setStatus(s);
    }, []);

    const [error, setError] = useState<string | null>(null);

    const streamsRef = useRef<Map<string, MediaStream>>(new Map());
    const [, forceRerender] = useState(0);

    const sessionRef = useRef<Session | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);

    const roomRef = useRef<string | null>(null);

    const watchdogTimerRef = useRef<number | null>(null);
    const lastOkTsRef = useRef<number>(0);
    const lastFramesDecodedRef = useRef<number>(0);
    const lastBytesRef = useRef<number>(0);

    const connectedAtRef = useRef<number>(0);
    const noInboundSinceRef = useRef<number>(0);

    const reconnectLockRef = useRef(false);
    const reconnectAttemptsRef = useRef<number>(0);
    const lastReconnectTsRef = useRef<number>(0);

    const attachTrack = useCallback((track: MediaStreamTrack) => {
        if (track.kind !== "video") return;
        if (streamsRef.current.has(track.id)) return;

        const stream = new MediaStream([track]);
        streamsRef.current.set(track.id, stream);
        forceRerender((v) => v + 1);

        const cleanup = () => {
            streamsRef.current.delete(track.id);
            forceRerender((v) => v + 1);
        };

        track.addEventListener("ended", cleanup, { once: true });
    }, []);

    const stopWatchdog = useCallback((resetReconnect = true) => {
        if (watchdogTimerRef.current) {
            window.clearInterval(watchdogTimerRef.current);
            watchdogTimerRef.current = null;
        }

        lastOkTsRef.current = 0;
        lastFramesDecodedRef.current = 0;
        lastBytesRef.current = 0;

        connectedAtRef.current = 0;
        noInboundSinceRef.current = 0;

        reconnectLockRef.current = false;

        if (resetReconnect) {
            reconnectAttemptsRef.current = 0;
            lastReconnectTsRef.current = 0;
        }
    }, []);

    const clearStreams = useCallback(() => {
        streamsRef.current.forEach((s) => {
            s.getTracks().forEach((t) => {
                try {
                    t.stop();
                } catch {}
            });
        });
        streamsRef.current.clear();
        forceRerender((v) => v + 1);
    }, []);

    const leaveRoomInternal = useCallback(
        async (resetReconnect: boolean) => {
            stopWatchdog(resetReconnect);

            const s = sessionRef.current;
            sessionRef.current = null;
            roomRef.current = null;

            try {
                pcRef.current?.close();
            } catch {}
            pcRef.current = null;

            if (s) {
                try {
                    await s.bye();
                } catch {}
            }

            setStatus("idle");
            clearStreams();
        },
        [clearStreams, setStatus, stopWatchdog]
    );

    const leaveRoom = useCallback(async () => {
        await leaveRoomInternal(true);
    }, [leaveRoomInternal]);

    const readInboundVideo = useCallback(async (): Promise<VideoInbound | null> => {
        const pc = pcRef.current;
        if (!pc) return null;

        try {
            const stats = await pc.getStats();

            let best: any = null;
            let bestBytes = -1;

            stats.forEach((r: any) => {
                const isVideo = r.type === "inbound-rtp" && (r.kind === "video" || r.mediaType === "video");
                if (!isVideo) return;

                const bytes = Number(r.bytesReceived || 0);
                if (bytes >= bestBytes) {
                    bestBytes = bytes;
                    best = r;
                }
            });

            if (!best) return null;

            return {
                bytesReceived: best.bytesReceived,
                framesDecoded: best.framesDecoded,
                keyFramesDecoded: best.keyFramesDecoded,
                packetsReceived: best.packetsReceived,
                pliCount: best.pliCount,
                firCount: best.firCount,
                nackCount: best.nackCount,
                framesDropped: best.framesDropped,
                freezeCount: best.freezeCount,
            };
        } catch {
            return null;
        }
    }, []);

    const joinRoomRef = useRef<(room: string, mode?: JoinMode) => Promise<void>>(async () => {});

    const maybeReconnect = useCallback(
        async (reason: string) => {
            const room = roomRef.current;
            if (!room) return;
            if (!ua) return;
            if (reconnectLockRef.current) return;

            const now = Date.now();

            if (now - lastReconnectTsRef.current < 6000) return;
            if (reconnectAttemptsRef.current >= 3) return;

            reconnectLockRef.current = true;
            reconnectAttemptsRef.current += 1;
            lastReconnectTsRef.current = now;

            const mode: JoinMode = reconnectAttemptsRef.current >= 2 ? "all" : "relay";

            if (process.env.NODE_ENV !== "production") {
                console.warn("[viewer] watchdog reconnect:", reason, "attempt", reconnectAttemptsRef.current, "mode", mode);
            }

            try {
                await leaveRoomInternal(false);
                await new Promise((r) => setTimeout(r, 350));
                await joinRoomRef.current(room, mode);
            } finally {
                reconnectLockRef.current = false;
            }
        },
        [leaveRoomInternal, ua]
    );

    const startWatchdog = useCallback(() => {
        if (watchdogTimerRef.current) {
            window.clearInterval(watchdogTimerRef.current);
            watchdogTimerRef.current = null;
        }

        const WARMUP_SEC = 3;
        const STUCK_SEC = 8;
        const NO_INBOUND_GRACE_SEC = 5;

        connectedAtRef.current = Date.now();
        noInboundSinceRef.current = 0;

        lastOkTsRef.current = Date.now();
        lastFramesDecodedRef.current = 0;
        lastBytesRef.current = 0;

        watchdogTimerRef.current = window.setInterval(async () => {
            if (statusRef.current !== "connected") return;
            if (!pcRef.current) return;

            const now = Date.now();
            const inbound = await readInboundVideo();

            if (!inbound) {
                if (!noInboundSinceRef.current) noInboundSinceRef.current = now;

                const sinceConnected = (now - (connectedAtRef.current || now)) / 1000;
                const sinceNoInbound = (now - (noInboundSinceRef.current || now)) / 1000;

                if (sinceConnected > NO_INBOUND_GRACE_SEC && sinceNoInbound > NO_INBOUND_GRACE_SEC) {
                    void maybeReconnect("no inbound-rtp(video) after connected");
                }
                return;
            } else {
                noInboundSinceRef.current = 0;
            }

            const bytes = inbound.bytesReceived || 0;
            const frames = inbound.framesDecoded || 0;

            if (now - connectedAtRef.current > NO_INBOUND_GRACE_SEC * 1000 && bytes === 0 && frames === 0) {
                void maybeReconnect("inbound video stuck at 0 bytes/frames");
                return;
            }

            if (now - lastOkTsRef.current < WARMUP_SEC * 1000) {
                lastBytesRef.current = bytes;
                lastFramesDecodedRef.current = frames;
                return;
            }

            const bytesGrowing = bytes > (lastBytesRef.current || 0);
            const framesGrowing = frames > (lastFramesDecodedRef.current || 0);

            if (framesGrowing) {
                lastOkTsRef.current = now;
                lastBytesRef.current = bytes;
                lastFramesDecodedRef.current = frames;
                return;
            }

            if (bytesGrowing && !framesGrowing) {
                const stuckFor = now - lastOkTsRef.current;
                if (stuckFor > STUCK_SEC * 1000) {
                    void maybeReconnect("bytes grow but framesDecoded not grow (likely missing keyframe)");
                }
            } else {
                const stuckFor = now - lastOkTsRef.current;
                if (stuckFor > STUCK_SEC * 1000) {
                    void maybeReconnect("no progress in inbound video (bytes/frames not growing)");
                }
            }

            lastBytesRef.current = bytes;
            lastFramesDecodedRef.current = frames;
        }, 2000);
    }, [maybeReconnect, readInboundVideo]);

    const joinRoom = useCallback(
        async (room: string, mode: JoinMode = "relay") => {
            setError(null);

            if (!ua) {
                setError("SIP UA is not ready");
                return;
            }

            const rid = room.trim();
            if (!rid) {
                setError("room is empty");
                return;
            }

            if (sessionRef.current) return;

            roomRef.current = rid;

            const domain = resolveSipDomain(ua);
            const confUri = UserAgent.makeURI(`sip:conf+${rid}@${domain}`);
            if (!confUri) {
                setError("cannot build conf URI");
                roomRef.current = null;
                return;
            }

            const pcConfig = buildPcConfigForMode(ua, mode);
            if (mode === "relay") {
                const turnOnly = onlyTurnServers(pcConfig.iceServers);
                if (!turnOnly.length) {
                    setError("TURN is not configured (no turn: / turns: in iceServers). Cannot enforce relay.");
                    roomRef.current = null;
                    return;
                }
            }

            const viewerOptions: any = {
                sessionDescriptionHandlerFactoryOptions: {
                    mediaStreamFactory: () => Promise.resolve(new MediaStream()),
                    constraints: { audio: false, video: false },
                    iceGatheringTimeout: 13000,
                    peerConnectionConfiguration: pcConfig,
                },
                sessionDescriptionHandlerOptions: {
                    offerOptions: { offerToReceiveVideo: true, offerToReceiveAudio: false },
                    constraints: { audio: false, video: false },
                },
            };

            const viewer = new Inviter(ua, confUri, viewerOptions);
            sessionRef.current = viewer;
            setStatus("connecting");

            viewer.delegate = viewer.delegate || {};
            viewer.delegate.onSessionDescriptionHandler = (sdh: any) => {
                const pc: RTCPeerConnection = sdh.peerConnection;
                pcRef.current = pc;

                if (process.env.NODE_ENV !== "production") {
                    attachIceDebug(pc, `viewer:${mode}`);
                }

                try {
                    const hasVideoTr = pc.getTransceivers().some((t) => t.receiver?.track?.kind === "video");
                    if (!hasVideoTr) pc.addTransceiver("video", { direction: "recvonly" });
                } catch {}

                pc.addEventListener("track", (ev: RTCTrackEvent) => attachTrack(ev.track));

                try {
                    pc.getReceivers().forEach((r) => r.track && attachTrack(r.track));
                } catch {}
            };

            viewer.stateChange.addListener((st) => {
                if (st === SessionState.Establishing) setStatus("connecting");

                if (st === SessionState.Established) {
                    setStatus("connected");

                    connectedAtRef.current = Date.now();
                    noInboundSinceRef.current = 0;

                    startWatchdog();

                    if (process.env.NODE_ENV !== "production" && pcRef.current) {
                        void logSelectedIcePair(pcRef.current, `viewer:${mode}`);
                    }
                }

                if (st === SessionState.Terminated) {
                    if (watchdogTimerRef.current) {
                        window.clearInterval(watchdogTimerRef.current);
                        watchdogTimerRef.current = null;
                    }

                    setStatus("idle");
                    sessionRef.current = null;
                    roomRef.current = null;

                    try {
                        pcRef.current?.close();
                    } catch {}
                    pcRef.current = null;

                    clearStreams();
                }
            });

            try {
                await viewer.invite();
            } catch (e: any) {
                console.error("[screenShareViewer] invite() failed", e);
                setError(e?.message || String(e));

                setStatus("idle");
                sessionRef.current = null;
                roomRef.current = null;

                try {
                    pcRef.current?.close();
                } catch {}
                pcRef.current = null;

                clearStreams();
            }
        },
        [ua, attachTrack, clearStreams, setStatus, startWatchdog]
    );

    useEffect(() => {
        joinRoomRef.current = joinRoom;
    }, [joinRoom]);

    useEffect(() => {
        if (!ua) void leaveRoom();
    }, [ua, leaveRoom]);

    useEffect(() => {
        return () => {
            void leaveRoom();
        };
    }, [leaveRoom]);

    return {
        status,
        error,
        videoStreams: Array.from(streamsRef.current.values()),
        joinRoom: (room: string) => joinRoom(room, "relay"),
        leaveRoom,
    };
}
