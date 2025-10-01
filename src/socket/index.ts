// src/socket.ts
import io from 'socket.io-client';
import { store } from '../redux/store';
import {
    setFsReport,
    setFsStatus,
    setMonitorData,
    setFsReasons,
    setSessionKey,
    setHa1,
    setTurnCreds
} from '../redux/operatorSlice';
import { parseMonitorData } from "../utils";

/* ================== boot ================== */
const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

const { sipLogin: rawSipLogin, fsServer: rawFsServer, worker: rawWorker } =
(container.dataset as Partial<Record<string, string>>) || {};

const fsServer = (rawFsServer || 'wwstest.glagol.ai').trim();
const sipLogin = (rawSipLogin || '1000').trim();
const worker   = (rawWorker   || '4.fs@akc24.ru').trim();

const SOCKET_URL = `wss://${fsServer}`;
export const socket = io(`${SOCKET_URL}`, { transports: ['websocket'] });

let isInitialized = false;

/* ================== auth cache & cross-tab ================== */
type AuthState = {
    sessionKey: string;
    issuedAt: number;   // ms
    expiresAt: number;  // ms
};

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_EARLY_MS = 10 * 60 * 1000; // за 10 минут до истечения
const AUTH_STORAGE_KEY = `glagol-auth::${fsServer}::${worker}`;
const AUTH_CHANNEL     = `glagol-auth::bc::${fsServer}::${worker}`;
const bc: BroadcastChannel | null =
    'BroadcastChannel' in window ? new BroadcastChannel(AUTH_CHANNEL) : null;

let refreshTimeoutId: number | undefined;
let refreshInFlight: Promise<void> | null = null;
let lastLoginAt = 0;

/** Безопасное чтение auth из localStorage */
function readAuth(): AuthState | null {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as AuthState;
        if (!parsed?.sessionKey) return null;
        return parsed;
    } catch {
        return null;
    }
}
function writeAuth(a: AuthState) {
    try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(a)); } catch {}
}
function isAuthValid(a: AuthState | null): a is AuthState {
    return !!(a && a.sessionKey && a.expiresAt > Date.now());
}

function clearRefreshTimer() {
    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
        refreshTimeoutId = undefined;
    }
}

/** Планируем автоматическое обновление ключа раз в сутки */
function scheduleAuthRefresh(a: AuthState) {
    clearRefreshTimer();
    const delay = Math.max(0, a.expiresAt - REFRESH_EARLY_MS - Date.now());
    refreshTimeoutId = window.setTimeout(() => {
        // Только одна вкладка делает refresh (lock)
        refreshAuthSingleFlight().catch(console.error);
    }, delay);
}

/** Общая процедура применения нового ключа во вкладке */
function applyAuthInThisTab(a: AuthState) {
    writeAuth(a);
    store.dispatch(setSessionKey(a.sessionKey));
    // сразу пинганём статусы, чтобы не ждать 3с
    emitStatus();
    // если включен WebRTC — подхватим свежие creds
    if (webrtcEnabled) requestHa1AndTurn();
    scheduleAuthRefresh(a);
}

/** Рассылать обновление ключа другим вкладкам */
function broadcastAuthUpdate(a: AuthState) {
    try { bc?.postMessage({ type: 'auth:update', payload: a }); } catch {}
}

/** Грациозный "lock": Web Locks API если есть, иначе просто single-flight */
async function withAuthLock<T>(fn: () => Promise<T>): Promise<T> {
    const navAny: any = navigator as any;
    const lockName = `glagol-auth::${fsServer}::${worker}`; // namespaced lock
    if (navAny?.locks?.request) {
        return await navAny.locks.request(lockName, fn);
    }
    // fallback: без настоящего лока — просто выполняем
    return await fn();
}

/** Вычисляем срок жизни: 24 часа с момента выдачи */
function makeAuthState(sessionKey: string, issuedAt = Date.now()): AuthState {
    const expiresAt = issuedAt + DAY_MS;
    return { sessionKey, issuedAt, expiresAt };
}

/** Всегда брать САМЫЙ свежий ключ перед отправками (LS → Redux) */
function getFreshKey(): string | null {
    const reduxKey = store.getState().operator.sessionKey || '';
    const a = readAuth();
    const fresh = a?.sessionKey || reduxKey || null;
    if (fresh && fresh !== reduxKey) {
        store.dispatch(setSessionKey(fresh));
    }
    return fresh;
}

