
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Inviter,
    Session,
    SessionState,
    SessionDescriptionHandlerModifier,
    UserAgent,
    UserAgentOptions,
} from "sip.js";
import { ensureScreenSource, getScreenSource } from "./screenSource";
import { attachIceDebug, logSelectedIcePair, onlyTurnServers } from "./iceDebug";

export type ScreenCastStatus = "idle" | "access-ready" | "connecting" | "casting";

type Options = {
    ua: UserAgent | null;
    onAccessLost?: (room: string | null) => void;
};

type Result = {
    status: ScreenCastStatus;
    error: string | null;
    notice: string | null;

    hasAccess: boolean;
    previewStream: MediaStream | null;

    prepareAccessOnce: () => Promise<boolean>;
    connectToRoom: (room: string) => Promise<boolean>;
    disconnectFromRoom: () => Promise<void>;
    stopAccess: () => void;
};

type JoinMode = "relay" | "all";

function preferVP8InVideoMLine(sdp: string): string {
    const lines = sdp.split(/\r?\n/);
    const mIdx = lines.findIndex((l) => l.startsWith("m=video"));
    if (mIdx === -1) return sdp;

    const mParts = lines[mIdx].split(" ");
    const header = mParts.slice(0, 3);
    const payloads = mParts.slice(3);

    let vp8pt: string | null = null;
    for (const ln of lines) {
        const m = ln.match(/^a=rtpmap:(\d+)\s+VP8\/90000/i);
        if (m) {
            vp8pt = m[1];
            break;
        }
    }
    if (!vp8pt || !payloads.includes(vp8pt)) return sdp;

    const rest = payloads.filter((p) => p !== vp8pt);
    lines[mIdx] = [...header, vp8pt, ...rest].join(" ");
    return lines.join("\r\n");
}

const preferVP8Modifier: SessionDescriptionHandlerModifier = (desc) => {
    if (desc.sdp) desc.sdp = preferVP8InVideoMLine(desc.sdp);
    return Promise.resolve(desc);
};

function isLiveScreenStream(stream: MediaStream | null): boolean {
    if (!stream) return false;
    const vt = stream.getVideoTracks?.()[0];
    return !!vt && vt.readyState === "live";
}

function stopStreamTracks(stream: MediaStream | null) {
    if (!stream) return;
    try {
        stream.getTracks().forEach((t) => {
            try {
                t.stop();
            } catch {}
        });
    } catch {}
}

function resolveSipDomain(ua: UserAgent): string {
    const uri: any = (ua.configuration as UserAgentOptions).uri;
    return uri?.host || "24webrtc.ru";
}

function tryRequestKeyframe(pc: RTCPeerConnection) {
    try {
        const videoSenders = pc.getSenders().filter((s) => s.track?.kind === "video");
        for (const s of videoSenders) {
            const anyS = s as any;
            if (typeof anyS.requestKeyFrame === "function") anyS.requestKeyFrame();
            if (typeof anyS.generateKeyFrame === "function") anyS.generateKeyFrame();
        }
    } catch {}
}

function hardClosePc(pc: RTCPeerConnection | null) {
    if (!pc) return;
    try {
        pc.getSenders().forEach((s) => s.track?.stop());
    } catch {}
    try {
        pc.close();
    } catch {}
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

async function safeEndSession(session: Session) {
    const anyS: any = session as any;
    try {
        if (session.state === SessionState.Established) {
            await session.bye();
            return;
        }
    } catch {}
    try {
        if (typeof anyS.cancel === "function") {
            await anyS.cancel();
            return;
        }
    } catch {}
    try {
        if (typeof anyS.dispose === "function") {
            anyS.dispose();
        }
    } catch {}
}

function waitUntilEstablishedOrFail(session: Session, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        let done = false;

        const cleanup = (timer?: number) => {
            if (done) return;
            done = true;
            try {
                session.stateChange.removeListener(onState);
            } catch {}
            if (timer) window.clearTimeout(timer);
        };

        const onState = (st: SessionState) => {
            if (done) return;
            if (st === SessionState.Established) {
                cleanup(timer);
                resolve(true);
            } else if (st === SessionState.Terminated) {
                cleanup(timer);
                resolve(false);
            }
        };

        // current state guard
        try {
            if (session.state === SessionState.Established) {
                resolve(true);
                return;
            }
            if (session.state === SessionState.Terminated) {
                resolve(false);
                return;
            }
        } catch {}

        try {
            session.stateChange.addListener(onState);
        } catch {}

        const timer = window.setTimeout(() => {
            cleanup();
            resolve(false);
        }, Math.max(1000, timeoutMs));
    });
}

