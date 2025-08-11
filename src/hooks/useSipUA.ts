// src/hooks/useSipUA.ts
import {useEffect, useRef, useState} from 'react';
import {
    Invitation,
    Inviter,
    Registerer,
    RegistererState,
    Session,
    SessionDescriptionHandlerModifier,
    SessionState,
    TransportState,
    URI,
    UserAgent,
    UserAgentOptions
} from 'sip.js';
import type {TurnCredentials} from '../../../../web_phone/my-app/src/redux/operatorSlice';

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
    remoteAudioRef: React.RefObject<HTMLAudioElement>;
    localAudioRef: React.RefObject<HTMLAudioElement>;
    userAgent: UserAgent | null;
}

// Опциональный SDP-модификатор G.711
const filterG711: SessionDescriptionHandlerModifier = desc => {
    if (!desc.sdp) return Promise.resolve(desc);
    const keep = ['0','8','101'];
    const lines = desc.sdp.split(/\r?\n/);
    const mIdx = lines.findIndex(l => l.startsWith('m=audio'));
    if (mIdx !== -1) {
        const parts = lines[mIdx].split(' ');
        lines[mIdx] = [
            ...parts.slice(0,3),
            ...parts.slice(3).filter(pt => keep.includes(pt))
        ].join(' ');
    }
    desc.sdp = lines
        .filter(l => {
            const m = l.match(/^a=(?:rtpmap|fmtp):([0-9]+)/);
            return !m || keep.includes(m[1]);
        })
        .join('\r\n');
    return Promise.resolve(desc);
};

