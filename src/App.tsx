import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { RootState, store } from "./redux/store";
import { SipProvider, useSip } from "./context/SipContext";
import MainApp from "./components/mainApp";
import {enableWebRTC, disableWebRTC, setReconnectEnabled} from "./socket";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import axios from "axios";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ItsmGuidRoute from "./features/itsm/ItsmGuidRoute";
import { webrtcOwner } from "./webrtcOwner";
import { OperatorScreenSharePanel } from "./screenShare/OperatorScreenSharePanel";

type ScreenShareStatus = "idle" | "requesting" | "sharing" | "denied" | "error";

type PhoneMode = "softphone" | "webrtc";

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({
                                                                             label,
                                                                             value,
                                                                             mono,
                                                                         }) => (
    <div
        style={{
            display: "grid",
            gridTemplateColumns: "160px 1fr",
            gap: 8,
            padding: "4px 0",
        }}
    >
        <div style={{ color: "#6c757d" }}>{label}:</div>
        <div
            style={{
                fontWeight: 600,
                fontFamily: mono
                    ? "ui-monospace, SFMono-Regular, Menlo, monospace"
                    : undefined,
            }}
        >
            {value || "—"}
        </div>
    </div>
);

function OwnerBusyBridge() {
    const { enabled, incoming, status } = useSip();
    useEffect(() => {
        const busy = enabled && (Boolean(incoming) || Boolean(status));
        webrtcOwner.setBusy(busy);
    }, [enabled, incoming, status]);
    return null;
}

/* ===================== permissions ===================== */
type MicPermState = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

function useAudioInputPresence() {
    const [hasMic, setHasMic] = React.useState<boolean | null>(null);
    React.useEffect(() => {
        let cancelled = false;
        async function probe() {
            if (!navigator.mediaDevices?.enumerateDevices) {
                setHasMic(null);
                return;
            }
            try {
                const list = await navigator.mediaDevices.enumerateDevices();
                if (!cancelled) setHasMic(list.some((d) => d.kind === "audioinput"));
            } catch {
                if (!cancelled) setHasMic(null);
            }
        }
        probe();
        const handler = () => void probe();
        navigator.mediaDevices?.addEventListener?.("devicechange", handler);
        return () =>
            navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
    }, []);
    return hasMic;
}

function useMicPermission(mode: PhoneMode, isOwner: boolean) {
    const [state, setState] = React.useState<MicPermState>("unknown");
    const [error, setError] = React.useState<string | null>(null);
    const triedRef = React.useRef(false);

    React.useEffect(() => {
        let mounted = true;
        let perm: PermissionStatus | null = null;
        (async () => {
            try {
                const q = (navigator as any).permissions?.query
                    ? await (navigator as any).permissions.query({
                        name: "microphone" as PermissionName,
                    })
                    : null;
                if (!mounted) return;
                if (q) {
                    perm = q;
                    setState(q.state as MicPermState);
                    q.onchange = () => setState(q.state as MicPermState);
                } else {
                    setState("unsupported");
                }
            } catch {
                setState("unsupported");
            }
        })();
        return () => {
            mounted = false;
            if (perm) perm.onchange = null as any;
        };
    }, []);

    const request = React.useCallback(async () => {
        setError(null);
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            setState("granted");
        } catch (e: any) {
            const name = e?.name || "";
            if (name === "NotAllowedError" || name === "SecurityError")
                setState("denied");
            else if (name === "NotFoundError") setError("Микрофон не найден");
            else setError("Не удалось получить доступ к микрофону");
        }
    }, []);

    React.useEffect(() => {
        const canGUM =
            "mediaDevices" in navigator && "getUserMedia" in (navigator.mediaDevices as any);

        if (
            mode === "webrtc" &&
            isOwner &&
            !triedRef.current &&
            (state === "prompt" || state === "unsupported" || state === "unknown")
        ) {
            triedRef.current = true;
            if (canGUM) request();
            else setState("unsupported");
        }
    }, [mode, isOwner, state, request]);

    return { state, request, error };
}

