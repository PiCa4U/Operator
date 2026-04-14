import io from "socket.io-client";
import Swal from "sweetalert2";
import { RootState, store } from "../redux/store";
import {
    setFsReasons,
    setFsReport,
    setFsStatus,
    setHa1,
    setMonitorData,
    setTurnCreds,
} from "../redux/operatorSlice";
import { parseMonitorData } from "../utils";

type IOSocket = ReturnType<typeof io>;
const getCreds = () => store.getState().credentials;
const getOp = () => store.getState().operator;

let screenShareRoomId: string | null = null;
let screenSharePingIntervalId: number | undefined;

const pickRoomId = (p?: any): string =>
    String(p?.room_id || p?.room || p?.roomId || p?.session_uuid || p?.uuid || "").trim();

function detectRole(): string | undefined {
    const state = store.getState() as RootState;
    const myLogin = String(state.credentials?.sipLogin || getCreds().sipLogin || "").trim();
    const fromMonitor =
        (state.operator as any)?.monitorData?.monitorUsers?.[myLogin]?.type;
    return fromMonitor || (state.operator as any)?.role || (state.operator as any)?.type;
}

function isManagerClient(): boolean {
    return detectRole() === "manager";
}

function isScreenShareEventForMe(p: any): boolean {
    const myLogin = String(getCreds().sipLogin || "").trim();
    if (!myLogin) return true;

    const role = detectRole();
    const mgr = String(p?.manager_login ?? p?.viewer_login ?? "").trim();
    const op  = String(p?.operator_login ?? "").trim();
    const sip = String(p?.sip_login ?? "").trim();

    if (role === "manager") {
        if (mgr) return mgr === myLogin;
        if (sip && !op) return sip === myLogin;
        return true;
    }

    if (op) return op === myLogin;
    if (sip && !mgr) return sip === myLogin;
    return true;
}

