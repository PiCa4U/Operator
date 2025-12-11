// src/screenShare/useScreenShareSender.ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Inviter,
    Session,
    SessionState,
    SessionDescriptionHandlerModifier,
    UserAgent,
    UserAgentOptions,
} from "sip.js";
import {ensureScreenSource, getScreenSource} from "./screenSource";

export type ScreenCastStatus =
    | "idle"           // ничего не делаем
    | "access-ready"   // права на экран даны, но в комнату не подключены
    | "connecting"     // делаем INVITE в conf
    | "casting";       // экран уже льётся в conf

type Options = {
    ua: UserAgent | null;
};

type Result = {
    status: ScreenCastStatus;
    error: string | null;
    hasAccess: boolean;
    previewStream: MediaStream | null;

    // шаг 1: запросить доступ к экрану (один раз за смену)
    prepareAccessOnce: () => Promise<void>;

    // шаг 2: по команде от бэка подключиться к комнате
    connectToRoom: (room: string) => Promise<void>;

    // шаг 3: отцепиться от комнаты, но НЕ отзывать права на экран
    disconnectFromRoom: () => Promise<void>;

    // шаг 4: полностью остановить доступ (чтобы браузер забыл шаринг)
    stopAccess: () => void;
};

// --- SDP модификатор: двигать VP8 первым в m=video
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
    if (desc.sdp) {
        desc.sdp = preferVP8InVideoMLine(desc.sdp);
    }
    return Promise.resolve(desc);
};