export function useScreenShareSender({ ua, onAccessLost }: Options): Result {
    const [status, setStatus] = useState<ScreenCastStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [previewStream, _setPreviewStream] = useState<MediaStream | null>(null);
    const previewStreamRef = useRef<MediaStream | null>(null);
    const setPreviewStream = useCallback((s: MediaStream | null) => {
        previewStreamRef.current = s;
        _setPreviewStream(s);
    }, []);

    const [hasAccess, setHasAccess] = useState(false);

    // исходный поток экрана
    const sourceStreamRef = useRef<MediaStream | null>(null);

    // текущая SIP-сессия publish
    const castSessionRef = useRef<Session | null>(null);

    // активная комната publish
    const activeRoomRef = useRef<string | null>(null);

    const pcRef = useRef<RTCPeerConnection | null>(null);

    // keyframe timers
    const keyframeTimerRef = useRef<number | null>(null);
    const keyframeBurstTimerRef = useRef<number | null>(null);

    const detachEndedHandlersRef = useRef<(() => void) | null>(null);

    const cleanupEndedHandlers = useCallback(() => {
        try {
            detachEndedHandlersRef.current?.();
        } catch {}
        detachEndedHandlersRef.current = null;
    }, []);

    const stopKeyframeTimers = useCallback(() => {
        if (keyframeTimerRef.current) {
            window.clearInterval(keyframeTimerRef.current);
            keyframeTimerRef.current = null;
        }
        if (keyframeBurstTimerRef.current) {
            window.clearTimeout(keyframeBurstTimerRef.current);
            keyframeBurstTimerRef.current = null;
        }
    }, []);

    const handleAccessLost = useCallback(
        (reason: string) => {
            const room = activeRoomRef.current;

            setError(null);
            setNotice("Доступ к экрану отключён (Stop sharing).");

            stopKeyframeTimers();

            const s = castSessionRef.current;
            castSessionRef.current = null;
            if (s) {
                try {
                    void safeEndSession(s);
                } catch {}
            }

            activeRoomRef.current = null;
            const pc = pcRef.current;
            hardClosePc(pc);
            pcRef.current = null;

            cleanupEndedHandlers();

            sourceStreamRef.current = null;
            setPreviewStream(null);

            setHasAccess(false);
            setStatus("idle");

            try {
                onAccessLost?.(room);
            } catch {}

            if (process.env.NODE_ENV !== "production") {
                console.warn("[screenShare] access lost:", reason, "room:", room);
            }
        },
        [cleanupEndedHandlers, onAccessLost, setPreviewStream, stopKeyframeTimers]
    );

    const attachEndedHandlers = useCallback(
        (stream: MediaStream) => {
            cleanupEndedHandlers();

            const vt = stream.getVideoTracks?.()[0];
            const onEnded = () => handleAccessLost("track-ended");
            const onInactive = () => handleAccessLost("stream-inactive");

            if (vt) {
                try {
                    vt.onended = onEnded;
                } catch {}
                try {
                    vt.addEventListener?.("ended", onEnded as any);
                } catch {}
            }

            try {
                (stream as any).oninactive = onInactive;
            } catch {}
            try {
                stream.addEventListener?.("inactive", onInactive as any);
            } catch {}

            detachEndedHandlersRef.current = () => {
                if (vt) {
                    try {
                        if (vt.onended === onEnded) vt.onended = null;
                    } catch {}
                    try {
                        vt.removeEventListener?.("ended", onEnded as any);
                    } catch {}
                }
                try {
                    if ((stream as any).oninactive === onInactive) (stream as any).oninactive = null;
                } catch {}
                try {
                    stream.removeEventListener?.("inactive", onInactive as any);
                } catch {}
            };
        },
        [cleanupEndedHandlers, handleAccessLost]
    );

    const stopAccess = useCallback(() => {
        setError(null);
        setNotice(null);

        stopKeyframeTimers();

        const s = castSessionRef.current;
        if (s) {
            try {
                void safeEndSession(s);
            } catch {}
        }
        castSessionRef.current = null;
        activeRoomRef.current = null;

        const pc = pcRef.current;
        hardClosePc(pc);
        pcRef.current = null;

        cleanupEndedHandlers();

        const src = sourceStreamRef.current;
        const pv = previewStreamRef.current;

        if (src) stopStreamTracks(src);
        if (pv && pv !== src) stopStreamTracks(pv);

        sourceStreamRef.current = null;
        setPreviewStream(null);

        setHasAccess(false);
        setStatus("idle");
    }, [cleanupEndedHandlers, setPreviewStream, stopKeyframeTimers]);

    const prepareAccessOnce = useCallback(async (): Promise<boolean> => {
        setError(null);
        setNotice(null);

        if (!navigator.mediaDevices?.getDisplayMedia) {
            setError("browser does not support getDisplayMedia");
            return false;
        }

        if (isLiveScreenStream(sourceStreamRef.current)) {
            setHasAccess(true);
            setStatus("access-ready");
            setPreviewStream(sourceStreamRef.current);
            return true;
        }

        try {
            let stream = await ensureScreenSource();

            if (!isLiveScreenStream(stream)) {
                stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            }

            attachEndedHandlers(stream);

            sourceStreamRef.current = stream;
            setPreviewStream(stream);

            setHasAccess(true);
            setStatus("access-ready");
            return true;
        } catch (e: any) {
            console.error("[screenShare] getDisplayMedia failed", e);
            setError(e?.message || String(e));
            setHasAccess(false);
            setStatus("idle");
            return false;
        }
    }, [attachEndedHandlers, setPreviewStream]);

    const startKeyframeBurst = useCallback(() => {
        stopKeyframeTimers();

        const pc = pcRef.current;
        if (!pc) return;

        tryRequestKeyframe(pc);
        keyframeBurstTimerRef.current = window.setTimeout(() => {
            tryRequestKeyframe(pc);
            keyframeBurstTimerRef.current = window.setTimeout(() => {
                tryRequestKeyframe(pc);
            }, 2500);
        }, 800);

        keyframeTimerRef.current = window.setInterval(() => {
            const pc2 = pcRef.current;
            if (!pc2) return;
            tryRequestKeyframe(pc2);
        }, 7000);
    }, [stopKeyframeTimers]);

    const disconnectFromRoom = useCallback(async () => {
        stopKeyframeTimers();

        const s = castSessionRef.current;
        if (!s) return;

        try {
            await safeEndSession(s);
        } catch {
            /* no-op */
        } finally {
            castSessionRef.current = null;
            activeRoomRef.current = null;

            const pc = pcRef.current;
            hardClosePc(pc);
            pcRef.current = null;

            const stillHaveAccess = isLiveScreenStream(sourceStreamRef.current);
            setHasAccess(stillHaveAccess);
            setStatus(stillHaveAccess ? "access-ready" : "idle");
            setPreviewStream(stillHaveAccess ? sourceStreamRef.current : null);
        }
    }, [setPreviewStream, stopKeyframeTimers]);

    const connectToRoom = useCallback(
        async (room: string): Promise<boolean> => {
            setError(null);

            const rid = room.trim();
            if (!rid) {
                setError("room is empty");
                return false;
            }

            if (!ua) {
                setError("SIP UA is not ready");
                return false;
            }

            if (castSessionRef.current) {
                const cur = (activeRoomRef.current || "").trim();
                if (cur && cur === rid) {
                    // уже в нужной комнате
                    return castSessionRef.current.state === SessionState.Established;
                }
                await disconnectFromRoom();
            }

            const src = sourceStreamRef.current || getScreenSource();
            const origVideo = src?.getVideoTracks?.()[0] || null;

            if (!origVideo || origVideo.readyState !== "live") {
                handleAccessLost("connect-with-dead-track");
                return false;
            }

            activeRoomRef.current = rid;

            const domain = resolveSipDomain(ua);
            const confUri = UserAgent.makeURI(`sip:conf+${rid}@${domain}`);
            if (!confUri) {
                setError("cannot build conf URI");
                activeRoomRef.current = null;
                return false;
            }

            const attempt = async (mode: JoinMode): Promise<boolean> => {
                const screenTrack = origVideo.clone();
                if (screenTrack.readyState !== "live") {
                    try {
                        screenTrack.stop();
                    } catch {}
                    handleAccessLost("cloned-track-not-live");
                    return false;
                }

                setPreviewStream(new MediaStream([screenTrack]));

                const pcConfig = buildPcConfigForMode(ua, mode);
                if (mode === "relay") {
                    const turnOnly = onlyTurnServers(pcConfig.iceServers);
                    if (!turnOnly.length) {
                        setError("TURN is not configured (no turn: / turns: in iceServers). Cannot enforce relay.");
                        activeRoomRef.current = null;
                        try {
                            screenTrack.stop();
                        } catch {}
                        return false;
                    }
                }

                const inviterOptions: any = {
                    sessionDescriptionHandlerFactoryOptions: {
                        mediaStreamFactory: () => Promise.resolve(new MediaStream()),
                        constraints: { audio: false, video: false },
                        iceGatheringTimeout: 13000,
                        peerConnectionConfiguration: pcConfig,
                    },
                    sessionDescriptionHandlerOptions: {
                        offerOptions: { offerToReceiveAudio: false, offerToReceiveVideo: false },
                        constraints: { audio: false, video: false },
                        modifiers: [preferVP8Modifier],
                    },
                };

                const inviter = new Inviter(ua, confUri, inviterOptions);
                castSessionRef.current = inviter;
                setStatus("connecting");

                inviter.delegate = inviter.delegate || {};
                inviter.delegate.onSessionDescriptionHandler = (sdh: any) => {
                    const pc: RTCPeerConnection = sdh.peerConnection;
                    pcRef.current = pc;

                    if (process.env.NODE_ENV !== "production") {
                        attachIceDebug(pc, `sender:${mode}`);
                    }

                    try {
                        pc.getTransceivers().forEach((tr) => {
                            try {
                                tr.direction = "inactive";
                            } catch {}
                            if (tr.sender?.track) {
                                try {
                                    tr.sender.replaceTrack(null);
                                } catch {}
                            }
                        });
                    } catch {}

                    try {
                        (screenTrack as any).contentHint = "detail";
                    } catch {}

                    const vTr = pc.addTransceiver("video", { direction: "sendonly" });
                    vTr.sender.replaceTrack(screenTrack).catch((e) => {
                        console.warn("[screenShare] replaceTrack(video) failed", e);
                    });
                };

                inviter.stateChange.addListener((st) => {
                    if (st === SessionState.Establishing) setStatus("connecting");

                    if (st === SessionState.Established) {
                        setStatus("casting");
                        startKeyframeBurst();

                        if (process.env.NODE_ENV !== "production" && pcRef.current) {
                            void logSelectedIcePair(pcRef.current, `sender:${mode}`);
                        }
                    }

                    if (st === SessionState.Terminated) {
                        stopKeyframeTimers();

                        castSessionRef.current = null;
                        activeRoomRef.current = null;

                        const pc = pcRef.current;
                        hardClosePc(pc);
                        pcRef.current = null;

                        try {
                            screenTrack.stop();
                        } catch {}

                        const stillHaveAccess = isLiveScreenStream(sourceStreamRef.current);
                        setHasAccess(stillHaveAccess);
                        setStatus(stillHaveAccess ? "access-ready" : "idle");
                        setPreviewStream(stillHaveAccess ? sourceStreamRef.current : null);
                    }
                });

                try {
                    await inviter.invite();

                    const ok = await waitUntilEstablishedOrFail(inviter, 20000);
                    if (ok) return true;

                    try {
                        await safeEndSession(inviter);
                    } catch {}

                    return false;
                } catch (e: any) {
                    console.error(`[screenShare] invite() error (${mode})`, e);
                    setError(e?.message || String(e));

                    stopKeyframeTimers();

                    castSessionRef.current = null;
                    activeRoomRef.current = null;

                    const pc = pcRef.current;
                    hardClosePc(pc);
                    pcRef.current = null;

                    try {
                        screenTrack.stop();
                    } catch {}

                    const stillHaveAccess = isLiveScreenStream(sourceStreamRef.current);
                    setHasAccess(stillHaveAccess);
                    setStatus(stillHaveAccess ? "access-ready" : "idle");
                    setPreviewStream(stillHaveAccess ? sourceStreamRef.current : null);

                    return false;
                }
            };

            const okRelay = await attempt("relay");
            if (okRelay) return true;

            if (process.env.NODE_ENV !== "production") {
                console.warn("[screenShare] relay attempt failed, trying all…");
            }
            const okAll = await attempt("all");
            return okAll;
        },
        [ua, handleAccessLost, setPreviewStream, startKeyframeBurst, stopKeyframeTimers, disconnectFromRoom]
    );

    const prevUaRef = useRef<UserAgent | null>(null);
    useEffect(() => {
        if (prevUaRef.current && !ua) {
            stopKeyframeTimers();

            const s = castSessionRef.current;
            castSessionRef.current = null;
            if (s) {
                try {
                    void safeEndSession(s);
                } catch {}
            }
            activeRoomRef.current = null;

            const pc = pcRef.current;
            hardClosePc(pc);
            pcRef.current = null;

            const stillHaveAccess = isLiveScreenStream(sourceStreamRef.current);
            setHasAccess(stillHaveAccess);
            setStatus(stillHaveAccess ? "access-ready" : "idle");
            setPreviewStream(stillHaveAccess ? sourceStreamRef.current : null);
        }
        prevUaRef.current = ua;
    }, [ua, setPreviewStream, stopKeyframeTimers]);

    useEffect(() => () => stopAccess(), [stopAccess]);

    return {
        status,
        error,
        notice,
        hasAccess,
        previewStream,
        prepareAccessOnce,
        connectToRoom,
        disconnectFromRoom,
        stopAccess,
    };
}