/* ===================== banners ===================== */
const MicPermissionBanner: React.FC<{
    show: boolean;
    micState: MicPermState;
    hasMic: boolean | null;
    error?: string | null;
    onRequest: () => void;
}> = ({ show, micState, hasMic, error, onRequest }) => {
    const [hidden, setHidden] = React.useState(false);
    if (!show || hidden) return null;

    const main =
        micState === "denied"
            ? "Доступ к микрофону запрещён. Звонки в WebRTC могут не работать."
            : "Нужен доступ к микрофону для звонков WebRTC.";

    return (
        <div
            style={{
                background: "#fff8e1",
                borderBottom: "1px solid #ffe08a",
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
            }}
        >
            <div style={{ fontSize: 18, lineHeight: 1, marginRight: 4 }}>⚠️</div>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>WebRTC: микрофон</div>
                <div style={{ fontSize: 13 }}>
                    {main} {hasMic === false ? "Микрофон не найден. " : ""}
                    <span style={{ color: "#6c757d" }}>
            Откройте разрешения сайта и разрешите «Микрофон», затем нажмите «Проверить снова».
          </span>
                    {error ? <div style={{ color: "#b42318", marginTop: 4 }}>{error}</div> : null}
                </div>
            </div>
            <button className="btn btn-sm btn-outline-secondary" onClick={onRequest}>
                Проверить снова
            </button>
            <button className="btn btn-sm btn-link" onClick={() => setHidden(true)}>
                Скрыть
            </button>
        </div>
    );
};

const ScreenSharePermissionBanner: React.FC<{
    show: boolean;
    status: ScreenShareStatus;
    grantedOnce: boolean;
    onCheck: () => void;
}> = ({ show, status, grantedOnce, onCheck }) => {
    const [hidden, setHidden] = React.useState(false);
    if (!show || hidden) return null;

    const text = grantedOnce
        ? "Разрешение на демонстрацию экрана уже получено."
        : status === "denied"
            ? "Доступ к демонстрации экрана запрещён. Без этого WebRTC не включаем."
            : "Нужно разрешить демонстрацию экрана (хотя бы один раз), иначе WebRTC не включаем.";

    return (
        <div
            style={{
                background: "#fff8e1",
                borderBottom: "1px solid #ffe08a",
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
            }}
        >
            <div style={{ fontSize: 18, lineHeight: 1, marginRight: 4 }}>🖥️</div>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>WebRTC: демонстрация экрана</div>
                <div style={{ fontSize: 13 }}>
                    {text}{" "}
                    <span style={{ color: "#6c757d" }}>
            Нажмите «Проверить шаринг» и выберите экран/окно. Можно сразу закрыть демонстрацию — разрешение сохранится в памяти вкладки.
          </span>
                </div>
            </div>
            <button className="btn btn-sm btn-outline-secondary" onClick={onCheck}>
                Проверить шаринг
            </button>
            <button className="btn btn-sm btn-link" onClick={() => setHidden(true)}>
                Скрыть
            </button>
        </div>
    );
};

/* ===================== RootHome ===================== */
type RootHomeProps = {
    isOwner: boolean;
    mode: PhoneMode;
    setMode: (m: PhoneMode) => void;

    infoOpen: boolean;
    setInfoOpen: (v: boolean) => void;
    infoRef: React.MutableRefObject<HTMLDivElement | null>;

    name: string;
    glagol: string;
    phoneLogin: string;
    role: string;

    sipLogin: string;
    ha1: string;
    turnCreds: any;
    webrtcUrl: string;

    micState: MicPermState;
    hasMic: boolean | null;
    onRequestMic: () => void;
    micError?: string | null;

    wantWebrtc: boolean;
    hasCreds: boolean;

    /** новое */
    telephonyEnabled: boolean;
    screenStatus: ScreenShareStatus;
    screenGrantedOnce: boolean;
    onCheckScreenShare: () => void;
};

