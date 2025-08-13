import { useEffect, useRef, useState } from 'react';
import {
    Invitation, Inviter, Registerer, RegistererState, Session,
    SessionDescriptionHandlerModifier, SessionState, TransportState, URI,
    UserAgent, UserAgentOptions
} from 'sip.js';
import type { TurnCredentials } from '../redux/operatorSlice';
import { ToneManager } from '../telephony/ToneManager';

export interface SipUA {
    session: Session | null;
    makeCall(target: string): Promise<void>;
    answerCall(): Promise<void>;
    hangUp(): void;
    holdCall(): Promise<void>;
    unholdCall(): Promise<void>;
    muteLocal(muted: boolean): void;
    incoming: Invitation | null;
    status: SessionState | null;
    remoteAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
    localAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
    userAgent: UserAgent | null;
}
type SipResponseLite = {
    message?: { statusCode?: number; body?: string; getHeader?: (h: string) => string | undefined };
    statusCode?: number;
    body?: string;
    getHeader?: (h: string) => string | undefined;
};
type AnyAudioRef = { current: HTMLAudioElement | null };

function safeSetSrcObject(ref: AnyAudioRef, val: MediaStream | null) {
    if (ref.current) (ref.current as any).srcObject = val;
}
function safeSetSrc(ref: AnyAudioRef, url: string) {
    if (ref.current) ref.current.src = url;
}
async function safePlay(ref: AnyAudioRef) {
    try { await ref.current?.play(); } catch {}
}

// --- SDP модификатор G.711
const filterG711: SessionDescriptionHandlerModifier = desc => {
    if (!desc.sdp) return Promise.resolve(desc);
    const keep = ['0', '8', '101'];
    const lines = desc.sdp.split(/\r?\n/);
    const mIdx = lines.findIndex(l => l.startsWith('m=audio'));
    if (mIdx !== -1) {
        const parts = lines[mIdx].split(' ');
        lines[mIdx] = [...parts.slice(0, 3), ...parts.slice(3).filter(pt => keep.includes(pt))].join(' ');
    }
    desc.sdp = lines
        .filter(l => {
            const m = l.match(/^a=(?:rtpmap|fmtp):([0-9]+)/);
            return !m || keep.includes(m[1]);
        })
        .join('\r\n');
    return Promise.resolve(desc);
};

// --- Проверка: есть ли SDP
const responseHasSDP = (res: any) => {
    const body = res?.message?.body ?? res?.body;
    const ctype = res?.message?.getHeader?.('Content-Type') || res?.getHeader?.('Content-Type');
    return (ctype && /sdp/i.test(ctype)) || (typeof body === 'string' && body.includes('m=audio'));
};

