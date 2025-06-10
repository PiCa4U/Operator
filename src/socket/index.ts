import io from 'socket.io-client';
import { store } from '../redux/store';
import {
    setFsReport,
    setFsStatus,
    setMonitorData,
    setFsReasons,
    setSessionKey
} from '../redux/operatorSlice';
import { parseMonitorData } from "../utils";

const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

export const socket = io(`${protocol}://45.145.66.28:8000`, {
    transports: ['websocket'],
});


let isInitialized = false;       // залогинились и запустили поллинг?
let statusIntervalId: number;    // ID интервала для опроса

// всегда берём актуальные креды из стора
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

// обрабатываем ответ на login и запускаем поллинг
socket.on('login', ({ session_key }: { session_key: string }) => {
    console.log('Получили session_key:', session_key);
    store.dispatch(setSessionKey(session_key));

    // сразу один запрос + интервальный
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

socket.on('disconnect', () => {
    console.log('Socket disconnected');
    // при необходимости clearInterval(statusIntervalId);
});