/** Тихий ре-логин: только одна вкладка вызывает socket.emit('login') */
async function refreshAuthSingleFlight(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = withAuthLock(async () => {
        // может, другая вкладка уже успела обновить?
        const before = readAuth();
        if (isAuthValid(before)) return;

        // Запускаем логин — ответ придёт в socket.on('login')
        // Оборачиваем в promise, чтобы дождаться нового ключа
        await new Promise<void>((resolve, reject) => {
            const onLogin = ({ session_key }: { session_key: string }) => {
                socket.off('login', onLogin);
                lastLoginAt = Date.now();
                const auth = makeAuthState(session_key);
                applyAuthInThisTab(auth);
                broadcastAuthUpdate(auth);
                resolve();
            };
            const onDisconnect = () => {
                socket.off('login', onLogin);
                reject(new Error('Socket disconnected during auth refresh'));
            };

            socket.once('login', onLogin);
            socket.once('disconnect', onDisconnect);
            socket.emit('login', { worker });
        });
    }).finally(() => { refreshInFlight = null; });

    return refreshInFlight;
}

/** Убедиться, что ключ валиден (перелогиниться при необходимости) */
function ensureAuthFresh(): Promise<void> {
    const cached = readAuth();
    if (isAuthValid(cached)) return Promise.resolve();
    return refreshAuthSingleFlight();
}

/* ================== intervals / webrtc ================== */
let statusIntervalId: number | undefined; // ВСЕГДА активен когда есть sessionKey
let ha1IntervalId:    number | undefined; // только для WebRTC
let turnIntervalId:   number | undefined; // только для WebRTC

let webrtcEnabled = false;
const getCreds = () => store.getState().credentials;

// ----- статус (всегда) -----
const emitStatus = () => {
    const key = getFreshKey();
    const { sipLogin, worker } = getCreds();
    if (!key || !sipLogin || !worker) return;
    socket.emit('get_fs_status_once', { worker, sip_login: sipLogin, session_key: key });
};

function startStatusInterval() {
    if (statusIntervalId) return;
    emitStatus(); // сразу
    statusIntervalId = window.setInterval(emitStatus, 3000);
}

function stopStatusInterval() {
    if (statusIntervalId) {
        clearInterval(statusIntervalId);
        statusIntervalId = undefined;
    }
}

// ----- HA1/TURN (только WebRTC) -----
function requestHa1AndTurn() {
    const key = getFreshKey();
    const { sipLogin, worker } = getCreds();
    console.log('[webrtc] request ha1/turn', {
        enabled: webrtcEnabled, hasKey: !!key, sipLogin, worker
    });
    if (!webrtcEnabled) return;
    if (!key || !sipLogin || !worker) return;

    socket.emit("fs_ha1",  { session_key: key, method: "POST", sip_login: sipLogin, worker });
    socket.emit("fs_turn", { session_key: key, sip_login: sipLogin, worker });
}

function startAuthIntervals() {
    stopAuthIntervals(); // на всякий случай

    // HA1 — ~2.66 мин
    ha1IntervalId = window.setInterval(() => {
        if (!webrtcEnabled) return;
        const key = getFreshKey();
        const { sipLogin, worker } = getCreds();
        if (key && sipLogin && worker) {
            socket.emit("fs_ha1", { session_key: key, method: "POST", sip_login: sipLogin, worker });
        }
    }, 160000);

    // TURN — ~1 час
    turnIntervalId = window.setInterval(() => {
        if (!webrtcEnabled) return;
        const key = getFreshKey();
        const { sipLogin, worker } = getCreds();
        if (key && sipLogin && worker) {
            socket.emit("fs_turn", { session_key: key, sip_login: sipLogin, worker });
        }
    }, 3595000);
}

function stopAuthIntervals() {
    if (ha1IntervalId)  { clearInterval(ha1IntervalId);  ha1IntervalId  = undefined; }
    if (turnIntervalId) { clearInterval(turnIntervalId); turnIntervalId = undefined; }
}

/** ===== WebRTC подписки (вкл/выкл) — только HA1/TURN ===== */
function onHa1(data: { ha1: string }) {
    if (!webrtcEnabled) return;
    console.log('[webrtc] ha1 ok');
    store.dispatch(setHa1(data.ha1));
}
function onTurn(data: any) {
    if (!webrtcEnabled) return;
    console.log('[webrtc] turn ok');
    store.dispatch(setTurnCreds(data));
}

export function enableWebRTC() {
    if (webrtcEnabled) return;
    webrtcEnabled = true;

    socket.on("fs_ha1", onHa1);
    socket.on("fs_turn", onTurn);

    // СНАЧАЛА убеждаемся, что session_key валиден → затем просим HA1/TURN
    ensureAuthFresh()
        .then(() => { requestHa1AndTurn(); startAuthIntervals(); })
        .catch(() => { startAuthIntervals(); }); // пусть интервалы попробуют ещё раз
}

