import React, {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import Swal from "sweetalert2";
import { useDispatch, useSelector } from "react-redux";

import { socket } from "../../../../socket";
import { RootState, store } from "../../../../redux/store";
import { setUserStatuses } from "../../../../redux/operatorSlice";

import { useSip } from "../../../../context/SipContext";
import { useOperatorsDirectory } from "../../../../features/signals/useOperatorsDirectory";

type OperatorItem = {
    login: string;
    name: string;
    role?: string;
    department?: string;
};

type DialplanExtensionItem = {
    id: string;
    ext: string;
    title: string;
    project_name: string;
};

function toStr(v: any) {
    return String(v ?? "").trim();
}

function sanitizeOtherUsers(msg: any): Record<string, any> {
    if (!msg) return {};
    if (Array.isArray(msg)) {
        const out: Record<string, any> = {};
        for (const it of msg) {
            const k = String(it?.sip_login ?? it?.login ?? it?.sip ?? "");
            if (!k) continue;
            out[k] = it;
        }
        return out;
    }
    if (typeof msg === "object") return msg as Record<string, any>;
    return {};
}

function otherUsersSig(obj: Record<string, any>) {
    const keys = Object.keys(obj).sort();
    return keys
        .map((k) => {
            const v = obj[k] || {};
            return `${k}:${v?.status ?? ""}|${v?.state ?? ""}|${v?.sofia_status ?? ""}`;
        })
        .join(";");
}

function normalizeOperatorsDirectory(data: any): OperatorItem[] {
    if (!data) return [];

    if (Array.isArray(data)) {
        return data
            .map((x: any) => {
                const login = toStr(x?.login || x?.sip_login || x?.sipLogin || x?.id);
                if (!login) return null;
                const name = toStr(x?.name || x?.full_name || x?.title) || login;
                return {
                    login,
                    name,
                    role: toStr(x?.role) || undefined,
                    department: toStr(x?.department) || undefined,
                } as OperatorItem;
            })
            .filter(Boolean) as OperatorItem[];
    }

    if (typeof data === "object") {
        return Object.entries(data)
            .map(([k, v]: [string, any]) => {
                const login = toStr(v?.login || v?.sip_login || v?.sipLogin || k);
                if (!login) return null;

                if (typeof v === "string") {
                    const name = toStr(v) || login;
                    return { login, name } as OperatorItem;
                }

                const name = toStr(v?.name || v?.full_name || v?.title) || login;

                return {
                    login,
                    name,
                    role: toStr(v?.role) || undefined,
                    department: toStr(v?.department) || undefined,
                } as OperatorItem;
            })
            .filter(Boolean) as OperatorItem[];
    }

    return [];
}

function sortOperators(a: OperatorItem, b: OperatorItem) {
    const an = Number(a.login);
    const bn = Number(b.login);
    const aNum = Number.isFinite(an);
    const bNum = Number.isFinite(bn);
    if (aNum && bNum) return an - bn;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.name.localeCompare(b.name, "ru");
}

function isOnlineBySofia(sofiaStatus: any) {
    return String(sofiaStatus || "").includes("Registered");
}

function isReadyByFs(fsStatus: any, fsState: any) {
    const st = String(fsStatus || "");
    const state = String(fsState || "");
    return st.includes("Available") && state === "Waiting";
}

function mapFsLabel(fsStatus: any, fsState: any) {
    const st = String(fsStatus || "");
    const state = String(fsState || "");

    if (st === "Logged Out") return { text: "Выключен", color: "#f33333" };
    if (st === "On Break") return { text: "Перерыв", color: "#cba200" };

    if (state === "In a queue call" && st.includes("Available")) {
        return { text: "Активный вызов", color: "#cba200" };
    }
    if (st.includes("Available") && state === "Idle") {
        return { text: "Постобработка", color: "#cba200" };
    }
    if (st.includes("Available") && state === "Waiting") {
        return { text: "На линии", color: "#0BB918" };
    }

    return { text: st || "Обновляется", color: "#6b7280" };
}

function pickPrimaryInterCall(list: any[]) {
    const arr = (list || []).filter(Boolean);
    if (!arr.length) return null;

    const weight = (c: any) => {
        const st = String(c?.callstate ?? "").toUpperCase();
        if (st === "ACTIVE") return 30;
        if (st === "EARLY") return 20;
        return 10;
    };
    const epoch = (c: any) => Number(c?.created_epoch ?? 0) || 0;

    return [...arr].sort((a, b) => {
        const dw = weight(b) - weight(a);
        if (dw) return dw;
        return epoch(b) - epoch(a);
    })[0];
}

type Props = {
    enabled: boolean;
    currentLogin: string;
    exclude?: string[];
    style?: React.CSSProperties;
    className?: string;

    onTakeoverTransfer?: (targetLogin: string) => void | Promise<void>;

    openedPhones: any[];
    handleHold: () => void;
    isMainCallHeld: boolean;

    dialplanExtensions?: DialplanExtensionItem[];
    findProjectLabel?: (projectName: string) => string;
};

const EMPTY_STATUSES: Record<string, any> = {};

const InternalOperatorsDialer: React.FC<Props> = React.memo(
    ({
         enabled,
         currentLogin,
         exclude = [],
         style,
         className,
         onTakeoverTransfer,
         openedPhones,
         handleHold,
         isMainCallHeld,
         dialplanExtensions = [],
         findProjectLabel,
     }) => {
        const dispatch = useDispatch();

        const { worker = "" } = store.getState().credentials;
        const { sessionKey } = store.getState().operator;

        const { data: operatorDict = {} } = useOperatorsDirectory();

        const {
            enabled: webrtcEnabled,
            callOperator,
            makeCall,
            blindTransfer,

            startConsultCall,
            consultSession,
            consultStatus,
            consultTarget,

            status: sipStatus,
        } = useSip();

        const [open, setOpen] = useState(false);
        const [q, setQ] = useState("");
        const dq = useDeferredValue(q);

        const [mode] = useState<"ready" | "online">("ready");

        const [busyLogin, setBusyLogin] = useState<string | null>(null);

        const [busyKind, setBusyKind] = useState<
            "call" | "transfer" | "blind" | "extension" | null
        >(null);

        const sleep = (ms: number) =>
            new Promise<void>((resolve) => window.setTimeout(resolve, ms));

        const ensureMainCallHeld = useCallback(async () => {
            if (isMainCallHeld) return;

            handleHold();
            await sleep(250);
        }, [handleHold, isMainCallHeld]);

        const rawInterCalls = useSelector(
            (state: RootState) => (state.operator as any).interCalls
        );
        const sipEstablished = String(sipStatus || "") === "Established";

        const hasConsult = !!consultSession;
        const consultEstablished = String(consultStatus || "") === "Established";

        const interCalls: any[] = useMemo(() => {
            return Array.isArray(rawInterCalls)
                ? rawInterCalls
                : Object.values(rawInterCalls || {});
        }, [rawInterCalls]);

        const interCall = useMemo(() => pickPrimaryInterCall(interCalls), [interCalls]);
        const hasInterCall = !!interCall;

        useEffect(() => {
            if (hasInterCall) {
                setBusyLogin(null);
                setBusyKind(null);
            }
        }, [hasInterCall]);

        const userStatuses = useSelector((s: RootState) =>
            open ? s.operator.userStatuses : EMPTY_STATUSES
        );

        const lastOtherUsersSigRef = useRef<string | null>(null);

        useEffect(() => {
            if (!open) return;

            lastOtherUsersSigRef.current = null;

            const handleOtherUsers = (msg: any) => {
                const clean = sanitizeOtherUsers(msg);
                const sig = otherUsersSig(clean);
                if (sig === lastOtherUsersSigRef.current) return;
                lastOtherUsersSigRef.current = sig;

                dispatch(setUserStatuses(clean));
            };

            socket.on("other_users", handleOtherUsers);
            return () => {
                socket.off("other_users", handleOtherUsers);
            };
        }, [open, dispatch]);

        const baseList = useMemo(() => {
            return normalizeOperatorsDirectory(operatorDict)
                .filter((o) => o.login && o.login !== String(currentLogin))
                .filter((o) => !exclude.includes(String(o.login)))
                .sort(sortOperators);
        }, [operatorDict, currentLogin, exclude]);

        const enrichedList = useMemo(() => {
            return baseList
                .map((o) => {
                    const st = userStatuses?.[String(o.login)] || {};
                    const sofiaOk = isOnlineBySofia(st?.sofia_status);
                    const readyOk = isReadyByFs(st?.status, st?.state);
                    const fsLabel = mapFsLabel(st?.status, st?.state);

                    return {
                        ...o,
                        __status: st,
                        __online: sofiaOk,
                        __ready: sofiaOk && readyOk,
                        __fsLabel: fsLabel,
                    };
                })
                .filter((o: any) => {
                    if (mode === "ready") return o.__ready;
                    return o.__online;
                });
        }, [baseList, userStatuses, mode]);

        const onlineCount = useMemo(() => {
            if (!open) return null;
            let c = 0;
            for (const o of baseList) {
                const st = userStatuses?.[String(o.login)] || {};
                if (isOnlineBySofia(st?.sofia_status)) c++;
            }
            return c;
        }, [open, baseList, userStatuses]);

        const filtered = useMemo(() => {
            const needle = dq.trim().toLowerCase();
            if (!needle) return enrichedList;

            return enrichedList.filter((o: any) => {
                const login = String(o.login).toLowerCase();
                const name = String(o.name || "").toLowerCase();
                const dep = String(o.department || "").toLowerCase();

                return (
                    login.includes(needle) ||
                    name.includes(needle) ||
                    dep.includes(needle)
                );
            });
        }, [enrichedList, dq]);

        const filteredExtensions = useMemo(() => {
            const needle = dq.trim().toLowerCase();

            const sorted = [...dialplanExtensions].sort((a, b) => {
                if (a.project_name !== b.project_name) {
                    return a.project_name.localeCompare(b.project_name, "ru");
                }
                return a.title.localeCompare(b.title, "ru", { numeric: true });
            });

            if (!needle) return sorted;

            return sorted.filter((item) => {
                const title = String(item.title || "").toLowerCase();
                const ext = String(item.ext || "").toLowerCase();
                const projectLabel = String(
                    findProjectLabel?.(item.project_name) || item.project_name || ""
                ).toLowerCase();

                return (
                    title.includes(needle) ||
                    ext.includes(needle) ||
                    projectLabel.includes(needle)
                );
            });
        }, [dialplanExtensions, dq, findProjectLabel]);

        const canDialExtension = enabled && webrtcEnabled && !hasInterCall && !hasConsult;
        const canCall = enabled && webrtcEnabled && !hasInterCall && !hasConsult;

        const handleCall = useCallback(
            async (operatorLogin: string) => {
                if (!enabled) return;

                if (!webrtcEnabled) {
                    await Swal.fire({
                        icon: "info",
                        title: "Телефония выключена",
                        text: "SIP/WebRTC сейчас недоступен.",
                        timer: 1700,
                        showConfirmButton: false,
                    });
                    return;
                }

                setBusyLogin(operatorLogin);
                setBusyKind("call");

                try {
                    await ensureMainCallHeld();
                    await startConsultCall(String(operatorLogin));

                    await Swal.fire({
                        icon: "success",
                        title: "Консультация начата",
                        text: `Оператор: ${operatorLogin}`,
                        timer: 1200,
                        showConfirmButton: false,
                    });
                } catch (e: any) {
                    console.error(e);
                    await Swal.fire({
                        icon: "error",
                        title: "Не удалось начать консультацию",
                        text: String(e?.message || e),
                    });
                } finally {
                    setBusyLogin(null);
                    setBusyKind(null);
                }
            },
            [enabled, webrtcEnabled, startConsultCall, ensureMainCallHeld]
        );

        const canTransfer =
            enabled &&
            !hasInterCall &&
            (
                (webrtcEnabled && typeof blindTransfer === "function" && sipEstablished) ||
                !!onTakeoverTransfer
            );

        const handleTransfer = useCallback(
            async (operatorLogin: string) => {
                if (!enabled) return;

                setBusyLogin(operatorLogin);

                const doBlind =
                    webrtcEnabled &&
                    typeof blindTransfer === "function" &&
                    sipEstablished;

                try {
                    await ensureMainCallHeld();

                    socket.emit("transfer_data", {
                        worker,
                        session_key: sessionKey,
                        target_sip_login: operatorLogin,
                        data: openedPhones,
                    });

                    if (doBlind) {
                        setBusyKind("blind");
                        await blindTransfer(operatorLogin);
                    } else {
                        if (!onTakeoverTransfer) return;
                        setBusyKind("transfer");
                        await onTakeoverTransfer(operatorLogin);
                    }

                    await Swal.fire({
                        icon: "success",
                        title: doBlind ? "Слепой перевод выполнен" : "Передача отправлена",
                        text: `Оператор: ${operatorLogin}`,
                        timer: 1100,
                        showConfirmButton: false,
                    });
                } catch (e: any) {
                    console.error(e);
                    await Swal.fire({
                        icon: "error",
                        title: doBlind
                            ? "Не удалось сделать слепой перевод"
                            : "Не удалось передать",
                        text: String(e?.message || e),
                    });
                } finally {
                    setBusyLogin(null);
                    setBusyKind(null);
                }
            },
            [
                enabled,
                webrtcEnabled,
                blindTransfer,
                sipEstablished,
                onTakeoverTransfer,
                worker,
                sessionKey,
                openedPhones,
                ensureMainCallHeld,
            ]
        );

        const handleExtensionCall = useCallback(
            async (item: DialplanExtensionItem) => {
                if (!enabled) return;

                if (!webrtcEnabled) {
                    await Swal.fire({
                        icon: "info",
                        title: "Телефония выключена",
                        text: "SIP/WebRTC сейчас недоступен.",
                        timer: 1700,
                        showConfirmButton: false,
                    });
                    return;
                }

                const busyKey = `ext:${item.id}`;
                setBusyLogin(busyKey);
                setBusyKind("extension");

                try {
                    await ensureMainCallHeld();
                    await startConsultCall(String(item.ext));

                    await Swal.fire({
                        icon: "success",
                        title: "Консультация начата",
                        text: `Добавочный: ${item.ext}`,
                        timer: 1200,
                        showConfirmButton: false,
                    });
                } catch (e: any) {
                    console.error(e);
                    await Swal.fire({
                        icon: "error",
                        title: "Не удалось начать консультацию",
                        text: String(e?.message || e),
                    });
                } finally {
                    setBusyLogin(null);
                    setBusyKind(null);
                }
            },
            [enabled, webrtcEnabled, startConsultCall, ensureMainCallHeld]
        );

        const badge = useMemo(() => {
            const s = String(sipStatus || "").toLowerCase();

            if (!webrtcEnabled) return { text: "SIP выключен", bg: "#ef4444" };
            if (s.includes("registered") || s.includes("ready")) {
                return { text: "SIP готов", bg: "#22c55e" };
            }
            if (s.includes("register") || s.includes("connecting")) {
                return { text: "SIP подключение…", bg: "#f59e0b" };
            }
            return { text: "SIP статус", bg: "#6b7280" };
        }, [webrtcEnabled, sipStatus]);

        if (!enabled) return null;
        if (hasInterCall) return null;

        return (
            <div
                className={className}
                style={{
                    marginTop: 10,
                    marginBottom: 10,
                    border: "1px solid rgba(0,0,0,.08)",
                    borderRadius: 10,
                    background: "#fff",
                    overflow: "hidden",
                    ...style,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "10px 12px",
                        background: "rgba(37, 99, 235, 0.06)",
                        borderBottom: open ? "1px solid rgba(0,0,0,.06)" : "none",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                            Внутренние номера и перевод
                        </div>

                        <span
                            style={{
                                fontSize: 12,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: badge.bg,
                                color: "#fff",
                                whiteSpace: "nowrap",
                            }}
                            title={`sipStatus: ${String(sipStatus || "")}`}
                        >
                            {badge.text}
                        </span>

                        <span style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap" }}>
                            {baseList.length} всего
                            {open && onlineCount != null ? ` · Доступно ${onlineCount}` : ""}
                        </span>
                    </div>

                    <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => setOpen((v) => !v)}
                        style={{ whiteSpace: "nowrap" }}
                    >
                        {open ? "Скрыть" : "Показать"}
                    </button>
                </div>

                {open && (
                    <div style={{ padding: 12 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                            <input
                                className="form-control"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Поиск: логин / имя / отдел / добавочный"
                                style={{ minWidth: 0 }}
                            />

                            <button
                                className="btn btn-outline-secondary"
                                onClick={() => setQ("")}
                                disabled={!q}
                                title="Очистить"
                            >
                                ✕
                            </button>
                        </div>

                        {dialplanExtensions.length > 0 && (
                            <>
                                <div
                                    style={{
                                        fontWeight: 700,
                                        fontSize: 13,
                                        marginBottom: 8,
                                        color: "#374151",
                                    }}
                                >
                                    Добавочные номера
                                </div>

                                <div
                                    style={{
                                        maxHeight: 180,
                                        overflow: "auto",
                                        border: "1px solid rgba(0,0,0,.08)",
                                        borderRadius: 10,
                                        marginBottom: 12,
                                    }}
                                >
                                    {filteredExtensions.length === 0 ? (
                                        <div style={{ padding: 12, opacity: 0.75 }}>
                                            Нет подходящих добавочных
                                        </div>
                                    ) : (
                                        filteredExtensions.map((item) => {
                                            const busyKey = `ext:${item.id}`;
                                            const isBusyThis = busyLogin === busyKey;
                                            const projectLabel =
                                                findProjectLabel?.(item.project_name) || item.project_name;

                                            return (
                                                <div
                                                    key={item.id}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        gap: 10,
                                                        padding: "10px 12px",
                                                        borderBottom: "1px solid rgba(0,0,0,.06)",
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                                                            {item.title}
                                                            <span style={{ fontWeight: 600, opacity: 0.7 }}>
                                                                {" "}· {item.ext}
                                                            </span>
                                                        </div>

                                                        <div
                                                            style={{
                                                                fontSize: 12,
                                                                opacity: 0.8,
                                                                display: "flex",
                                                                gap: 8,
                                                                alignItems: "center",
                                                            }}
                                                        >
                                                            <span>{projectLabel}</span>
                                                        </div>
                                                    </div>

                                                    <button
                                                        className="btn btn-sm btn-outline-success"
                                                        onClick={() => handleExtensionCall(item)}
                                                        disabled={!canDialExtension || !!busyLogin}
                                                        title={
                                                            canDialExtension
                                                                ? "Начать консультацию на добавочный"
                                                                : "SIP недоступен"
                                                        }
                                                        style={{ whiteSpace: "nowrap" }}
                                                    >
                                                        {isBusyThis && busyKind === "extension" ? (
                                                            <>
                                                                <span
                                                                    className="spinner-border spinner-border-sm"
                                                                    role="status"
                                                                    aria-hidden="true"
                                                                    style={{ marginRight: 8, verticalAlign: "middle" }}
                                                                />
                                                                Идёт вызов…
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span
                                                                    className="material-icons"
                                                                    style={{
                                                                        fontSize: 18,
                                                                        verticalAlign: "middle",
                                                                        marginRight: 6,
                                                                    }}
                                                                >
                                                                    call
                                                                </span>
                                                                Вызвать
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        )}

                        <div
                            style={{
                                fontWeight: 700,
                                fontSize: 13,
                                marginBottom: 8,
                                color: "#374151",
                            }}
                        >
                            Операторы
                        </div>

                        <div
                            style={{
                                maxHeight: 260,
                                overflow: "auto",
                                border: "1px solid rgba(0,0,0,.08)",
                                borderRadius: 10,
                            }}
                        >
                            {filtered.length === 0 ? (
                                <div style={{ padding: 12, opacity: 0.75 }}>
                                    {mode === "ready" ? "Нет готовых операторов" : "Нет онлайн операторов"}
                                </div>
                            ) : (
                                filtered.map((o: any) => {
                                    const isBusyThis = busyLogin === o.login;

                                    return (
                                        <div
                                            key={o.login}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 10,
                                                padding: "10px 12px",
                                                borderBottom: "1px solid rgba(0,0,0,.06)",
                                            }}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                                                    {o.name}
                                                    <span style={{ fontWeight: 600, opacity: 0.7 }}>
                                                        {" "}· {o.login}
                                                    </span>
                                                </div>

                                                <div
                                                    style={{
                                                        fontSize: 12,
                                                        opacity: 0.8,
                                                        display: "flex",
                                                        gap: 8,
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <span style={{ color: o.__fsLabel?.color }}>
                                                        {o.__fsLabel?.text}
                                                    </span>

                                                    {(o.department || o.role) && (
                                                        <span
                                                            style={{
                                                                opacity: 0.7,
                                                                whiteSpace: "nowrap",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                            }}
                                                        >
                                                            {o.department ? o.department : ""}
                                                            {o.department && o.role ? " · " : ""}
                                                            {o.role ? o.role : ""}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                {canTransfer && (
                                                    <button
                                                        className="btn btn-sm btn-outline-primary"
                                                        onClick={() => handleTransfer(o.login)}
                                                        disabled={!canTransfer || !!busyLogin}
                                                        title="Передать активный разговор этому оператору"
                                                        style={{ whiteSpace: "nowrap" }}
                                                    >
                                                        {isBusyThis && (busyKind === "transfer" || busyKind === "blind") ? (
                                                            <>
                                                                <span
                                                                    className="spinner-border spinner-border-sm"
                                                                    role="status"
                                                                    aria-hidden="true"
                                                                    style={{ marginRight: 8, verticalAlign: "middle" }}
                                                                />
                                                                {busyKind === "blind" ? "Перевод…" : "Передача…"}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span
                                                                    className="material-icons"
                                                                    style={{
                                                                        fontSize: 18,
                                                                        verticalAlign: "middle",
                                                                        marginRight: 6,
                                                                    }}
                                                                >
                                                                    call_split
                                                                </span>
                                                                Передать
                                                            </>
                                                        )}
                                                    </button>
                                                )}

                                                <button
                                                    className="btn btn-sm btn-outline-success"
                                                    onClick={() => handleCall(o.login)}
                                                    disabled={!canCall || !!busyLogin}
                                                    title={canCall ? "Позвонить" : "SIP недоступен"}
                                                    style={{ whiteSpace: "nowrap" }}
                                                >
                                                    {isBusyThis && busyKind === "call" ? (
                                                        <>
                                                            <span
                                                                className="spinner-border spinner-border-sm"
                                                                role="status"
                                                                aria-hidden="true"
                                                                style={{ marginRight: 8, verticalAlign: "middle" }}
                                                            />
                                                            Идёт вызов…
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span
                                                                className="material-icons"
                                                                style={{
                                                                    fontSize: 18,
                                                                    verticalAlign: "middle",
                                                                    marginRight: 6,
                                                                }}
                                                            >
                                                                call
                                                            </span>
                                                            Вызвать
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {!webrtcEnabled && (
                            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                                Вызов недоступен: SIP/WebRTC выключен.
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }
);

export default InternalOperatorsDialer;