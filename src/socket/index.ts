// src/socket.ts
import io from 'socket.io-client';
import { store } from '../redux/store';
import {
    setFsReport,
    setFsStatus,
    setMonitorData,
    setFsReasons,
    setSessionKey
} from '../redux/operatorSlice';
import { getCookies, parseMonitorData } from "../utils";

export const socket = io("http://45.145.66.28:8000/", {
    transports: ['websocket'],
});

let isInitialized = false;       // флаг, что мы уже залогинились и запустили поллинг
let statusIntervalId: number;    // здесь сохраним ID интервала

// Вынесем emitStatus наружу
const emitStatus = () => {
    const { sessionKey } = store.getState().operator;
    socket.emit('get_fs_status_once', {
        worker: '1.fs@akc24.ru',
        sip_login: getCookies('sip_login') || '1012',
        session_key: sessionKey,
    });
};

socket.on('connect', () => {
    console.log('Socket connected:', socket.id);

    if (!isInitialized) {
        // логинимся только один раз
        socket.emit("login", {
            worker: '1.fs@akc24.ru',
        });

        // после логина (событие login) мы получим session_key и запустим поллинг
        socket.once('login', (data: { session_key: string }) => {
            console.log('Received session_key:', data.session_key);
            store.dispatch(setSessionKey(data.session_key));

            // сразу присылаем статус и стартуем интервал
            emitStatus();
            statusIntervalId = window.setInterval(emitStatus, 3000);
        });

        isInitialized = true;
    }
});

// другие события
socket.on("monitor_projects", (data: any) => {
    console.log("parsedData: ", parseMonitorData(data))
    store.dispatch(setMonitorData(parseMonitorData(data)));
});

socket.on('fs_report', (data: any) => {
    store.dispatch(setFsReport(data));
});

socket.on('fs_status', (data: any) => {
    store.dispatch(setFsStatus(data));
});

socket.on('fs_reasons', (data: any) => {
    store.dispatch(setFsReasons(data));
});

socket.on('cc_fs_reasons', (data: any) => {
    store.dispatch(setFsReasons(data));
})

// по желанию можно чистить таймер при дисконнекте
socket.on('disconnect', () => {
    console.log('Socket disconnected');
    // не удаляем интервал, чтобы после reconnect он продолжал работать
    // если же нужно, можно clearInterval(statusIntervalId);
});