export function disableWebRTC() {
    if (!webrtcEnabled) return;
    webrtcEnabled = false;

    socket.off("fs_ha1", onHa1);
    socket.off("fs_turn", onTurn);

    stopAuthIntervals();
}

/* ================== socket events (общие) ================== */
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on("fs_status", (data: any) => {
    store.dispatch(setFsStatus(data));
});
socket.on("fs_report", (data: any) => {
    store.dispatch(setFsReport(data));
});

socket.on("monitor_projects", (data: any) => {
    store.dispatch(setMonitorData(parseMonitorData(data)));
});
socket.on('fs_reasons', (data: any) => store.dispatch(setFsReasons(data)));
socket.on('cc_fs_reasons', (data: any) => store.dispatch(setFsReasons(data)));

/**
 * Сервер присылает новый session_key только в ответ на emit('login').
 * Здесь: применяем ключ, сохраняем, рассылаем другим вкладкам, планируем refresh.
 */
socket.on('login', ({ session_key }: { session_key: string }) => {
    console.log('Получили session_key:', session_key);
    lastLoginAt = Date.now();
    const auth = makeAuthState(session_key);
    applyAuthInThisTab(auth);
    broadcastAuthUpdate(auth);

    // статус нужен в любом режиме
    startStatusInterval();

    // HA1/TURN — только если включён WebRTC
    if (webrtcEnabled) {
        requestHa1AndTurn();
        startAuthIntervals();
    }
});

socket.on('logout', (data: any) => {
    // Сервер сообщил, что ключ недействителен
    console.warn('[socket] logout:', data);

    // иногда прилетает запоздалый logout сразу после login — игнорируем единичный
    const msg = String(data?.message || '').toLowerCase();
    if (msg.includes('invalid session key') && Date.now() - lastLoginAt < 1500) {
        return;
    }

    // Гасим интервалы, чтобы не спамить старым ключом
    stopStatusInterval();
    stopAuthIntervals();
    clearRefreshTimer();

    // Если в LS уже лежит валидный ключ (обновлён другой вкладкой) — просто применим его
    const ls = readAuth();
    if (isAuthValid(ls)) {
        applyAuthInThisTab(ls);
        startStatusInterval();
        if (webrtcEnabled) requestHa1AndTurn();
        return;
    }

    // Иначе очищаем старый кэш и делаем тихий релогин (single-flight)
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
    ensureAuthFresh()
        .then(() => {
            startStatusInterval();
            if (webrtcEnabled) requestHa1AndTurn();
        })
        .catch(err => console.error('Auth refresh after logout failed:', err));
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
    // интервалы останавливаем; ключ НЕ трогаем
    stopStatusInterval();
    stopAuthIntervals();
});

/* ================== cross-tab listeners ================== */
/** Получаем обновлённый ключ от других вкладок */
if (bc) {
    bc.onmessage = (e) => {
        const { type, payload } = e.data || {};
        if (type === 'auth:update' && payload?.sessionKey) {
            applyAuthInThisTab(payload as AuthState);
            // статус гарантированно включён (если есть creds)
            startStatusInterval();
        }
    };
}

/** Резервный канал синхронизации — через storage-events */
window.addEventListener('storage', (e) => {
    if (e.key === AUTH_STORAGE_KEY && e.newValue) {
        try {
            const payload = JSON.parse(e.newValue) as AuthState;
            if (payload?.sessionKey) {
                applyAuthInThisTab(payload);
                startStatusInterval();
            }
        } catch {}
    }
});

/* ================== boot logic ================== */
/**
 * При первом появлении worker в сторе:
 * 1) пробуем взять валидный ключ из localStorage → если есть, просто используем;
 * 2) если ключа нет/просрочен → делаем login, НО только в одной вкладке (lock).
 */
store.subscribe(() => {
    const { worker: stWorker } = getCreds();
    if (!stWorker || isInitialized) return;

    isInitialized = true;

    const cached = readAuth();
    if (isAuthValid(cached)) {
        // есть живой ключ — используем без логина
        applyAuthInThisTab(cached);
        startStatusInterval();
        if (webrtcEnabled) {
            requestHa1AndTurn();
            startAuthIntervals();
        }
        return;
    }

    // Нужен новый ключ — только одна вкладка делает login
    refreshAuthSingleFlight().catch(err => {
        console.error('Auth refresh (initial) failed:', err);
    });
});
