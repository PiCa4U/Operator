// src/socket.ts
import io from 'socket.io-client';
import { store } from '../redux/store';
import {
    setFsReport,
    setFsStatus,
    setActiveCalls,
    setMonitorData,
    setFsReasons
} from '../redux/operatorSlice';
import { getCookies, parseMonitorData } from '../utils';

let socket: SocketIOClient.Socket | null = null;
let statusInterval: number | null = null;

export function initSocket(): SocketIOClient.Socket {
    if (socket) {
        return socket;
    }

    socket = io('wss://operator.glagol.ai', {
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log('Socket connected:', socket!.id);

        const {
            sessionKey = '',
            sipLogin   = '',
            fsServer   = '',
            worker     = ''
        } = store.getState().credentials;

        const emitStatus = () => {
            socket!.emit('get_fs_status_once', {
                worker,
                sip_login:   sipLogin,
                session_key: sessionKey,
                room_id:     store.getState().room.roomId || 'default_room',
                fs_server:   fsServer
            });
        };

        emitStatus();
        statusInterval = window.setInterval(emitStatus, 3000);
    });

    socket.on('disconnect', (reason: string) => {
        console.log('Socket disconnected:', reason);
        // при разрыве сокета можно очистить интервал
        if (statusInterval !== null) {
            clearInterval(statusInterval);
            statusInterval = null;
        }
    });

    // Подписки на все нужные эвенты
    socket.on('monitor_projects', (data: any) => {
        const parsed = parseMonitorData(data);
        store.dispatch(setMonitorData(parsed));
    });

    socket.on('test_event_response', (data: any) => {
        // console.log('test_event_response', data);
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

    // Если сервер отдаёт «active_calls» отдельным эвентом
    socket.on('active_calls', (data: any) => {
        store.dispatch(setActiveCalls(data));
    });

    return socket;
}

/**
 * При необходимости можно вручную разорвать соединение:
 */
export function destroySocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    if (statusInterval !== null) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
}