function sanitizeHost(raw?: string | null): string | undefined {
    if (!raw) return;
    let s = String(raw).trim();
    s = s.replace(/^[a-z]+:\/\//i, "");
    s = s.replace(/\/.*$/, "");
    s = s.replace(/^\/\//, "");
    return s || undefined;
}
function readFsServerFromDOM(): string | undefined {
    const el = document.getElementById("root") as HTMLElement | null;
    if (!el) return;
    const ds = (el.dataset || {}) as Partial<Record<string, string>>;
    const candidates = [ds.fsServer, ds.chatServer, ds.chatApiBase];
    for (const c of candidates) {
        const host = sanitizeHost(c);
        if (host) return host;
    }
    return undefined;
}

/* === HA1/TURN grace === */
function readNumberFromDataset(key: string, def: number): number {
    const el = document.getElementById("root") as HTMLElement | null;
    if (!el) return def;
    const raw = (el.dataset as any)?.[key];
    if (raw == null) return def;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : def;
}
const HA1_GRACE_BASE_MS = readNumberFromDataset("ha1GraceMs", 3000);
const HA1_GRACE_JITTER_MS = readNumberFromDataset("ha1GraceJitterMs", 2000);
function graceDelayMs(): number {
    const j = HA1_GRACE_JITTER_MS > 0 ? Math.floor(Math.random() * HA1_GRACE_JITTER_MS) : 0;
    return HA1_GRACE_BASE_MS + j;
}

function makeSocket(): IOSocket {
    const fromRedux = sanitizeHost(getCreds().fsServer);

    const fromDOM = readFsServerFromDOM();
    const host = (fromRedux || fromDOM || "wwstest.glagol.ai").trim();

    const url = `wss://${host}`;

    return io(url, { transports: ["websocket"], autoConnect: false });
}

export const socket: IOSocket = makeSocket();

let webrtcEnabled = false;
let statusIntervalId: number | undefined;
let ha1IntervalId: number | undefined;
let turnIntervalId: number | undefined;
let initialAuthTimerId: number | undefined;

const afterReconnectListeners = new Set<() => void>();
const pendingHa1Resolvers = new Set<(ha1: string | null) => void>();

export function subscribeAfterReconnect(cb: () => void) {
    afterReconnectListeners.add(cb);
    return () => {
        afterReconnectListeners.delete(cb);
    };
}

function notifyAfterReconnect() {
    afterReconnectListeners.forEach((cb) => {
        try {
            cb();
        } catch (error) {
            console.error("[socket] afterReconnect listener failed", error);
        }
    });
}
const HA1_REFRESH_MS = readNumberFromDataset("ha1RefreshMs", 120_000);
const TURN_REFRESH_MS = readNumberFromDataset("turnRefreshMs", 3_300_000);

function isReadyForConnect() {
    const { sessionKey } = getOp();
    const { sipLogin, worker, fsServer } = getCreds();
    const hostOk = Boolean(sanitizeHost(fsServer) || readFsServerFromDOM());
    return Boolean(sessionKey && sipLogin && worker && hostOk);
}

function isConnected() {
    return socket.connected;
}

function ensureConnected() {
    if (!isConnected() && isReadyForConnect()) {
        try {
            socket.connect();
        } catch {}
    }
}

/** ---- screen_share:ping ---- */
function emitScreenSharePing() {
    if (!screenShareRoomId) return;

    const { sessionKey } = getOp();
    const { worker, sipLogin } = getCreds();

    if (!sessionKey || !worker || !sipLogin) return;
    if (!isConnected()) return;

    socket.emit("screen_share:ping", {
        session_key: sessionKey,
        worker,
        sip_login: sipLogin,
        room_id: screenShareRoomId,
    });
}

function startScreenSharePing(roomId: string) {
    screenShareRoomId = roomId;

    if (screenSharePingIntervalId) {
        clearInterval(screenSharePingIntervalId);
        screenSharePingIntervalId = undefined;
    }

    emitScreenSharePing();
    screenSharePingIntervalId = window.setInterval(emitScreenSharePing, 15000);
}

function stopScreenSharePing() {
    if (screenSharePingIntervalId) {
        clearInterval(screenSharePingIntervalId);
        screenSharePingIntervalId = undefined;
    }
    screenShareRoomId = null;
}

/** Публичный: завершить сессию вручную (для viewer/manager) */
export function stopScreenShareSession(roomId?: string | null) {
    const rid = String(roomId || screenShareRoomId || "").trim();
    if (!rid) return;

    const { sessionKey } = getOp();
    const { worker } = getCreds();
    if (!sessionKey || !worker) return;
    if (!isConnected()) return;

    socket.emit("screen_share:stop", {
        session_key: sessionKey,
        worker,
        room_id: rid,
    });
}

/** ---- FS статус (каждые 3с) ---- */
const emitStatus = () => {
    const { sessionKey } = getOp();
    const { sipLogin, worker } = getCreds();
    if (!sessionKey || !sipLogin || !worker) return;
    if (!isConnected()) return;
    socket.emit("get_fs_status_once", {
        worker,
        sip_login: sipLogin,
        session_key: sessionKey,
    });
};

function emitReconnectEvent() {
    const { sessionKey } = getOp();
    const { worker } = getCreds();

    if (!sessionKey || !worker) {

        return;
    }

    socket.emit("reconnect", {
        session_key: sessionKey,
        worker,
    });
}

function startStatusInterval() {
    if (statusIntervalId) return;
    emitStatus();
    statusIntervalId = window.setInterval(emitStatus, 3000);
}
function stopStatusInterval() {
    if (statusIntervalId) {
        clearInterval(statusIntervalId);
        statusIntervalId = undefined;
    }
}

/** ---- HA1/TURN (только при включённом WebRTC) ---- */
function requestHa1(): boolean {
    const { sessionKey } = getOp();
    const { sipLogin, worker } = getCreds();
    if (!webrtcEnabled) return false;
    if (!sessionKey || !sipLogin || !worker) return false;
    if (!isConnected()) return false;

    socket.emit("fs_ha1", {
        session_key: sessionKey,
        method: "POST",
        sip_login: sipLogin,
        worker,
    });
    return true;
}

function requestTurn(): boolean {
    const { sessionKey } = getOp();
    const { sipLogin, worker } = getCreds();
    if (!webrtcEnabled) return false;
    if (!sessionKey || !sipLogin || !worker) return false;
    if (!isConnected()) return false;

    socket.emit("fs_turn", {
        session_key: sessionKey,
        sip_login: sipLogin,
        worker,
    });
    // socket.emit("table_locks_all", {
    //     session_key: sessionKey,
    //     worker,
    //
    // })
    // socket.emit('login', {worker})
    return true;
}

function scheduleInitialTurn(delayMs: number) {
    if (initialAuthTimerId) {
        clearTimeout(initialAuthTimerId);
        initialAuthTimerId = undefined;
    }

    initialAuthTimerId = window.setTimeout(() => {
        requestTurn();
        initialAuthTimerId = undefined;
    }, Math.max(0, delayMs));
}

function requestInitialWebRtcCreds() {
    requestHa1();
    scheduleInitialTurn(graceDelayMs());
}

function startAuthIntervals() {
    stopAuthIntervals();

    ha1IntervalId = window.setInterval(() => requestHa1(), HA1_REFRESH_MS);

    turnIntervalId = window.setInterval(() => requestTurn(), TURN_REFRESH_MS);
}

function stopAuthIntervals() {
    if (ha1IntervalId) {
        clearInterval(ha1IntervalId);
        ha1IntervalId = undefined;
    }
    if (turnIntervalId) {
        clearInterval(turnIntervalId);
        turnIntervalId = undefined;
    }
}

let lastTurnSignature = "";
function makeTurnSignature(data: any): string {
    try {
        const username = String(data?.username ?? "");
        const credential = String(data?.credential ?? "");
        const urls = Array.isArray(data?.urls) ? data.urls.join("|") : String(data?.urls ?? "");
        return `${username}::${credential}::${urls}`;
    } catch {
        return "";
    }
}

function onHa1(data: { ha1: string }) {
    if (!webrtcEnabled) return;
    if (data?.ha1) store.dispatch(setHa1(data.ha1));
    const nextHa1 = data?.ha1 ? String(data.ha1) : null;
    pendingHa1Resolvers.forEach((resolve) => {
        try {
            resolve(nextHa1);
        } catch {}
    });
    pendingHa1Resolvers.clear();
}

function onTurn(data: any) {
    if (!webrtcEnabled) return;
    const sig = makeTurnSignature(data);
    if (sig && sig === lastTurnSignature) return;
    lastTurnSignature = sig;
    store.dispatch(setTurnCreds(data));
}

export function enableWebRTC() {
    if (webrtcEnabled) return;
    webrtcEnabled = true;

    socket.on("fs_ha1", onHa1);
    socket.on("fs_turn", onTurn);

    requestInitialWebRtcCreds();
    startAuthIntervals();

    ensureConnected();
}

export function disableWebRTC() {
    if (!webrtcEnabled) return;
    webrtcEnabled = false;

    socket.off("fs_ha1", onHa1);
    socket.off("fs_turn", onTurn);

    stopAuthIntervals();
    if (initialAuthTimerId) {
        clearTimeout(initialAuthTimerId);
        initialAuthTimerId = undefined;
    }

    pendingHa1Resolvers.forEach((resolve) => {
        try {
            resolve(null);
        } catch {}
    });
    pendingHa1Resolvers.clear();
}

export function requestHa1Now(timeoutMs = 4000): Promise<string | null> {
    if (!webrtcEnabled || !isReadyForConnect()) {
        return Promise.resolve(null);
    }

    ensureConnected();

    return new Promise((resolve) => {
        let settled = false;
        let timeoutId: number | undefined;

        const finish = (nextHa1: string | null) => {
            if (settled) return;
            settled = true;
            pendingHa1Resolvers.delete(finish);
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = undefined;
            }
            resolve(nextHa1);
        };

        pendingHa1Resolvers.add(finish);
        requestHa1();

        timeoutId = window.setTimeout(() => {
            finish(null);
        }, Math.max(0, timeoutMs));
    });
}

/** ===== screen share events ===== */
socket.on("screen_share:start", (data: any) => {
    if (!isScreenShareEventForMe(data)) return;

    const roomId = pickRoomId(data);
    if (!roomId) {
        console.warn("[screen_share:start] no room_id in payload", data);
        return;
    }


    startScreenSharePing(roomId);
});

socket.on("screen_share:error", (data: any) => {
    if (!isScreenShareEventForMe(data)) return;

    const rid = pickRoomId(data);

    if (rid && screenShareRoomId && rid !== screenShareRoomId) {
        return;
    }

    stopScreenSharePing();

    if (!isManagerClient()) return;

    const message =
        data?.message ||
        (data?.status === "timeout"
            ? "Пользователь не принял запрос на просмотр экрана."
            : "Ошибка при подключении к экрану.");

    Swal.fire({
        icon: "error",
        title: "Ошибка screen sharing",
        text: message,
    });
});

socket.on("screen_share:stop", (data: any) => {
    if (!isScreenShareEventForMe(data)) return;

    const rid = pickRoomId(data);

    if (rid && screenShareRoomId && rid !== screenShareRoomId) {
        return;
    }


    stopScreenSharePing();

    if (!isManagerClient()) return;

    const reason = data?.reason || "unknown";
    let text = "Сессия просмотра экрана завершена.";

    if (reason === "manual") text = "Сессия просмотра экрана завершена менеджером.";
    else if (reason === "ping_timeout_manager")
        text = "Сессия завершена из-за отсутствия пингов от менеджера.";
    else if (reason === "ping_timeout_operator")
        text = "Сессия завершена из-за отсутствия пингов от отправителя экрана.";

    // void Swal.fire({
    //     icon: "info",
    //     title: "Просмотр экрана завершён",
    //     text,
    // });
});

socket.on("screen_share:pong", (data: any) => {
});

let reconnectEnabled = false;

export function setReconnectEnabled(v: boolean) {
    reconnectEnabled = Boolean(v);

    if (reconnectEnabled && socket.connected) {
        emitReconnectEvent();
        notifyAfterReconnect();
    }
}

/** ---- Общие подписки ---- */
socket.on("connect", () => {
    console.log("Socket connected:", socket.id);

    if (reconnectEnabled) {
        emitReconnectEvent();
        notifyAfterReconnect();
    }

    if (getOp().sessionKey) {
        startStatusInterval();

        if (webrtcEnabled) {
            requestInitialWebRtcCreds();
            startAuthIntervals();
        }
    }
});

socket.on("disconnect", () => {
    console.log("Socket disconnected");
    stopStatusInterval();
    stopAuthIntervals();
    stopScreenSharePing();
});

// socket.on("fs_status", (data: any) => store.dispatch(setFsStatus(data)));
socket.on("fs_report", (data: any) => store.dispatch(setFsReport(data)));
socket.on("monitor_projects", (data: any) => {
    store.dispatch(setMonitorData(parseMonitorData(data)));
});
socket.on("fs_reasons", (data: any) => store.dispatch(setFsReasons(data)));
socket.on("cc_fs_reasons", (data: any) => store.dispatch(setFsReasons(data)));

/** ---- Связка с Redux ---- */
let hadSessionKey = Boolean(getOp().sessionKey);
if (hadSessionKey) ensureConnected();

store.subscribe(() => {
    const { sessionKey } = getOp();

    if (isReadyForConnect()) ensureConnected();

    if (sessionKey && !hadSessionKey) {
        hadSessionKey = true;

        if (isConnected()) {
            startStatusInterval();

            if (reconnectEnabled) emitReconnectEvent();

            if (webrtcEnabled) {
                requestInitialWebRtcCreds();
                startAuthIntervals();
            }
        }
    }
});
