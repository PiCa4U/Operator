// src/socket.ts
import io from 'socket.io-client';
import { store } from '../redux/store';
import {
    setFsReport, setFsStatus, setMonitorData, setFsReasons,
    setSessionKey, setHa1, setTurnCreds
} from '../redux/operatorSlice';
import { parseMonitorData } from "../utils";

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

const { sipLogin: rawSipLogin, fsServer: rawFsServer, worker: rawWorker } =
    container.dataset as Partial<Record<string, string>>;
const fsServer = rawFsServer || 'wwstest.glagol.ai';
const sipLogin = rawSipLogin || '1000';
const worker   = rawWorker   || '4.fs@akc24.ru';

const SOCKET_URL = `wss://${fsServer}`;
export const socket = io(`${SOCKET_URL}`, { transports: ['websocket'] });

let isInitialized = false;

// ===== интервалы =====
let statusIntervalId: number | undefined; // <-- ВСЕГДА активен после login
let ha1IntervalId: number | undefined;    // <-- только для WebRTC
let turnIntervalId: number | undefined;   // <-- только для WebRTC

// флаг включения WebRTC-подписок
let webrtcEnabled = false;

const getCreds = () => store.getState().credentials;

// ----- статус (всегда) -----
const emitStatus = () => {
    const { sessionKey } = store.getState().operator;
    const { sipLogin, worker } = getCreds();
    if (!sessionKey || !sipLogin || !worker) return;
    socket.emit('get_fs_status_once', { worker, sip_login: sipLogin, session_key: sessionKey });
};

function startStatusInterval() {          // <-- ВСЕГДА (после login)
    if (statusIntervalId) return;
    emitStatus();                           // сразу единичный пинг
    statusIntervalId = window.setInterval(emitStatus, 3000);
}

function stopStatusInterval() {
    if (statusIntervalId) { clearInterval(statusIntervalId); statusIntervalId = undefined; }
}

// ----- HA1/TURN (только WebRTC) -----
function requestHa1AndTurn() {
    const { sessionKey } = store.getState().operator;
    if (!webrtcEnabled) return;
    if (!sessionKey || !sipLogin || !worker) return;

    socket.emit("fs_ha1", { session_key: sessionKey, sip_login: sipLogin, worker });
    socket.emit("fs_turn", { session_key: sessionKey, sip_login: sipLogin, worker });
}

function startAuthIntervals() {
    stopAuthIntervals(); // на всякий случай

    // HA1 — ~2.66 мин
    ha1IntervalId = window.setInterval(() => {
        if (!webrtcEnabled) return;
        const { sessionKey } = store.getState().operator;
        if (sessionKey && sipLogin && worker) {
            socket.emit("fs_ha1", { session_key: sessionKey, sip_login: sipLogin, worker });
        }
    }, 160000);

    // TURN — ~1 час
    turnIntervalId = window.setInterval(() => {
        if (!webrtcEnabled) return;
        const { sessionKey } = store.getState().operator;
        if (sessionKey && sipLogin && worker) {
            socket.emit("fs_turn", { session_key: sessionKey, sip_login: sipLogin, worker });
        }
    }, 3595000);
}

function stopAuthIntervals() {
    if (ha1IntervalId)  { clearInterval(ha1IntervalId);  ha1IntervalId  = undefined; }
    if (turnIntervalId) { clearInterval(turnIntervalId); turnIntervalId = undefined; }
}

/** ===== WebRTC подписки (вкл/выкл) — только HA1/TURN ===== */
function onHa1(data: { ha1: string }) { if (webrtcEnabled) store.dispatch(setHa1(data.ha1)); }
function onTurn(data: any)             { if (webrtcEnabled) store.dispatch(setTurnCreds(data)); }

export function enableWebRTC() {
    if (webrtcEnabled) return;
    webrtcEnabled = true;

    socket.on("fs_ha1", onHa1);
    socket.on("fs_turn", onTurn);

    requestHa1AndTurn();
    startAuthIntervals();
}

export function disableWebRTC() {
    if (!webrtcEnabled) return;
    webrtcEnabled = false;

    socket.off("fs_ha1", onHa1);
    socket.off("fs_turn", onTurn);

    stopAuthIntervals();
}

/** ===== Общие (в любом режиме) ===== */
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on("fs_status", (data: any) => {  // <-- всегда слушаем
    store.dispatch(setFsStatus(data));
});
socket.on("fs_report", (data: any) => {  // <-- всегда слушаем
    store.dispatch(setFsReport(data));
});

socket.on("monitor_projects", (data: any) => {
    store.dispatch(setMonitorData(parseMonitorData(data)));
});
socket.on('fs_reasons', (data: any) => store.dispatch(setFsReasons(data)));
socket.on('cc_fs_reasons', (data: any) => store.dispatch(setFsReasons(data)));

socket.on('login', ({ session_key }: { session_key: string }) => {
    console.log('Получили session_key:', session_key);
    store.dispatch(setSessionKey(session_key));

    // статус нужен в любом режиме
    startStatusInterval();

    // HA1/TURN — только если включён WebRTC
    if (webrtcEnabled) {
        requestHa1AndTurn();
        startAuthIntervals();
    }
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
    // статус можно остановить (при reconnect запустится заново после login)
    stopStatusInterval();
    stopAuthIntervals();
});

// логинимся, когда в сторе появится worker (один раз)
store.subscribe(() => {
    const { worker } = getCreds();
    if (worker && !isInitialized) {
        isInitialized = true;
        socket.emit('login', { worker });
    }
});
