import  io  from 'socket.io-client';
import { store } from '../redux/store';
import {
    setFsReport,
    setFsStatus,
    setActiveCalls,
    setMonitorData,
    setFsReasons,
    setSessionKey
} from '../redux/operatorSlice';
import {getCookies, parseMonitorData} from "../utils";

export const socket = io("http://45.145.66.28:8000/", {
    transports: ['websocket']
});

socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    socket.emit("login", {
        worker: 'fs@akc24.ru',
        // worker: getCookies('worker'),
    })
    const emitStatus = () => {
        const { sessionKey } = store.getState().operator
        socket.emit('get_fs_status_once', {
            worker: 'fs@akc24.ru',
            sip_login: getCookies('sip_login') || '1012',
            session_key: sessionKey,
        });
    };

    emitStatus();

    setInterval(emitStatus, 3000);

});

socket.on("monitor_projects", (data: any) => {
    const parsedData = parseMonitorData(data);

    // Нужно вызвать store.dispatch, чтобы изменить Redux-состояние
    store.dispatch(setMonitorData(parsedData));
});
// Логирование ответа на тестовое событие
socket.on('test_event_response', (data: any) => {
});

// Подписка на fs_report
socket.on('fs_report', (data: any) => {
    store.dispatch(setFsReport(data));
});

socket.on('login', (data: { session_key: string }) => {
    console.log('Received session_key:', data.session_key);
    store.dispatch(setSessionKey(data.session_key));
});
// Подписка на fs_status
socket.on('fs_status', (data: any) => {
    store.dispatch(setFsStatus(data));
});

socket.on('fs_reasons', (data: any) => {
    store.dispatch(setFsReasons(data));
});


