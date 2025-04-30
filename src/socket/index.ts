import  io  from 'socket.io-client';
import { store } from '../redux/store';
import {setFsReport, setFsStatus, setActiveCalls, setMonitorData, setFsReasons} from '../redux/operatorSlice';
import {getCookies, parseMonitorData} from "../utils";

export const socket = io("wss://operator.glagol.ai", {
    transports: ['websocket']
});

// Событие успешного подключения
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    const {
        sessionKey = '',
        sipLogin   = '',
        fsServer   = '',
        worker     = '',
    } = store.getState().credentials;

    const emitStatus = () => {
        socket.emit('get_fs_status_once', {
            worker: worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            room_id: store.getState().room.roomId || 'default_room',
            fs_server: fsServer,
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

// Подписка на fs_status
socket.on('fs_status', (data: any) => {
    store.dispatch(setFsStatus(data));
});

socket.on('fs_reasons', (data: any) => {
    store.dispatch(setFsReasons(data));
});