export function useSipUA(config: {
    enabled: boolean;
    userId: string;
    ha1: string;
    wsServer: string;
    turnCreds?: TurnCredentials | null;
}): SipUA {
    const { enabled, userId, ha1, wsServer, turnCreds } = config;

    const uaRef = useRef<UserAgent | null>(null);
    const registererRef = useRef<Registerer | null>(null);
    const sessionRef = useRef<Session | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    const [incoming, setIncoming] = useState<Invitation | null>(null);
    const [status, setStatus] = useState<SessionState | null>(null);

    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const localAudioRef = useRef<HTMLAudioElement | null>(null);

    const initInProgressRef = useRef(false);
    const restartingRef = useRef(false);
    const pendingRestartRef = useRef(false);
    const latestTurnCredsRef = useRef<TurnCredentials | null>(turnCreds ?? null);

    const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const regListenerRef = useRef<((st: RegistererState) => void) | null>(null);
    const transportListenerRef = useRef<((st: TransportState) => void) | null>(null);

    const aliveRef = useRef(true);
    useEffect(() => () => { aliveRef.current = false; }, []);

    // --- ToneManager
    const tonesRef = useRef<ToneManager | null>(null);
    useEffect(() => {
        tonesRef.current = new ToneManager();
        return () => tonesRef.current?.stopAll();
    }, []);

    const isInCall = () =>
        !!sessionRef.current && sessionRef.current.state !== SessionState.Terminated;

    function bind(s: Session) {
        sessionRef.current = s;

        (s.delegate ??= {}).onBye = () => {
            tonesRef.current?.stopAll();
            tonesRef.current?.play('reorder');
            setTimeout(() => tonesRef.current?.stopAll(), 1500);
        };

        s.stateChange.addListener(st => {
            setStatus(st);

            if (st === SessionState.Established) {
                const pc = (s.sessionDescriptionHandler as any).peerConnection as RTCPeerConnection;
                const stream = new MediaStream();
                pc.getReceivers().forEach(r => r.track && stream.addTrack(r.track));
                safeSetSrcObject(remoteAudioRef, stream); void safePlay(remoteAudioRef);
                tonesRef.current?.stopAll();
            }

            if (st === SessionState.Terminated) {
                tonesRef.current?.stopAll();
                setIncoming(null); setStatus(null); sessionRef.current = null;
                if (pendingRestartRef.current) {
                    pendingRestartRef.current = false;
                    void restartUAWith(latestTurnCredsRef.current);
                }
            }
        });
    }

    async function unregisterAndWait(all = true) {
        const reg = registererRef.current;
        if (!reg) return;
        if (reg.state === RegistererState.Unregistered || reg.state === RegistererState.Terminated) return;

        await new Promise<void>((resolve) => {
            const onState = (st: RegistererState) => {
                if (st === RegistererState.Unregistered || st === RegistererState.Terminated) {
                    reg.stateChange.removeListener(onState);
                    resolve();
                }
            };
            reg.stateChange.addListener(onState);
            reg.unregister({ all: true }).catch(() => resolve());
        });
    }

    async function clearUA() {
        tonesRef.current?.stopAll();

        if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
        if (registererRef.current && regListenerRef.current) {
            registererRef.current.stateChange.removeListener(regListenerRef.current);
            regListenerRef.current = null;
        }
        try {
            if (uaRef.current && transportListenerRef.current) {
                uaRef.current.transport.stateChange.removeListener(transportListenerRef.current);
                transportListenerRef.current = null;
            }
        } catch {}

        try { await unregisterAndWait(true); } catch {}
        try { await uaRef.current?.stop(); } catch {}

        uaRef.current = null;
        registererRef.current = null;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        safeSetSrcObject(localAudioRef, null);
        safeSetSrcObject(remoteAudioRef, null);
    }

    async function initUA(creds: TurnCredentials | null) {
        if (initInProgressRef.current) return;
        initInProgressRef.current = true;

        try {
            const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = localStream;
            safeSetSrcObject(localAudioRef, localStream);

            const uri = UserAgent.makeURI(`sip:${userId}@24webrtc.ru`) as URI;
            const uaOptions: UserAgentOptions = {
                uri,
                authorizationUsername: userId,
                authorizationHa1: ha1,
                transportOptions: { server: wsServer, keepAliveInterval: 20000 },
                sessionDescriptionHandlerFactoryOptions: {
                    constraints: { audio: true, video: false },
                    mediaStreamFactory: () => Promise.resolve(localStream),
                    iceGatheringTimeout: 1000,
                    peerConnectionConfiguration: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            creds || undefined
                        ].filter(Boolean) as RTCIceServer[],
                    },
                    modifiers: [filterG711]
                }
            };

            const ua = new UserAgent(uaOptions);
            uaRef.current = ua;
            const registerer = new Registerer(ua, { expires: 300 });
            registererRef.current = registerer;

            ua.delegate = {
                onInvite: (inc) => {
                    sessionRef.current = inc;
                    setIncoming(inc);
                    bind(inc);
                }
            };

            pingTimerRef.current = setInterval(() => {
                const ws = (ua.transport as any)?._ws as WebSocket | undefined;
                if (ws?.readyState === WebSocket.OPEN) ws.send('\r\n');
            }, 20000);

            const onTransportState = (st: TransportState) => {
                if (!aliveRef.current || !enabled) return;
                if (st === TransportState.Disconnected && !restartingRef.current) {
                    void restartUAWith(latestTurnCredsRef.current);
                }
            };
            transportListenerRef.current = onTransportState;
            ua.transport.stateChange.addListener(onTransportState);

            await ua.start();
            await registerer.register();

            regListenerRef.current = st => {
                if (st === RegistererState.Registered) {
                    setTimeout(() => {
                        if (registerer.state !== RegistererState.Terminated && enabled) {
                            registerer.register().catch(() => {});
                        }
                    }, 240_000);
                }
            };
            registerer.stateChange.addListener(regListenerRef.current);

        } catch (err) {
            console.error('Ошибка SIP init:', err);
        } finally {
            initInProgressRef.current = false;
        }
    }

    async function restartUAWith(creds: TurnCredentials | null) {
        if (!aliveRef.current || !enabled) return;
        if (restartingRef.current) return;

        if (isInCall()) {
            pendingRestartRef.current = true;
            latestTurnCredsRef.current = creds;
            return;
        }

        restartingRef.current = true;
        try {
            await clearUA();
            await initUA(creds);
        } finally {
            restartingRef.current = false;
        }
    }

    useEffect(() => {
        if (!enabled) { void clearUA(); return; }
        if (!userId || !wsServer || !turnCreds) return;
        latestTurnCredsRef.current = turnCreds;
        if (!uaRef.current) void initUA(turnCreds);
    }, [enabled, userId, wsServer]);

    useEffect(() => {
        if (!enabled) return;
        if (!turnCreds) return;
        const same = JSON.stringify(latestTurnCredsRef.current) === JSON.stringify(turnCreds);
        if (same) return;
        latestTurnCredsRef.current = turnCreds;
        if (!uaRef.current) return;
        void restartUAWith(turnCreds);
    }, [enabled, turnCreds]);

    useEffect(() => {
        if (!enabled) return;
        const ua = uaRef.current, reg = registererRef.current;
        if (ua && reg && reg.state !== RegistererState.Terminated) {
            ua.configuration.authorizationHa1 = ha1;
            reg.register().catch(() => {});
        }
    }, [enabled, ha1]);

    const makeCall = async (target: string) => {
        const ua = uaRef.current; if (!ua || !enabled) return;

        const uri = UserAgent.makeURI(`sip:${target}@24webrtc.ru`) as URI;
        const inviter = new Inviter(ua, uri);

        bind(inviter);

        await inviter.invite({
            sessionDescriptionHandlerModifiers: [filterG711],
            requestDelegate: {
                onProgress: (response: SipResponseLite) => {
                    const status = Number(response?.message?.statusCode ?? response?.statusCode ?? 0);
                    if (status === 180) {
                        if (!responseHasSDP(response)) {
                            tonesRef.current?.play('ringback');
                        } else {
                            // 180 с SDP — ждём early media
                            tonesRef.current?.stopAll();
                        }
                    } else if (status === 183) {
                        // обычно 183 приходит с SDP
                        tonesRef.current?.stopAll();
                    }
                },
                onAccept: (_response: SipResponseLite) => {
                    tonesRef.current?.stopAll();
                },
                onReject: (response: SipResponseLite) => {
                    const code = Number(response?.message?.statusCode ?? response?.statusCode ?? 0);
                    tonesRef.current?.stopAll();
                    if ([486, 600, 603].includes(code)) {
                        tonesRef.current?.play('busy');
                        setTimeout(() => tonesRef.current?.stopAll(), 2500);
                    } else if ([500, 503, 480, 408].includes(code)) {
                        tonesRef.current?.play('reorder');
                        setTimeout(() => tonesRef.current?.stopAll(), 2500);
                    }
                },
            },
        });
    };

    const answerCall = async (): Promise<void> => {
        if (!enabled) return;
        if (!incoming || incoming.state !== SessionState.Initial) return;
        await incoming.accept({ sessionDescriptionHandlerModifiers: [filterG711] });
    };

    const hangUp = () => {
        if (!enabled) return;
        tonesRef.current?.stopAll();
        const s = sessionRef.current || incoming;
        if (!s) return;
        switch (s.state) {
            case SessionState.Established: s.bye(); break;
            case SessionState.Initial:
            default: s.dispose();
        }
    };

    const holdCall = async () => {
        if (!enabled) return;
        const s = sessionRef.current;
        if (s && (s as any).hold) await (s as any).hold();
    };

    const unholdCall = async () => {
        if (!enabled) return;
        const s = sessionRef.current;
        if (s && (s as any).unhold) await (s as any).unhold();
    };

    const muteLocal = (mute: boolean) => {
        if (!enabled) return;
        const ms = localStreamRef.current;
        ms?.getAudioTracks().forEach(t => t.enabled = !mute);
    };

    return {
        session: sessionRef.current,
        makeCall, answerCall, hangUp, holdCall, unholdCall, muteLocal,
        incoming, status,
        remoteAudioRef, localAudioRef,
        userAgent: uaRef.current
    };
}
