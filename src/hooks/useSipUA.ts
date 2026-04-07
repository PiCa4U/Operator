import { useEffect, useRef, useState } from 'react';
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
import type { TurnCredentials } from '../redux/operatorSlice';
import { ToneManager } from '../telephony/ToneManager';
import { socket } from '../socket';
import { store } from '../redux/store';
import { readExternalConfig, subscribeExternalConfig, AppExternalConfig } from '../externalConfig';

export interface SipUA {
    session: Session | null; // primary session
    consultSession: Session | null;

    makeCall(target: string): Promise<void>;
    answerCall(): Promise<void>;
    hangUp(): void;

    holdCall(): Promise<void>;
    unholdCall(): Promise<void>;
    muteLocal(muted: boolean): void;

    callOperator?: (sipLogin: string | number) => Promise<void>;

    blindTransfer(target: string): Promise<void>;

    startConsultCall(target: string): Promise<void>;
    completeAttendedTransfer(): Promise<void>;
    cancelConsultCall(): Promise<void>;

    incoming: Invitation | null;
    status: SessionState | null;
    consultStatus: SessionState | null;
    consultTarget: string | null;

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
async function safePlay(ref: AnyAudioRef) { try { await ref.current?.play(); } catch {} }

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

const preferG711: SessionDescriptionHandlerModifier = (desc) => {
    if (!desc.sdp) return Promise.resolve(desc);

    const lines = desc.sdp.split(/\r\n|\n/);

    const mIdx = lines.findIndex(l => l.startsWith("m=audio "));
    if (mIdx === -1) return Promise.resolve(desc);

    const m = lines[mIdx].trim().split(/\s+/);
    const header = m.slice(0, 3);
    const pts = m.slice(3);

    // хотим, чтобы 0 и 8 (PCMU/PCMA) шли первыми, но остальные оставляем
    const preferred = ["0", "8"];
    const newPts = [
        ...preferred.filter(p => pts.includes(p)),
        ...pts.filter(p => !preferred.includes(p)),
    ];

    lines[mIdx] = [...header, ...newPts].join(" ");
    desc.sdp = lines.join("\r\n");
    if (!desc.sdp.endsWith("\r\n")) desc.sdp += "\r\n";

    return Promise.resolve(desc);
};

function extractSipHost(wsServer: string): string {
    try {
        const url = new URL(wsServer.startsWith('ws://') || wsServer.startsWith('wss://')
            ? wsServer
            : `wss://${wsServer}`);
        return url.port ? `${url.hostname}:${url.port}` : url.hostname;
    } catch {
        return '24webrtc.ru';
    }
}

const responseHasSDP = (res: any) => {
    const body = res?.message?.body ?? res?.body;
    const ctype = res?.message?.getHeader?.('Content-Type') || res?.getHeader?.('Content-Type');
    return (ctype && /sdp/i.test(ctype)) || (typeof body === 'string' && body.includes('m=audio'));
};

// Voice calls use a faster ICE profile than screen sharing.
// Screen share sessions override transport policy/timeouts in their own hooks.
const SIP_VOICE_ICE_GATHERING_TIMEOUT = 500;
const SIP_VOICE_ICE_POLICY: RTCIceTransportPolicy = "all";

function buildSipVoicePeerConnectionConfiguration(creds: TurnCredentials | null): RTCConfiguration {
    return {
        iceTransportPolicy: SIP_VOICE_ICE_POLICY,
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            creds || undefined,
        ].filter(Boolean) as RTCIceServer[],
    };
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
const { sipLogin: rawSipLogin, worker: rawWorker } =
    container.dataset as Partial<Record<string, string>>;
const sipLogin = rawSipLogin || '1000';
const worker   = rawWorker   || '4.fs@akc24.ru';

type ClearReason = 'shutdown' | 'restart';

export function useSipUA(config: {
    enabled: boolean;
    userId: string;
    ha1: string;
    wsServer: string;
    turnCreds?: TurnCredentials | null;
    onCleared?: () => void;
}): SipUA {
    const { enabled, userId, ha1, wsServer, turnCreds, onCleared } = config;
    const { sessionKey } = store.getState().operator;

    const uaRef             = useRef<UserAgent | null>(null);
    const registererRef     = useRef<Registerer | null>(null);

    // primary session = основной разговор
    const sessionRef        = useRef<Session | null>(null);

    // consult session = консультационный разговор
    const consultSessionRef = useRef<Session | null>(null);

    const localStreamRef    = useRef<MediaStream | null>(null);

    const [incoming, setIncoming] = useState<Invitation | null>(null);
    const [status,   setStatus]   = useState<SessionState | null>(null);

    const [consultStatus, setConsultStatus] = useState<SessionState | null>(null);
    const [consultTarget, setConsultTarget] = useState<string | null>(null);

    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const localAudioRef  = useRef<HTMLAudioElement | null>(null);

    const initInProgressRef    = useRef(false);
    const restartingRef        = useRef(false);
    const pendingRestartRef    = useRef(false);
    const latestTurnCredsRef   = useRef<TurnCredentials | null>(turnCreds ?? null);

    const pingTimerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
    const regListenerRef       = useRef<((st: RegistererState)=>void) | null>(null);
    const transportListenerRef = useRef<((st: TransportState)=>void) | null>(null);

    const referWaitRef = useRef<{
        resolve: () => void;
        reject: (e: any) => void;
        timeoutId: number | null;
    } | null>(null);

    // ===== AUTO PAUSE (missed / rejected incoming) =====
    const INCOMING_IGNORE_MS = 10_000;
    const IGNORE_GRACE_MS = 9000; // чтобы не ловить "клиент сам сбросил быстро"

    type PauseReason = "бездействие оператора" | "сброс вызова";

    const incomingMetaRef = useRef<{
        id: string;
        startedAt: number;
        timer: number | null;
        handled: "none" | "accepted" | "rejected";
    } | null>(null);

    const pauseSentIdsRef = useRef<Set<string>>(new Set());

    function getAuthForPause() {
        const st = store.getState();
        return {
            session_key: st.operator.sessionKey,
            worker: st.credentials.worker || worker,
            sip_login: st.credentials.sipLogin || userId,
        };
    }

    function emitPause(reason: PauseReason) {
        const { session_key, worker: w, sip_login } = getAuthForPause();
        if (!session_key || !w || !sip_login) return;

        socket.emit("change_status_fs", {
            sip_login,
            worker: w,
            session_key,
            action: "pause",
            reason,
            page: "online",
        });
    }

    function sendPauseOnce(id: string, reason: PauseReason) {
        if (!id) return;
        if (pauseSentIdsRef.current.has(id)) return;
        pauseSentIdsRef.current.add(id);
        emitPause(reason);
    }

    function clearIncomingTimer() {
        const m = incomingMetaRef.current;
        if (m?.timer != null) {
            window.clearTimeout(m.timer);
            m.timer = null;
        }
    }

    function sessionId(s: Session): string {
        return String((s as any)?.id ?? (s as any)?.request?.callId ?? "");
    }

    // мягко дожимаем REGISTER, пока не зарегистрируемся
    const regKeepaliveRef      = useRef<number | null>(null);

    const aliveRef             = useRef(true);
    useEffect(() => () => { aliveRef.current = false; }, []);

    // ToneManager с внешним конфигом
    const tonesRef   = useRef<ToneManager | null>(null);
    const extCfgRef  = useRef<AppExternalConfig>(readExternalConfig());

    useEffect(() => {
        const buildSources = (cfg: AppExternalConfig) => {
            const base = cfg.assetsBase;
            const t = cfg.tones || {};
            const pick = (k: 'ringback'|'busy'|'reorder'|'incoming') =>
                t[k] || (base ? `${base}/tones/${k}.mp3` : undefined);
            return {
                ringback: pick('ringback'),
                busy:     pick('busy'),
                reorder:  pick('reorder'),
                incoming: pick('incoming')
            };
        };

        const tm = new ToneManager({
            sources: buildSources(extCfgRef.current),
            volume:  extCfgRef.current.volume ?? 0.7
        });
        tonesRef.current = tm;

        const unsub = subscribeExternalConfig((next) => {
            extCfgRef.current = {
                assetsBase: next.assetsBase ?? extCfgRef.current.assetsBase,
                tones: { ...(extCfgRef.current.tones||{}), ...(next.tones||{}) },
                volume: typeof next.volume === 'number' ? next.volume : extCfgRef.current.volume
            };
            tm.setSources(buildSources(extCfgRef.current));
            if (typeof extCfgRef.current.volume === 'number') tm.setVolume(extCfgRef.current.volume);
        });

        return () => { tm.stopAll(); unsub(); };
    }, []);

    const wasStartedRef  = useRef(false);
    const sentDeleteRef  = useRef(false);
    useEffect(() => { if (enabled) sentDeleteRef.current = false; }, [enabled]);

    const isInCall = () =>
        !!sessionRef.current && sessionRef.current.state !== SessionState.Terminated;

    const endTonePlayedRef = useRef(false);
    const endToneUntilRef  = useRef(0);

    function playEndToneOnce(ms = 1500) {
        if (endTonePlayedRef.current) return;
        endTonePlayedRef.current = true;
        tonesRef.current?.stopAll();
        // tonesRef.current?.play('reorder');
        endToneUntilRef.current = Date.now() + ms;
        setTimeout(() => tonesRef.current?.stopAll(), ms);
    }

    function attachRemoteFromSession(s: Session | null) {
        try {
            const pc = (s?.sessionDescriptionHandler as any)?.peerConnection as
                | RTCPeerConnection
                | undefined;

            if (!pc) {
                safeSetSrcObject(remoteAudioRef, null);
                return;
            }

            const stream = new MediaStream();
            pc.getReceivers().forEach((r) => {
                if (r.track) stream.addTrack(r.track);
            });

            safeSetSrcObject(remoteAudioRef, stream);
            void safePlay(remoteAudioRef);
        } catch (e) {
            console.warn("attachRemoteFromSession failed", e);
        }
    }


    type SessionRole = "primary" | "consult";

    function bind(s: Session, role: SessionRole = "primary") {
        if (role === "primary") {
            sessionRef.current = s;
        } else {
            consultSessionRef.current = s;
        }

        endTonePlayedRef.current = false;
        endToneUntilRef.current = 0;

        (s.delegate ??= {}).onNotify = (notification: any) => {
            const body = notification?.request?.body ?? "";
            const txt = typeof body === "string" ? body : "";

            console.log("SIP NOTIFY RAW", {
                role,
                sessionId: sessionId(s),
                body: txt,
            });

            const ok = /SIP\/2\.0\s+2\d\d/i.test(txt);
            const fail = /SIP\/2\.0\s+[3456]\d\d/i.test(txt);

            const waiter = referWaitRef.current;
            if (!waiter) return;

            if (ok) {
                if (waiter.timeoutId) window.clearTimeout(waiter.timeoutId);
                referWaitRef.current = null;
                waiter.resolve();
            } else if (fail) {
                if (waiter.timeoutId) window.clearTimeout(waiter.timeoutId);
                referWaitRef.current = null;
                waiter.reject(new Error(txt || "REFER failed by NOTIFY"));
            }
        };

        (s.delegate ??= {}).onBye = () => {
            playEndToneOnce(1500);
        };

        s.stateChange.addListener((st) => {
            console.log("SIP SESSION STATE", {
                role,
                sessionId: sessionId(s),
                state: st,
            });
            if (role === "primary") {
                setStatus(st);
            } else {
                setConsultStatus(st);
            }

            const sid = sessionId(s);
            const meta = incomingMetaRef.current;
            const isThisIncoming = role === "primary" && !!meta && meta.id === sid;

            if (st === SessionState.Established) {
                if (isThisIncoming) {
                    meta.handled = "accepted";
                    clearIncomingTimer();
                }

                attachRemoteFromSession(s);
                tonesRef.current?.stopAll();
            }

            if (st === SessionState.Terminated) {
                if (isThisIncoming) {
                    clearIncomingTimer();

                    if (meta.handled === "none") {
                        const dt = Date.now() - meta.startedAt;
                        if (dt >= IGNORE_GRACE_MS) {
                            sendPauseOnce(meta.id, "бездействие оператора");
                        }
                    }

                    incomingMetaRef.current = null;
                }

                const remaining = endToneUntilRef.current - Date.now();
                if (remaining > 0) {
                    setTimeout(() => tonesRef.current?.stopAll(), remaining);
                } else {
                    tonesRef.current?.stopAll();
                }

                if (role === "primary") {
                    setIncoming(null);
                    setStatus(null);
                    sessionRef.current = null;

                    if (pendingRestartRef.current) {
                        pendingRestartRef.current = false;
                        void restartUAWith(latestTurnCredsRef.current);
                    }
                } else {
                    consultSessionRef.current = null;
                    setConsultStatus(null);
                    setConsultTarget(null);

                    // если консультация закончилась — возвращаем звук на основной звонок
                    if (sessionRef.current && sessionRef.current.state === SessionState.Established) {
                        attachRemoteFromSession(sessionRef.current);
                    }
                }
            }
        });
    }

    function waitReferNotify() {
        if (referWaitRef.current?.timeoutId) {
            window.clearTimeout(referWaitRef.current.timeoutId);
        }
        referWaitRef.current = null;

        return new Promise<void>((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                referWaitRef.current = null;
                reject(new Error("REFER timeout (NOTIFY не пришёл)"));
            }, 12000);

            referWaitRef.current = { resolve, reject, timeoutId };
        });
    }

    const blindTransfer = async (target: string) => {
        if (!enabled) return;

        const s = sessionRef.current;
        if (!s) throw new Error("Нет активной SIP-сессии");
        if (s.state !== SessionState.Established) {
            throw new Error(`Слепой перевод возможен только в Established, сейчас: ${s.state}`);
        }

        // нормализуем target: "1002" / "sip:1002" / "1002@domain"
        let v = String(target ?? "").trim();
        if (!v) throw new Error("Пустая цель перевода");

        v = v.replace(/^sip:/i, "");
        const sipHost = extractSipHost(wsServer);
        const uriStr = v.includes("@") ? `sip:${v}` : `sip:${v}@${sipHost}`;

        const targetUri = UserAgent.makeURI(uriStr);
        if (!targetUri) throw new Error(`Не удалось собрать URI из: ${uriStr}`);

        // если уже ждём NOTIFY от прошлого refer — сбросим
        const waitNotify = waitReferNotify();

        const anyS: any = s;

        // В разных версиях SIP.js бывает refer() или transfer()
        if (typeof anyS.refer === "function") {
            await anyS.refer(targetUri, {
                requestDelegate: {
                    onReject: (resp: any) => {
                        const code = resp?.message?.statusCode;
                        const reason = resp?.message?.reasonPhrase;
                        referWaitRef.current?.reject(new Error(`REFER reject ${code ?? ""} ${reason ?? ""}`));
                    },
                },
            });
        } else if (typeof anyS.transfer === "function") {
            await anyS.transfer(targetUri);
        } else {
            throw new Error("В вашей версии SIP.js нет session.refer/transfer");
        }

        // ждём NOTIFY с финальным статусом
        await waitNotify;

        // по успеху — кладём трубку на своём диалоге (как вам и сказали)
        try { s.bye(); } catch {}
    };

    const startConsultCall = async (target: string) => {
        if (!enabled) return;

        const primary = sessionRef.current;
        if (!primary) throw new Error("Нет основного SIP-разговора");
        if (primary.state !== SessionState.Established) {
            throw new Error(`Основной вызов не Established, сейчас: ${primary.state}`);
        }

        if (consultSessionRef.current && consultSessionRef.current.state !== SessionState.Terminated) {
            throw new Error("Консультационный вызов уже существует");
        }

        let v = String(target ?? "").trim();
        if (!v) throw new Error("Пустой номер консультации");

        v = v.replace(/^sip:/i, "");

        await holdCall();

        const ua = uaRef.current;
        if (!ua) {
            await unholdCall();
            throw new Error("UA не инициализирован");
        }

        const sipHost = extractSipHost(wsServer);
        const targetUri = UserAgent.makeURI(v.includes("@") ? `sip:${v}` : `sip:${v}@${sipHost}`) as URI;
        if (!targetUri) {
            await unholdCall();
            throw new Error(`Не удалось собрать URI из: ${v}`);
        }

        const inviter = new Inviter(ua, targetUri);
        bind(inviter, "consult");
        setConsultTarget(v);

        try {
            await inviter.invite({
                requestDelegate: {
                    onProgress: (response: SipResponseLite) => {
                        const status = Number(response?.message?.statusCode ?? response?.statusCode ?? 0);
                        if (status === 180) {
                            if (!responseHasSDP(response)) {
                                tonesRef.current?.play("ringback");
                            } else {
                                tonesRef.current?.stopAll();
                            }
                        } else if (status === 183) {
                            tonesRef.current?.stopAll();
                        }
                    },
                    onAccept: () => {
                        tonesRef.current?.stopAll();
                    },
                    onReject: (response: SipResponseLite) => {
                        const code = Number(response?.message?.statusCode ?? response?.statusCode ?? 0);
                        tonesRef.current?.stopAll();

                        if ([486, 600, 603].includes(code)) {
                            tonesRef.current?.play("busy");
                            setTimeout(() => tonesRef.current?.stopAll(), 2500);
                        } else if ([500, 503, 480, 408].includes(code)) {
                            setTimeout(() => tonesRef.current?.stopAll(), 2500);
                        }
                    },
                },
            });
        } catch (e) {
            consultSessionRef.current = null;
            setConsultStatus(null);
            setConsultTarget(null);
            try {
                await unholdCall();
                attachRemoteFromSession(sessionRef.current);
            } catch {}
            throw e;
        }
    };

    const cancelConsultCall = async () => {
        const consult = consultSessionRef.current;

        if (consult) {
            try {
                if (consult.state === SessionState.Established) {
                    consult.bye();
                } else {
                    consult.dispose();
                }
            } catch {}
        }

        consultSessionRef.current = null;
        setConsultStatus(null);
        setConsultTarget(null);

        const primary = sessionRef.current;
        if (primary && primary.state === SessionState.Established) {
            try {
                await unholdCall();
                attachRemoteFromSession(primary);
            } catch {}
        }
    };

    const completeAttendedTransfer = async () => {
        if (!enabled) return;

        const primary = sessionRef.current;
        const consult = consultSessionRef.current;

        if (!primary) throw new Error("Нет основного разговора");
        if (!consult) throw new Error("Нет консультационного разговора");

        if (primary.state !== SessionState.Established) {
            throw new Error(`Основной вызов не Established, сейчас: ${primary.state}`);
        }
        if (consult.state !== SessionState.Established) {
            throw new Error(`Консультационный вызов не Established, сейчас: ${consult.state}`);
        }

        const anyPrimary: any = primary;
        if (typeof anyPrimary.refer !== "function") {
            throw new Error("В вашей версии SIP.js нет session.refer()");
        }

        console.log("ATTENDED TRANSFER start", {
            primaryState: primary.state,
            consultState: consult.state,
            primaryId: sessionId(primary),
            consultId: sessionId(consult),
        });

        const waitNotify = waitReferNotify();

        await anyPrimary.refer(consult, {
            requestDelegate: {
                onReject: (resp: any) => {
                    const code = resp?.message?.statusCode;
                    const reason = resp?.message?.reasonPhrase;
                    console.log("ATTENDED TRANSFER refer reject", { code, reason, resp });
                    referWaitRef.current?.reject(
                        new Error(`REFER reject ${code ?? ""} ${reason ?? ""}`)
                    );
                },
            },
        });

        console.log("ATTENDED TRANSFER refer sent");

        await waitNotify;

        console.log("ATTENDED TRANSFER notify ok", {
            primaryStateAfterNotify: primary.state,
            consultStateAfterNotify: consult.state,
        });

        await new Promise((resolve) => setTimeout(resolve, 500));

        console.log("ATTENDED TRANSFER before consult cleanup", {
            consultStateBeforeBye: consult.state,
            consultId: sessionId(consult),
        });

        try {
            if (consult.state === SessionState.Established) {
                console.log("ATTENDED TRANSFER consult.bye()");
                await Promise.resolve(consult.bye());
            } else if (consult.state !== SessionState.Terminated) {
                console.log("ATTENDED TRANSFER consult.dispose()");
                consult.dispose();
            }
        } catch (e) {
            console.warn("consult cleanup failed", e);
        }

        setTimeout(() => {
            console.log("ATTENDED TRANSFER after consult cleanup delay", {
                consultStateAfterBye: consult.state,
                primaryStateAfterBye: primary.state,
            });

            try {
                if (consult.state !== SessionState.Terminated) {
                    console.log("ATTENDED TRANSFER consult.forceDispose()");
                    consult.dispose();
                }
            } catch (e) {
                console.warn("consult force dispose failed", e);
            }
        }, 1000);
    };

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
            reg.unregister({ all }).catch(() => resolve());
        });
    }

    function startRegKeepalive() {
        stopRegKeepalive();
        regKeepaliveRef.current = window.setInterval(() => {
            if (!enabled) return;
            const reg = registererRef.current;
            if (!reg) return;
            if (reg.state !== RegistererState.Registered && reg.state !== RegistererState.Terminated) {
                reg.register().catch(() => {});
            }
        }, 5000);
    }
    function stopRegKeepalive() {
        if (regKeepaliveRef.current != null) {
            clearInterval(regKeepaliveRef.current);
            regKeepaliveRef.current = null;
        }
    }

    async function clearUA(reason: ClearReason = 'shutdown') {
        tonesRef.current?.stopAll();
        stopRegKeepalive();

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

        if (reason === 'shutdown' && wasStartedRef.current && !sentDeleteRef.current && sessionKey) {
            sentDeleteRef.current = true;
            socket.emit('fs_ha1', { session_key: sessionKey, method: 'DELETE', sip_login: sipLogin, worker });
            onCleared?.();
        }

        setIncoming(null);
        setStatus(null);
        sessionRef.current = null;

        setConsultStatus(null);
        setConsultTarget(null);
        consultSessionRef.current = null;

        uaRef.current = null;
        registererRef.current = null;
        wasStartedRef.current = false;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        safeSetSrcObject(localAudioRef,  null);
        safeSetSrcObject(remoteAudioRef, null);

        endTonePlayedRef.current = false;
        endToneUntilRef.current  = 0;
    }

    useEffect(() => {
        if (!enabled) {
            setIncoming(null);
            setStatus(null);
            sessionRef.current = null;
        }
    }, [enabled]);

    async function initUA(creds: TurnCredentials | null) {
        if (initInProgressRef.current) return;
        initInProgressRef.current = true;

        try {
            const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = localStream;
            safeSetSrcObject(localAudioRef, localStream);

            const sipHost = extractSipHost(wsServer);
            const uri = UserAgent.makeURI(`sip:${userId}@${sipHost}`) as URI;
            const uaOptions: UserAgentOptions = {
                uri,
                authorizationUsername: userId,
                authorizationHa1: ha1,
                transportOptions: { server: wsServer, keepAliveInterval: 20000 },
                sessionDescriptionHandlerFactoryOptions: {
                    constraints: { audio: true, video: false },
                    mediaStreamFactory: () => Promise.resolve(localStream),
                    iceGatheringTimeout: SIP_VOICE_ICE_GATHERING_TIMEOUT,
                    peerConnectionConfiguration: buildSipVoicePeerConnectionConfiguration(creds),
                    modifiers: [preferG711]
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

                    const id = sessionId(inc) || String((inc as any)?.request?.callId ?? "");
                    incomingMetaRef.current = {
                        id,
                        startedAt: Date.now(),
                        timer: null,
                        handled: "none",
                    };

                    // если 10 секунд никто не нажал — шлём pause (бездействие)
                    const t = window.setTimeout(() => {
                        const m = incomingMetaRef.current;
                        if (!m || m.id !== id) return;
                        if (m.handled !== "none") return;

                        // всё ещё "звонит" (мы не приняли)
                        if (inc.state === SessionState.Initial) {
                            sendPauseOnce(id, "бездействие оператора");
                        }
                    }, INCOMING_IGNORE_MS);

                    incomingMetaRef.current.timer = t;

                    bind(inc, "primary");
                }
            };

            // keep-alive для ws
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
            wasStartedRef.current = true;
            await registerer.register();

            startRegKeepalive();

            regListenerRef.current = st => {
                if (st === RegistererState.Registered) {
                    stopRegKeepalive();
                    setTimeout(() => {
                        if (registerer.state !== RegistererState.Terminated && enabled) {
                            registerer.register().catch(() => {});
                        }
                    }, 240_000);
                } else if (st === RegistererState.Unregistered) {
                    startRegKeepalive();
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
            await clearUA('restart');
            await initUA(creds);
        } finally {
            restartingRef.current = false;
        }
    }

    useEffect(() => {
        if (!enabled) { void clearUA('shutdown'); return; }
        if (!userId || !wsServer || !turnCreds || !ha1) return;
        latestTurnCredsRef.current = turnCreds;
        if (!uaRef.current) void initUA(turnCreds);
    }, [enabled, userId, wsServer, turnCreds, ha1]);

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
        const ua  = uaRef.current;
        const reg = registererRef.current;
        if (!ua || !reg) return;

        ua.configuration.authorizationHa1 = ha1;

        if (reg.state !== RegistererState.Terminated) {
            try { reg.register().catch(() => {}); } catch {}
        }
    }, [enabled, ha1]);

    const makeCall = async (target: string) => {
        const ua = uaRef.current; if (!ua || !enabled) return;
        const sipHost = extractSipHost(wsServer);
        // ⬇️ Звоним на target, а не на себя
        const targetUri = UserAgent.makeURI(`sip:${target}@${sipHost}`) as URI;
        const inviter = new Inviter(ua, targetUri);

        bind(inviter, "primary");

        await inviter.invite({
            // sessionDescriptionHandlerModifiers: [filterG711],
            requestDelegate: {
                onProgress: (response: SipResponseLite) => {
                    const status = Number(response?.message?.statusCode ?? response?.statusCode ?? 0);
                    if (status === 180) {
                        if (!responseHasSDP(response)) {
                            tonesRef.current?.play('ringback');
                        } else {
                            tonesRef.current?.stopAll();
                        }
                    } else if (status === 183) {
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
                        // tonesRef.current?.play('reorder');
                        setTimeout(() => tonesRef.current?.stopAll(), 2500);
                    }
                },
            },
        });
    };

    const callOperator = async (sipLoginTarget: string | number) => {
        if (!enabled) return;

        // принимаем "1012", 1012, "sip:1012", "1012@domain" и т.п.
        let v = String(sipLoginTarget ?? "").trim();
        if (!v) return;

        v = v.replace(/^sip:/i, "");   // убрали "sip:"
        v = v.replace(/@.*$/, "");     // убрали домен, если вдруг есть

        // оставим цифры (и на всякий случай *#+ если у вас есть такие внутренние коды)
        const ext = v.replace(/[^\d*#+]/g, "");
        if (!ext) return;

        await makeCall(ext);
    };

    const answerCall = async (): Promise<void> => {
        if (!enabled) return;
        if (!incoming || incoming.state !== SessionState.Initial) return;
        tonesRef.current?.stopAll();
        await incoming.accept({
            // sessionDescriptionHandlerModifiers: [filterG711]
        });
    };

    // const hangUp = () => {
    //     if (!enabled) return;
    //     tonesRef.current?.stopAll();
    //
    //     const s = sessionRef.current || incoming;
    //     if (!s) return;
    //     switch (s.state) {
    //         case SessionState.Established:  s.bye(); break;
    //         case SessionState.Initial:
    //         default:                        s.dispose();
    //     }
    // };

    const hangUp = () => {
        if (!enabled) return;
        tonesRef.current?.stopAll();

        const s = sessionRef.current || incoming;
        if (!s) return;

        if (s.state === SessionState.Established) {
            try { s.bye(); } catch {}
            return;
        }

        const sid = sessionId(s);

        if (incoming && s === incoming && s.state === SessionState.Initial) {
            const meta = incomingMetaRef.current;
            if (meta && meta.id === sid) meta.handled = "rejected";

            const anyS: any = s;

            const PAUSE_DELAY_MS = 250;

            const sendPauseLater = () => {
                window.setTimeout(() => {
                    sendPauseOnce(sid, "сброс вызова");
                }, PAUSE_DELAY_MS);
            };

            try {
                if (typeof anyS.reject === "function") {
                    Promise.resolve(anyS.reject({ statusCode: 480 }))
                        .catch(() => {})
                        .finally(() => {
                            sendPauseLater();
                        });
                } else {
                    try { s.dispose(); } catch {}
                    sendPauseLater();
                }
            } catch {
                try { s.dispose(); } catch {}
                sendPauseLater();
            }

            return;
        }

        try { s.dispose(); } catch {}
    };

    // const hangUp = () => {
    //     if (!enabled) return;
    //     tonesRef.current?.stopAll();
    //
    //     const s = sessionRef.current || incoming;
    //     if (!s) return;
    //
    //     // 1) если уже разговор — bye как и было
    //     if (s.state === SessionState.Established) {
    //         s.bye();
    //         return;
    //     }
    //
    //     // 2) если это входящий и ещё "звонит" — это ОТКЛОНЕНИЕ оператором
    //     const anyS: any = s;
    //     const sid = sessionId(s);
    //
    //     if (incoming && s === incoming && s.state === SessionState.Initial) {
    //         const meta = incomingMetaRef.current;
    //         if (meta && meta.id === sid) meta.handled = "rejected";
    //
    //         // шлём перерыв "сброс вызова"
    //         // sendPauseOnce(sid, "сброс вызова");
    //
    //         // корректно отклоняем SIP
    //         if (typeof anyS.reject === "function") {
    //             anyS.reject({ statusCode: 486 }).catch(() => {});
    //         } else {
    //             s.dispose();
    //         }
    //         return;
    //     }
    const holdCall = async () => {
        if (!enabled) return;
        const s = sessionRef.current;
        if (s && (s as any).hold) {
            await (s as any).hold();
        }
    };

    const unholdCall = async () => {
        if (!enabled) return;
        const s = sessionRef.current;
        if (s && (s as any).unhold) {
            await (s as any).unhold();
            attachRemoteFromSession(s);
        }
    };

    const muteLocal = (mute: boolean) => {
        if (!enabled) return;
        const ms = localStreamRef.current;
        ms?.getAudioTracks().forEach(t => t.enabled = !mute);
    };

    return {
        session: sessionRef.current,
        consultSession: consultSessionRef.current,

        makeCall,
        answerCall,
        hangUp,
        holdCall,
        unholdCall,
        muteLocal,

        incoming,
        status,
        consultStatus,
        consultTarget,

        remoteAudioRef,
        localAudioRef,
        userAgent: uaRef.current,

        callOperator,
        blindTransfer,

        startConsultCall,
        completeAttendedTransfer,
        cancelConsultCall,
    };
}