const RootHome: React.FC<RootHomeProps> = ({
                                               isOwner,
                                               mode,
                                               setMode,
                                               infoOpen,
                                               setInfoOpen,
                                               infoRef,
                                               name,
                                               glagol,
                                               phoneLogin,
                                               role,
                                               sipLogin,
                                               ha1,
                                               turnCreds,
                                               webrtcUrl,
                                               micState,
                                               hasMic,
                                               onRequestMic,
                                               micError,
                                               wantWebrtc,
                                               hasCreds,
                                               telephonyEnabled,
                                               screenStatus,
                                               screenGrantedOnce,
                                               onCheckScreenShare,
                                           }) => {

    const ModeSwitch = (
        <div style={{ display: "flex", gap: 8, padding: 8 }}>
            <button
                className={mode === "webrtc" ? "btn btn-success" : "btn btn-outline-success"}
                onClick={() => setMode("webrtc")}
            >
                WebRTC
            </button>
            <button
                className={mode === "softphone" ? "btn btn-primary" : "btn btn-outline-primary"}
                onClick={() => setMode("softphone")}
            >
                Softphone
            </button>
        </div>
    );

    return (
        <SipProvider
            // key={`${sipLogin}-${telephonyEnabled ? "on" : "off"}`}
            enabled={telephonyEnabled}
            userId={sipLogin}
            ha1={ha1 || ""}
            wsServer={webrtcUrl}
            turnCreds={turnCreds || null}
        >
            <OwnerBusyBridge />

            {/* Баннер микрофона — только владельцу в режиме webrtc */}
            <MicPermissionBanner
                show={wantWebrtc && micState !== "granted"}
                micState={micState}
                hasMic={hasMic}
                error={micError}
                onRequest={onRequestMic}
            />

            {/* ждём HA1/TURN */}
            {wantWebrtc && !hasCreds && (
                <div
                    style={{
                        background: "#eef2ff",
                        borderBottom: "1px solid rgba(0,0,0,.08)",
                        padding: "6px 16px",
                        fontSize: 13,
                    }}
                >
                    Готовим WebRTC: ждём HA1/TURN…
                </div>
            )}

            {role === "Оператор" && wantWebrtc && <OperatorScreenSharePanel />}

            {/* Верхняя панель */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                }}
            >
                <div style={{ marginLeft: 24 }}>{ModeSwitch}</div>

                {!isOwner && (
                    <button
                        className="btn btn-outline-danger"
                        onClick={async () => {
                            const ok = await webrtcOwner.claim();
                            if (ok && mode !== "webrtc") setMode("webrtc");
                        }}
                    >
                        Сделать звонковой
                    </button>
                )}

                {/* Бейдж */}
                <div
                    ref={infoRef}
                    style={{
                        marginRight: 20,
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                    }}
                    onMouseEnter={() => setInfoOpen(true)}
                    onMouseLeave={() => setInfoOpen(false)}
                >
                    <button
                        type="button"
                        className="btn btn-light"
                        onClick={() => setInfoOpen(!infoOpen)}
                        title={name}
                        aria-haspopup="dialog"
                        aria-expanded={infoOpen}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontWeight: 700,
                            borderRadius: 999,
                            padding: "6px 12px",
                            boxShadow: "0 1px 2px rgba(0,0,0,.06)",
                        }}
                    >
                        <span
                            style={{
                                maxWidth: 260,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                          {name}
                        </span>
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12" />
                            <path
                                d="M12 8.25a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-1.25 2.5a1.25 1.25 0 1 1 2.5 0v6a1.25 1.25 0 1 1-2.5 0v-6Z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>

                    {infoOpen && (
                        <div
                            role="dialog"
                            style={{
                                position: "absolute",
                                right: 0,
                                top: "calc(100% + 8px)",
                                minWidth: 280,
                                background: "#fff",
                                border: "1px solid rgba(0,0,0,.08)",
                                borderRadius: 12,
                                padding: 12,
                                boxShadow: "0 8px 24px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.06)",
                                zIndex: 1000,
                            }}
                        >
                            <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 8 }}>
                                Аккаунт
                            </div>
                            <Row label="Имя" value={name} />
                            <Row label="Glagol логин" value={glagol} mono />
                            <Row label="Логин телефонии" value={phoneLogin} mono />
                            <Row label="Роль" value={role} />
                            <div style={{ height: 4 }} />
                            <div style={{ fontSize: 11, color: "#98a2b3" }}>
                                {isOwner
                                    ? "Вы — владелец WebRTC в этой вкладке."
                                    : "Эта вкладка без WebRTC (не владелец)."}
                            </div>

                            <div style={{ marginTop: 8, fontSize: 11, color: "#98a2b3" }}>
                                Телефония:{" "}
                                <b style={{ color: telephonyEnabled ? "#067647" : "#b42318" }}>
                                    {telephonyEnabled ? "включена" : "выключена (нет разрешений)"}
                                </b>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <MainApp isOwner={isOwner} />
        </SipProvider>
    );
};

