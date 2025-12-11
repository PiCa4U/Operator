// src/socket.ts
import io from 'socket.io-client';
import {RootState, store} from '../redux/store';
import {
    setFsReport, setFsStatus, setMonitorData, setFsReasons,
    setHa1, setTurnCreds
} from '../redux/operatorSlice';
import { parseMonitorData } from "../utils";
import Swal from "sweetalert2";

type IOSocket = ReturnType<typeof io>;
const getCreds = () => store.getState().credentials;
const getOp    = () => store.getState().operator;
let screenShareRoomId: string | null = null;
let screenSharePingIntervalId: number | undefined;

/* === чтение fsServer из data-* + нормализация хоста === */
function sanitizeHost(raw?: string | null): string | undefined {
    if (!raw) return;
    let s = String(raw).trim();
    // убираем протокол и путь, оставляем только host[:port]
    s = s.replace(/^[a-z]+:\/\//i, ''); // http(s)://, ws(s)://
    s = s.replace(/\/.*$/, '');         // всё после первого /
    s = s.replace(/^\/\//, '');         // //host -> host
    return s || undefined;
}
function readFsServerFromDOM(): string | undefined {
    const el = document.getElementById('root') as HTMLElement | null;
    if (!el) return;
    const ds = (el.dataset || {}) as Partial<Record<string, string>>;

    // возможные источники
    const candidates = [
        ds.fsServer,
        ds.chatServer,
        ds.chatApiBase,
    ];
    for (const c of candidates) {
        const host = sanitizeHost(c);
        if (host) return host;
    }
    return undefined;
}

/* === НАСТРОЙКИ “ГРЕЙСА” ДЛЯ ПЕРВОГО HA1/TURN ===
   Можно переопределять через data-атрибуты корневого элемента:
   <div id="root" data-ha1-grace-ms="3000" data-ha1-grace-jitter-ms="2000" ... />
   По умолчанию: base=3000 мс, jitter=2000 мс → фактическая задержка 3–5 c. */
function readNumberFromDataset(key: string, def: number): number {
    const el = document.getElementById('root') as HTMLElement | null;
    if (!el) return def;
    const raw = (el.dataset as any)?.[key];
    if (raw == null) return def;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : def;
}
const HA1_GRACE_BASE_MS   = readNumberFromDataset('ha1GraceMs', 3000);
const HA1_GRACE_JITTER_MS = readNumberFromDataset('ha1GraceJitterMs', 2000);
function graceDelayMs(): number {
    const j = HA1_GRACE_JITTER_MS > 0 ? Math.floor(Math.random() * HA1_GRACE_JITTER_MS) : 0;
    return HA1_GRACE_BASE_MS + j;
}

/**
 * Создаём сокет с autoConnect: false.
 * URL берём из Redux, если нет — из data-атрибутов DOM, если нет — дефолт.
 */
function makeSocket(): IOSocket {
    const fromRedux = sanitizeHost(getCreds().fsServer);
    const fromDOM   = readFsServerFromDOM();
    const host = (fromRedux || fromDOM || 'wwstest.glagol.ai').trim();

    const url  = `wss://${host}`;
    if (process.env.NODE_ENV !== 'production') {
        console.log('[socket] using host:', host);
    }
    return io(url, { transports: ['websocket'], autoConnect: false });
}

export const socket: IOSocket = makeSocket();

// ===== флаги состояния =====
let webrtcEnabled = false;
let statusIntervalId: number | undefined;
let ha1IntervalId: number | undefined;
let turnIntervalId: number | undefined;

// отдельный таймер на первую отложенную отправку HA1/TURN
let initialHa1TimerId: number | undefined;

/** Готовы ли к подключению: есть ключ + базовые креды (+ есть хоть какой-то host) */
function isReadyForConnect() {
    const { sessionKey } = getOp();
    const { sipLogin, worker, fsServer } = getCreds();

    // host есть, если он в Redux ИЛИ его можно прочитать из DOM.
    const hostOk = Boolean(sanitizeHost(fsServer) || readFsServerFromDOM());
    return Boolean(sessionKey && sipLogin && worker && hostOk);
}

function getCurrentRole(): "manager" | "operator" | null {
    const state = store.getState() as RootState;

    const { sipLogin } = state.credentials || {};
    const monitorUsers = state.operator?.monitorData?.monitorUsers as
        | Record<string, { type?: string }>
        | undefined;

    const user = sipLogin && monitorUsers ? monitorUsers[sipLogin] : undefined;

    // 1) пробуем взять из monitorUsers
    if (user?.type === "manager" || user?.type === "operator") {
        return user.type;
    }

    // 2) запасной вариант — то, что лежит в операторском слайсе
    const op: any = state.operator;
    const raw = op?.role ?? op?.type;
    if (raw === "manager" || raw === "operator") {
        return raw;
    }

    return null;
}

/** ---- screen_share:accept ---- */
function emitScreenShareAccept(roomId: string) {
    const { sessionKey } = getOp();
    const { worker, sipLogin } = getCreds();

    if (!sessionKey || !worker || !sipLogin) {
        if (process.env.NODE_ENV !== "production") {
            console.warn("[screen_share] cannot accept: no sessionKey/worker/sipLogin");
        }
        return;
    }

    socket.emit("screen_share:accept", {
        session_key: sessionKey,
        worker,
        sip_login: sipLogin,
        room_id: roomId,
    });
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

    // первый пинг можно отправить сразу
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

/** Опциональный публичный хелпер: завершить сессию вручную (для менеджера) */
export function stopScreenShareSession() {
    if (!screenShareRoomId) return;

    const { sessionKey } = getOp();
    const { worker } = getCreds();
    if (!sessionKey || !worker) return;
    if (!isConnected()) return;

    socket.emit("screen_share:stop", {
        session_key: sessionKey,
        worker,
        room_id: screenShareRoomId,
    });
}

/** Уже подключены? */
function isConnected() {
    return socket.connected;
}

/** Одноразовая попытка подключения, если готовы */
function ensureConnected() {
    if (!isConnected() && isReadyForConnect()) {
        try { socket.connect(); } catch {}
    }
}

/** ---- FS статус (каждые 3с) ---- */
const emitStatus = () => {
    const { sessionKey } = getOp();
    const { sipLogin, worker } = getCreds();
    if (!sessionKey || !sipLogin || !worker) return;
    if (!isConnected()) return;
    socket.emit('get_fs_status_once', { worker, sip_login: sipLogin, session_key: sessionKey });
};

function emitReconnectEvent() {
    const { sessionKey } = getOp();
    const { worker } = getCreds();

    if (!sessionKey || !worker) {
        if (process.env.NODE_ENV !== 'production') {
            console.log('[socket] skip reconnect: no sessionKey or worker');
        }
        return;
    }

    // 👇 имя евента тут то, что бек ждёт: "reconnect" / "fs_reconnect" / и т.п.
    socket.emit('reconnect', {
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
    if (statusIntervalId) { clearInterval(statusIntervalId); statusIntervalId = undefined; }
}

/** ---- HA1/TURN (только при включённом WebRTC) ---- */
function requestHa1AndTurn() {
    const { sessionKey } = getOp();
    const { sipLogin, worker } = getCreds();
    if (!webrtcEnabled) return;
    if (!sessionKey || !sipLogin || !worker) return;
    if (!isConnected()) return;
    socket.emit("fs_ha1",  { session_key: sessionKey, method: "POST", sip_login: sipLogin, worker });
    socket.emit("fs_turn", { session_key: sessionKey, sip_login: sipLogin, worker });
    // socket.emit('login', {worker})
}

/** Планирование отложенной первой отправки HA1/TURN */
function scheduleInitialHa1Turn(delayMs: number) {
    if (initialHa1TimerId) {
        clearTimeout(initialHa1TimerId);
        initialHa1TimerId = undefined;
    }
    initialHa1TimerId = window.setTimeout(() => {
        requestHa1AndTurn();
        initialHa1TimerId = undefined;
    }, Math.max(0, delayMs));
}

function startAuthIntervals() {
    stopAuthIntervals();
    // периодические запросы (после первой отложенной)
    ha1IntervalId  = window.setInterval(() => { requestHa1AndTurn(); }, 160000);
    turnIntervalId = window.setInterval(() => { requestHa1AndTurn(); }, 3595000);
}

function stopAuthIntervals() {
    if (ha1IntervalId)  { clearInterval(ha1IntervalId);  ha1IntervalId  = undefined; }
    if (turnIntervalId) { clearInterval(turnIntervalId); turnIntervalId = undefined; }
}

/** ---- WebRTC подписки на входящие ответы ---- */
function onHa1(data: { ha1: string }) { if (webrtcEnabled) store.dispatch(setHa1(data.ha1)); }
function onTurn(data: any)             { if (webrtcEnabled) store.dispatch(setTurnCreds(data)); }

/** Публичные переключатели WebRTC (используются в App.tsx) */
export function enableWebRTC() {
    if (webrtcEnabled) return;
    webrtcEnabled = true;
    socket.on("fs_ha1", onHa1);
    socket.on("fs_turn", onTurn);

    // ⬇️ Грейс перед первой отправкой, чтобы предыдущая вкладка успела сделать DELETE
    scheduleInitialHa1Turn(graceDelayMs());
    startAuthIntervals();
}

export function disableWebRTC() {
    if (!webrtcEnabled) return;
    webrtcEnabled = false;
    socket.off("fs_ha1", onHa1);
    socket.off("fs_turn", onTurn);
    stopAuthIntervals();
    if (initialHa1TimerId) { clearTimeout(initialHa1TimerId); initialHa1TimerId = undefined; }
}

socket.on("screen_share:start", (data: any) => {
    const roomId = data?.room_id || data?.room || data?.roomId;
    if (!roomId) {
        console.warn("[screen_share:start] no room_id in payload", data);
        return;
    }

    if (process.env.NODE_ENV !== "production") {
        console.log("[screen_share:start] room_id =", roomId, data);
    }

    // запускаем пинги для этой вкладки
    startScreenSharePing(roomId);

    const role = getCurrentRole();
    const isManager  = role === "manager";
    const isOperator = role === "operator" || !role; // дефолтом считаем оператором

    // 🔹 Оператор в вкладке с включённым WebRTC — сразу авто-accept
    if (isOperator && webrtcEnabled) {
        emitScreenShareAccept(roomId);
    }

    // 🔹 Менеджеру ничего не показываем (только ждём стрима)
    if (isManager && process.env.NODE_ENV !== "production") {
        console.log("[screen_share] manager got start, waiting for operator stream");
    }
});
socket.on("screen_share:error", (data: any) => {
    if (process.env.NODE_ENV !== "production") {
        console.warn("[screen_share:error]", data);
    }

    stopScreenSharePing();

    const message =
        data?.message ||
        (data?.status === "timeout"
            ? "Оператор не принял запрос на просмотр экрана."
            : "Ошибка при подключении к экрану.");

    Swal.fire({
        icon: "error",
        title: "Ошибка screen sharing",
        text: message,
    })
});

socket.on("screen_share:stop", (data: any) => {
    if (process.env.NODE_ENV !== "production") {
        console.log("[screen_share:stop]", data);
    }

    // в любом случае гасим пинги
    stopScreenSharePing();

    // 👇 определяем роль
    const role = getCurrentRole();
    const isManager = role === "manager";

    // Операторам (и непонятной роли) никаких попапов не показываем
    if (!isManager) {
        return;
    }

    const reason = data?.reason || "unknown";
    let text = "Сессия просмотра экрана завершена.";

    if (reason === "manual") {
        text = "Сессия просмотра экрана завершена менеджером.";
    } else if (reason === "ping_timeout_manager") {
        text = "Сессия завершена из-за отсутствия пингов от менеджера.";
    } else if (reason === "ping_timeout_operator") {
        text = "Сессия завершена из-за отсутствия пингов от оператора.";
    }

    void Swal.fire({
        icon: "info",
        title: "Просмотр экрана завершён",
        text,
    });
});


socket.on("screen_share:pong", (data: any) => {
    if (process.env.NODE_ENV !== "production") {
        console.log("[screen_share:pong]", data);
    }
});

/** ---- Общие подписки ---- */
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    emitReconnectEvent();
    if (getOp().sessionKey) {
        startStatusInterval();
        if (webrtcEnabled) {
            // ⬇️ и после переподключений — тоже с грейсом
            scheduleInitialHa1Turn(graceDelayMs());
            startAuthIntervals();
        }
    }
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
    stopStatusInterval();
    stopAuthIntervals();
    stopScreenSharePing();
});

socket.on("fs_status", (data: any) => store.dispatch(setFsStatus(data)));
socket.on("fs_report", (data: any) => store.dispatch(setFsReport(data)));
socket.on("monitor_projects", (data: any) => {
    store.dispatch(setMonitorData(parseMonitorData(data)))
});
socket.on('fs_reasons',    (data: any) => store.dispatch(setFsReasons(data)));
socket.on('cc_fs_reasons', (data: any) => store.dispatch(setFsReasons(data)));

/**
 * === Связка с Redux:
 */
let hadSessionKey = Boolean(getOp().sessionKey);
if (hadSessionKey) ensureConnected();

store.subscribe(() => {
    const { sessionKey } = getOp();

    if (isReadyForConnect()) {
        ensureConnected();
    }

    if (sessionKey && !hadSessionKey) {
        hadSessionKey = true;
        if (isConnected()) {
            startStatusInterval();
            if (webrtcEnabled) {
                // ⬇️ первая отправка — с грейсом, дальше уже по интервалам
                scheduleInitialHa1Turn(graceDelayMs());
                startAuthIntervals();
            }
        }
    }

    // смену fsServer во время работы не обрабатываем; при надобности — перезагрузка.
});
