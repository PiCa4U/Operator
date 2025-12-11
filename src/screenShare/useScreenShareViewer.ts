// src/screenShare/useScreenShareViewer.ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Inviter,
    Session,
    SessionState,
    UserAgent,
    UserAgentOptions,
} from "sip.js";

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

export function useScreenShareViewer({ ua }: Options): Result {
    const [status, setStatus] = useState<ViewerStatus>("idle");
    const [error, setError] = useState<string | null>(null);

    // track.id -> MediaStream (по одному треку на поток)
    const streamsRef = useRef<Map<string, MediaStream>>(new Map());
    const [version, setVersion] = useState(0);

    const sessionRef = useRef<Session | null>(null);

    const resolveSipDomain = (ua: UserAgent): string => {
        const uri: any = (ua.configuration as UserAgentOptions).uri;
        return uri?.host || "24webrtc.ru";
    };

    const attachTrack = useCallback((track: MediaStreamTrack) => {
        if (track.kind !== "video") return;
        if (streamsRef.current.has(track.id)) return;

        const stream = new MediaStream([track]);
        streamsRef.current.set(track.id, stream);
        setVersion((v) => v + 1);

        track.addEventListener(
            "ended",
            () => {
                streamsRef.current.delete(track.id);
                setVersion((v) => v + 1);
            },
            { once: true }
        );
    }, []);

    const joinRoom = useCallback(
        async (room: string) => {
            setError(null);
            if (!ua) {
                setError("SIP UA is not ready");
                return;
            }
            if (!room.trim()) {
                setError("room is empty");
                return;
            }
            if (sessionRef.current) {
                // уже подключены
                return;
            }

            const domain = resolveSipDomain(ua);
            const confUri = UserAgent.makeURI(`sip:conf+${room}@${domain}`);
            if (!confUri) {
                setError("cannot build conf URI");
                return;
            }

            const viewerOptions: any = {
                sessionDescriptionHandlerFactoryOptions: {
                    mediaStreamFactory: () => Promise.resolve(new MediaStream()),
                },
                sessionDescriptionHandlerOptions: {
                    offerOptions: {
                        offerToReceiveVideo: true,
                        offerToReceiveAudio: false,
                    },
                    constraints: { audio: false, video: false },
                },
            };

            const viewer = new Inviter(ua, confUri, viewerOptions);

            sessionRef.current = viewer;
            setStatus("connecting");

            viewer.delegate = viewer.delegate || {};
            viewer.delegate.onSessionDescriptionHandler = (sdh: any) => {
                const pc: RTCPeerConnection = sdh.peerConnection;

                pc.addEventListener("track", (ev: RTCTrackEvent) => {
                    const track = ev.track;
                    attachTrack(track);
                });

                // если ontrack уже отстрелил до наших обработчиков
                pc.getReceivers().forEach((r) => {
                    if (r.track) attachTrack(r.track);
                });
            };

            viewer.stateChange.addListener((st) => {
                if (st === SessionState.Establishing) setStatus("connecting");
                if (st === SessionState.Established) setStatus("connected");
                if (st === SessionState.Terminated) {
                    setStatus("idle");
                    sessionRef.current = null;
                    // подчистить все потоки
                    streamsRef.current.forEach((s) =>
                        s.getTracks().forEach((t) => t.stop())
                    );
                    streamsRef.current.clear();
                    setVersion((v) => v + 1);
                }
            });

            try {
                await viewer.invite();
            } catch (e: any) {
                console.error("[screenShareViewer] invite() failed", e);
                setError(e?.message || String(e));
                setStatus("idle");
                sessionRef.current = null;
            }
        },
        [ua, attachTrack]
    );

    const leaveRoom = useCallback(async () => {
        const s = sessionRef.current;
        if (s) {
            try {
                await s.bye();
            } catch {}
        }
        sessionRef.current = null;
        setStatus("idle");
        streamsRef.current.forEach((s) =>
            s.getTracks().forEach((t) => t.stop())
        );
        streamsRef.current.clear();
        setVersion((v) => v + 1);
    }, []);

    // если UA пропал — выходим
    useEffect(() => {
        if (!ua) {
            leaveRoom();
        }
    }, [ua, leaveRoom]);

    useEffect(
        () => () => {
            leaveRoom();
        },
        [leaveRoom]
    );

    return {
        status,
        error,
        videoStreams: Array.from(streamsRef.current.values()),
        joinRoom,
        leaveRoom,
    };
}