export default function App() {
    const { sipLogin = "", worker = "", glagolParent = "", webrtcUrl = "" } =
        store.getState().credentials;

    const { ha1, turnCreds } = useSelector((s: RootState) => s.operator);

    // screenShare slice (ты сказал что добавил)
    const { status: screenStatus, grantedOnce: screenGrantedOnce } =
        useSelector((s: RootState) => s.screenShare);

    const [userInfo, setUserInfo] = useState<any>({});

    const [mode, setMode] = useState<PhoneMode>(() => {
        const saved = localStorage.getItem("phone_mode") as PhoneMode | null;
        return saved === "softphone" || saved === "webrtc" ? saved : "webrtc";
    });

    const [isOwner, setIsOwner] = useState<boolean>(false);

    useEffect(() => {
        const ns = worker || sipLogin || "default";
        webrtcOwner.init(ns);
        const unsub = webrtcOwner.subscribe((owner) => setIsOwner(owner));
        return () => {
            unsub();
            if (webrtcOwner.isOwner()) webrtcOwner.release();
        };
    }, [worker, sipLogin]);

    useEffect(() => {
        localStorage.setItem("phone_mode", mode);
    }, [mode]);

    useEffect(() => () => disableWebRTC(), []);

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await axios.get("/api/v1/agents", {
                    params: { glagol_parent: glagolParent },
                });
                const matchOperator = res.data.result.find((oper: any) => oper.login === sipLogin);
                setUserInfo(matchOperator);
            } catch (err) {
                console.error("Ошибка загрузки агентов:", err);
            }
        };
        fetchAgents();
    }, [sipLogin, glagolParent]);

    const name = userInfo?.name ?? "—";
    const glagol = userInfo?.glagol_service ?? "—";
    const phoneLogin = userInfo?.login ?? "—";
    const role =
        userInfo?.type === "manager" ? "Менеджер" : "Оператор";

    const [infoOpen, setInfoOpen] = useState(false);
    const infoRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!infoRef.current) return;
            if (!infoRef.current.contains(e.target as Node)) setInfoOpen(false);
        };
        document.addEventListener("click", onDocClick);
        return () => document.removeEventListener("click", onDocClick);
    }, []);

    const hasMic = useAudioInputPresence();
    const { state: micState, request: requestMic, error: micError } = useMicPermission(mode, isOwner);

    const wantWebrtc = mode === "webrtc" && isOwner;
    const allowWebrtcBootstrap = wantWebrtc && (role !== "Оператор" || screenGrantedOnce);

    useEffect(() => {
        setReconnectEnabled(wantWebrtc);
        return () => setReconnectEnabled(false);
    }, [wantWebrtc]);

    useEffect(() => {
        if (allowWebrtcBootstrap) enableWebRTC();
        else disableWebRTC();
    }, [allowWebrtcBootstrap]);

    const hasCreds = Boolean(ha1 && turnCreds);

    const requireMic = role === "Оператор";
    const requireScreen = role === "Оператор";

    const micOk = !requireMic || micState === "granted";
    const screenOk = !requireScreen || screenGrantedOnce;

    const telephonyEnabled = wantWebrtc && hasCreds && micOk && screenOk;

    const onCheckScreenShare = React.useCallback(() => {
        window.dispatchEvent(new CustomEvent("screen_share:check_permission"));
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route path="/itsm/:guid" element={<ItsmGuidRoute />} />
                    <Route
                        path="/*"
                        element={
                            <RootHome
                                isOwner={isOwner}
                                mode={mode}
                                setMode={setMode}
                                infoOpen={infoOpen}
                                setInfoOpen={setInfoOpen}
                                infoRef={infoRef}
                                name={name}
                                glagol={glagol}
                                phoneLogin={phoneLogin}
                                role={role}
                                sipLogin={sipLogin}
                                ha1={ha1 || ""}
                                turnCreds={turnCreds || null}
                                webrtcUrl={webrtcUrl}
                                micState={micState}
                                hasMic={hasMic}
                                onRequestMic={requestMic}
                                micError={micError}
                                wantWebrtc={wantWebrtc}
                                hasCreds={hasCreds}
                                telephonyEnabled={telephonyEnabled}
                                screenStatus={screenStatus || "idle"}
                                screenGrantedOnce={screenGrantedOnce}
                                onCheckScreenShare={onCheckScreenShare}
                            />
                        }
                    />
                </Routes>
            </BrowserRouter>
        </QueryClientProvider>
    );
}
