import  io  from 'socket.io-client';
import { store } from '../redux/store';
import { setFsReport, setFsStatus, setActiveCalls } from '../redux/operatorSlice';
import {getCookies} from "../utils";

export const socket = io("wss://operator.glagol.ai", {
    transports: ['websocket']
});

// Событие успешного подключения
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);

    const emitStatus = () => {
        socket.emit('get_fs_status_once', {
            worker: getCookies('worker'),
            sip_login: getCookies('sip_login') || '1012',
            session_key: getCookies('session_key'),
            room_id: store.getState().room.roomId || 'default_room',
            fs_server: getCookies('fs_server'),
        });
    };

    emitStatus();

    setInterval(emitStatus, 3000);
});


// Логирование ответа на тестовое событие
socket.on('test_event_response', (data: any) => {
    console.log('Получили ответ на тестовое событие:', data);
});

// Подписка на fs_report
socket.on('fs_report', (data: any) => {
    console.log('Получили fs_report:', data);
    store.dispatch(setFsReport(data));
});

// Подписка на fs_status
socket.on('fs_status', (data: any) => {
    console.log('Получили fs_status:', data);
    store.dispatch(setFsStatus(data));
});

// Если нужны другие события:
// socket.on('some_calls_event', (data: any) => {
//     console.log('Получили some_calls_event:', data);
//     store.dispatch(setActiveCalls(data));
// });

