import io from 'socket.io-client';
import { store } from '../redux/store';
import {
    setFsReport,
    setFsStatus,
    setMonitorData,
    setFsReasons,
    setSessionKey, setHa1, setTurnCreds
} from '../redux/operatorSlice';
import { parseMonitorData } from "../utils";
import axios from "axios";


const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
const {
    sipLogin: rawSipLogin,
    fsServer: rawFsServer,
    worker: rawWorker,
} = container.dataset as Partial<Record<string, string>>;
const fsServer = rawFsServer || 'wwstest.glagol.ai';

const sipLogin = rawSipLogin || '1000';
const worker   = rawWorker   || '4.fs@akc24.ru';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
// const SOCKET_URL = `${WS_PROTOCOL}://${fsServer}:8000`;
const SOCKET_URL = `wss://${fsServer}`;


export const socket = io(`${SOCKET_URL}`, {
    transports: ['websocket'],
});


let isInitialized = false;
let statusIntervalId: number;
let ha1IntervalId: number;
let turnIntervalId: number;

const getCreds = () => store.getState().credentials;

// единожды шлёт статус с самым свежим sessionKey
const emitStatus = () => {
    const { sessionKey } = store.getState().operator;
    const { sipLogin, worker } = getCreds();
    socket.emit('get_fs_status_once', {
        worker,
        sip_login: sipLogin,
        session_key: sessionKey
    });
};

// const emitData = () => {
//     const { sessionKey } = store.getState().operator;
//     const { sipLogin, worker } = getCreds();
//     socket.emit('fs_data', {
//         // worker,
//         sip_login: sipLogin,
//         // session_key: sessionKey
//     });
// };

// async function fetchFsDataOnce() {
//     const { sipLogin } = getCreds();
//
//     try {
//         const response = await axios.get('/api/v1/fs_data', {
//             params: { sip_login: sipLogin },
//             // для SSE-эндпойнта это ничего не “закроет”,
//             // но если бэкенд сразу возвращает JSON — вы получите его здесь
//             // timeout: 5000,
//         });
//
//         const data = response.data;
//         console.log('FS_DATA (one-off):', data);
//         // здесь можно диспатчить в стор или обновлять UI
//     } catch (err) {
//         console.error('Ошибка при запросе одного раза:', err);
//     }
// }

function requestHa1AndTurn() {
    const { sessionKey } = store.getState().operator;
    if (!sessionKey || !sipLogin || !worker) return;

    socket.emit("fs_ha1", {
        session_key: sessionKey,
        sip_login: sipLogin,
        worker,
    });

    socket.emit("fs_turn", {
        session_key: sessionKey,
        sip_login: sipLogin,
        worker,
    });
}


function startIntervals() {
    // SIP-токен (HA1) — каждые 2.5 минуты
    ha1IntervalId = window.setInterval(() => {
        const { sessionKey} = store.getState().operator;
        if (sessionKey && sipLogin && worker) {
            socket.emit("fs_ha1", {
                session_key: sessionKey,
                sip_login: sipLogin,
                worker,
            });
        }
    }, 160000); // 2.66 мин

    // TURN-токен — раз в ~час
    turnIntervalId = window.setInterval(() => {
        const { sessionKey } = store.getState().operator;
        if (sessionKey && sipLogin && worker) {
            socket.emit("fs_turn", {
                session_key: sessionKey,
                sip_login: sipLogin,
                worker,
            });
        }
    }, 3595000); // чуть меньше часа
}

// обрабатываем ответ на login и запускаем поллинг
socket.on('login', ({ session_key }: { session_key: string }) => {
    console.log('Получили session_key:', session_key);
    store.dispatch(setSessionKey(session_key));

    // сразу один запрос + интервальный
    // fetchFsDataOnce()
    // Сразу же после логина отправляем оба запроса
    requestHa1AndTurn();

    // Запускаем интервалы
    startIntervals();

    emitStatus();
    statusIntervalId = window.setInterval(emitStatus, 3000);
});

socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

// подписываемся на изменения стора — когда появится worker, логинимся
store.subscribe(() => {
    const { worker } = getCreds();
    if (worker && !isInitialized) {
        isInitialized = true;
        socket.emit('login', { worker });
    }
});

// остальные обработчики без изменений
socket.on("monitor_projects", (data: any) => {
    console.log("data: ", data)
    console.log("moniotorParsedData: ", parseMonitorData(data))
    store.dispatch(setMonitorData(parseMonitorData(data)));
});
socket.on('fs_report', (data: any) => store.dispatch(setFsReport(data)));
socket.on('fs_status', (data: any) => store.dispatch(setFsStatus(data)));
socket.on('fs_reasons', (data: any) => store.dispatch(setFsReasons(data)));
socket.on('cc_fs_reasons', (data: any) => store.dispatch(setFsReasons(data)));
socket.on("fs_ha1", (data: { ha1: string }) => {
    store.dispatch(setHa1(data.ha1));
});

socket.on("fs_turn", (data: any) => {
    store.dispatch(setTurnCreds(data));
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
    clearInterval(ha1IntervalId);
    clearInterval(turnIntervalId);

    // при необходимости clearInterval(statusIntervalId);
});
