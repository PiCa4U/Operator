// src/socket.ts
import io from 'socket.io-client';
import { store } from '../redux/store';
import {
    setFsReport, setFsStatus, setMonitorData, setFsReasons,
    setHa1, setTurnCreds
} from '../redux/operatorSlice';
import { parseMonitorData } from "../utils";

type IOSocket = ReturnType<typeof io>;
const getCreds = () => store.getState().credentials;
const getOp    = () => store.getState().operator;

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

/** ---- Общие подписки ---- */
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
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
});

socket.on("fs_status", (data: any) => store.dispatch(setFsStatus(data)));
socket.on("fs_report", (data: any) => store.dispatch(setFsReport(data)));
socket.on("monitor_projects", (data: any) => store.dispatch(setMonitorData(parseMonitorData(data))));
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