export function useSipUA(config: {
    userId: string;
    ha1: string;
    wsServer: string;
    turnCreds?: TurnCredentials | null;
}): SipUA {
    const { userId, ha1, wsServer, turnCreds } = config;

    const uaRef         = useRef<UserAgent|null>(null);
    const registererRef = useRef<Registerer|null>(null);
    const sessionRef    = useRef<Session|null>(null);

    const [incoming, setIncoming] = useState<Invitation|null>(null);
    const [status,   setStatus]   = useState<SessionState|null>(null);
        useEffect(() => console.log("incoming: ", incoming),[incoming])
    const remoteAudioRef = useRef<HTMLAudioElement>(null!);
    const localAudioRef  = useRef<HTMLAudioElement>(null!);

    // Любую сессию (Inviter или Invitation) «подключаем» к нашему UI
    function bind(s: Session) {
        sessionRef.current = s;
        s.stateChange.addListener(st => {
            setStatus(st);
            if (st === SessionState.Establishing) {
                remoteAudioRef.current.src = '/iphone-11-pro.mp3';
                remoteAudioRef.current.play().catch(()=>{});
            }
            if (st === SessionState.Established) {
                const pc = (s.sessionDescriptionHandler as any)
                    .peerConnection as RTCPeerConnection;
                const stream = new MediaStream();
                pc.getReceivers().forEach(r => r.track && stream.addTrack(r.track));
                remoteAudioRef.current.srcObject = stream;
                remoteAudioRef.current.play().catch(()=>{});
            }
            if (st === SessionState.Terminated) {
                setIncoming(null);
                setStatus(null);
                sessionRef.current = null;
            }
        });
    }

    // Инициализируем UA + регистрируемся
    useEffect(() => {
        if (!userId || !wsServer || !turnCreds) return;
        let pingTimer: ReturnType<typeof setInterval>;
        let regListener: (st: RegistererState) => void;

        async function init() {
            // 1) local media
            const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false  });
            localAudioRef.current.srcObject = localStream;

            // 2) UA options
            const uri = UserAgent.makeURI(`sip:${userId}@24webrtc.ru`) as URI;
            const uaOptions: UserAgentOptions = {
                uri,
                authorizationUsername: userId,
                authorizationHa1: ha1,
                transportOptions: {
                    server: wsServer,
                    keepAliveInterval: 20000
                },
                sessionDescriptionHandlerFactoryOptions: {
                    constraints: { audio: true, video: false },
                    mediaStreamFactory: () => Promise.resolve(localStream),
                    iceGatheringTimeout: 1000,
                    peerConnectionConfiguration: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            turnCreds!
                        ]
                    },
                    modifiers: [filterG711]
                }
            };

            const ua = new UserAgent(uaOptions);
            uaRef.current = ua;
            const registerer = new Registerer(ua, { expires: 300 });
            registererRef.current = registerer;

            // 3) входящий звонок — только сохраняем, НЕ bind
            ua.delegate = {
                onInvite: (incoming) => {
                    sessionRef.current = incoming
                    setIncoming(incoming)
                    bind(incoming)
                    console.log("Incoming call from", incoming.remoteIdentity.uri.toString());
                }
            };


            // 4) WSS keep-alive
            pingTimer = setInterval(() => {
                const ws = (ua.transport as any)._ws as WebSocket|undefined;
                if (ws?.readyState === WebSocket.OPEN) ws.send('\r\n');
            }, 20000);

            ua.transport.stateChange.addListener(st => {
                if (st === TransportState.Disconnected || st === TransportState.Disconnecting) {
                    console.warn('Transport died, restarting UA…');
                    void ua.stop().then(init);
                }
            });

            // 5) старт + регистрация
            await ua.start();
            await registerer.register();

            // 6) авто-регистрируемся каждые 4'
            regListener = st => {
                if (st === RegistererState.Registered) {
                    setTimeout(() => registerer.register().catch(console.warn), 240_000);
                }
            };
            registerer.stateChange.addListener(regListener);
        }

        void init();

        return () => {
            clearInterval(pingTimer);
            if (registererRef.current && regListener) {
                registererRef.current.stateChange.removeListener(regListener);
            }
            uaRef.current?.stop().catch(console.warn);
            registererRef.current?.unregister().catch(console.warn);
        };
    }, [userId, wsServer]);

    // Обновляем ha1 «на лету»
    useEffect(() => {
        const ua = uaRef.current, reg = registererRef.current;
        if (ua && reg) {
            ua.configuration.authorizationHa1 = ha1;
            reg.register().catch(console.warn);
        }
    }, [ha1]);

    // Исходящий звонок
    const makeCall = async (target: string) => {
        const ua = uaRef.current;
        if (!ua) return;

        const uri = UserAgent.makeURI(`sip:${target}@24webrtc.ru`) as URI;
        const inviter = new Inviter(ua, uri);

        // Если показываешь «входящий» потом, сбрось setIncoming(null)
        bind(inviter);

        // инициация звонка с G.711
        await inviter.invite({
            sessionDescriptionHandlerModifiers: [filterG711]
        });
    };

    // Ответ на входящий
    const answerCall = async (): Promise<void> => {
        if (!incoming || incoming.state !== SessionState.Initial) return;

        // 1) Принимаем звонок (возвращаемое значение void, но внутри incoming создаётся peerConnection)
        await incoming.accept({
            sessionDescriptionHandlerModifiers: [filterG711]
        });
        // 2) Навешиваем слушатели на тот же объект incoming
        // bind(incoming);

        // 3) Сбрасываем состояние «есть входящий»
        // setIncoming(null);
    };

    // Завершение или сброс звонка
    const hangUp = () => {
        if (!incoming) return
        const s = incoming;
        switch (s.state) {
            case SessionState.Established:  s.bye();    break;
            case SessionState.Initial:
            // case SessionState.Establishing: s.cancel(); break;
            default:                        s.dispose();
        }
    };

    const holdCall = async () => {
        const s = sessionRef.current;
        if (s && (s as any).hold) await (s as any).hold();
    };

    const unholdCall = async () => {
        const s = sessionRef.current;
        if (s && (s as any).unhold) await (s as any).unhold();
    };

    const muteLocal = (mute: boolean) => {
        const ms = localAudioRef.current.srcObject as MediaStream|undefined;
        ms?.getAudioTracks().forEach(t => t.enabled = !mute);
    };

    return {
        session:        sessionRef.current,
        makeCall,
        answerCall,
        hangUp,
        holdCall,
        unholdCall,
        muteLocal,
        incoming,
        status,
        remoteAudioRef,
        localAudioRef,
        userAgent:      uaRef.current
    };
}