export function useScreenShareSender({ ua }: Options): Result {
    const [status, setStatus] = useState<ScreenCastStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
    const [hasAccess, setHasAccess] = useState(false);

    // исходный поток экрана, полученный из getDisplayMedia (НЕ останавливаем трек)
    const sourceStreamRef = useRef<MediaStream | null>(null);
    // текущая SIP-сессия конференции
    const castSessionRef = useRef<Session | null>(null);

    // шаг 1 — запросить доступ к экрану один раз
    const prepareAccessOnce = useCallback(async () => {
        setError(null);
        if (!navigator.mediaDevices?.getDisplayMedia) {
            setError("browser does not support getDisplayMedia");
            return;
        }

        try {
            const stream = await ensureScreenSource();
            sourceStreamRef.current = stream;
            setPreviewStream(stream);
            setHasAccess(true);
            setStatus("access-ready");
        } catch (e: any) {
            console.error("[screenShare] getDisplayMedia failed", e);
            setError(e?.message || String(e));
            setHasAccess(false);
            setStatus("idle");
        }
    }, []);
    // вспомогалка: достать домен из UA
    const resolveSipDomain = (ua: UserAgent): string => {
        // мы создаём UA с uri вида sip:1000@24webrtc.ru
        const uri: any = (ua.configuration as UserAgentOptions).uri;
        return uri?.host || "24webrtc.ru";
    };

    // шаг 2 — подключиться к комнате, НЕ спрашивая заново разрешение
    const connectToRoom = useCallback(
        async (room: string) => {
            if (!ua) {
                setError("SIP UA is not ready");
                return;
            }
            const src = sourceStreamRef.current || getScreenSource();
            const origVideo = src?.getVideoTracks()[0] || null;

            if (!origVideo) {
                setStatus("idle");
                setHasAccess(false);
                setError("no screen track, call prepareAccessOnce() first");
                return;
            }
            if (!room.trim()) {
                setError("room is empty");
                return;
            }
            if (castSessionRef.current) {
                // уже подключены
                return;
            }

            // клонируем трек — чтобы он был «свежим» для нового PeerConnection
            const screenTrack = origVideo.clone();
            const localPreview = new MediaStream([screenTrack]);
            setPreviewStream(localPreview);

            const domain = resolveSipDomain(ua);
            const confUri = UserAgent.makeURI(`sip:conf+${room}@${domain}`);
            if (!confUri) {
                setError("cannot build conf URI");
                return;
            }

            const factoryOpts =
                (ua.configuration as any).sessionDescriptionHandlerFactoryOptions || {};

// 👇 отдельная переменная типа any
            const inviterOptions: any = {
                sessionDescriptionHandlerFactoryOptions: {
                    // НЕ даём SIP.js самому лезть в getUserMedia,
                    // мы сами добавим нужный трек через Transceiver
                    mediaStreamFactory: () => Promise.resolve(new MediaStream()),
                    constraints: { audio: false, video: false },
                    peerConnectionConfiguration:
                        factoryOpts.peerConnectionConfiguration || undefined,
                },
                sessionDescriptionHandlerOptions: {
                    offerOptions: {
                        offerToReceiveAudio: false,
                        offerToReceiveVideo: false,
                    },
                    constraints: { audio: false, video: false },
                    // модификатор SDP для VP8
                    modifiers: [preferVP8Modifier],
                },
            };

// 👇 тут TS уже видит аргумент типа any и не ругается
            const inviter = new Inviter(ua, confUri, inviterOptions);

            castSessionRef.current = inviter;
            setStatus("connecting");

            inviter.delegate = inviter.delegate || {};
            inviter.delegate.onSessionDescriptionHandler = (sdh: any) => {
                const pc: RTCPeerConnection = sdh.peerConnection;

                // на всякий случай вычистим старые транссиверы
                try {
                    pc.getTransceivers().forEach((tr) => {
                        try {
                            tr.direction = "inactive";
                        } catch {}
                        if (tr.sender && tr.sender.track) {
                            try {
                                tr.sender.replaceTrack(null);
                            } catch {}
                        }
                    });
                } catch {}

                // добавляем новый sendonly-видео
                try {
                    (screenTrack as any).contentHint = "detail";
                } catch {}

                const vTr = pc.addTransceiver("video", { direction: "sendonly" });
                vTr.sender
                    .replaceTrack(screenTrack)
                    .catch((e) =>
                        console.warn("[screenShare] replaceTrack(video) failed", e)
                    );
            };

            inviter.stateChange.addListener((st) => {
                if (st === SessionState.Establishing) {
                    setStatus("connecting");
                }
                if (st === SessionState.Established) {
                    setStatus("casting");
                }
                if (st === SessionState.Terminated) {
                    castSessionRef.current = null;
                    setStatus(hasAccess ? "access-ready" : "idle");
                }
            });

            try {
                await inviter.invite();
            } catch (e) {
                console.error("[screenShare] invite() error", e);
                setError((e as any)?.message || String(e));
                castSessionRef.current = null;
                setStatus(hasAccess ? "access-ready" : "idle");
            }
        },
        [ua, hasAccess]
    );

    // шаг 3 — отцепиться от комнаты, но не отзывать права
    const disconnectFromRoom = useCallback(async () => {
        const s = castSessionRef.current;
        if (!s) return;
        try {
            await s.bye();
        } catch {
            /* no-op */
        } finally {
            castSessionRef.current = null;
            setStatus(hasAccess ? "access-ready" : "idle");
        }
    }, [hasAccess]);

    // шаг 4 — полностью остановить доступ
    const stopAccess = useCallback(() => {
        const s = castSessionRef.current;
        if (s) {
            try {
                s.bye();
            } catch {}
        }
        castSessionRef.current = null;

        const src = sourceStreamRef.current;
        if (src) {
            try {
                src.getTracks().forEach((t) => t.stop());
            } catch {}
        }
        sourceStreamRef.current = null;
        setPreviewStream(null);
        setHasAccess(false);
        setStatus("idle");
    }, []);

    // если UA пропал (WebRTC выключили) — подчистим всё
    useEffect(() => {
        if (!ua) {
            stopAccess();
        }
    }, [ua, stopAccess]);

    useEffect(
        () => () => {
            stopAccess();
        },
        [stopAccess]
    );

    return {
        status,
        error,
        hasAccess,
        previewStream,
        prepareAccessOnce,
        connectToRoom,
        disconnectFromRoom,
        stopAccess,
    };
}
