import React, { useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { setRoomId } from './redux/roomSlice';
import HeaderPanel from './components/headerPanel';
import CallControlPanel from './components/callControlPanel';
import CallsDashboard from './components/callsDashboard';
import ModulesPanel from './components/modulesPanel';
import ScriptPanel from './components/scriptPanel';
import StatusPanel from './components/statusPanel';
import { socket } from "./socket";
import { getCookies, makeId } from "./utils";
import { setFsStatus } from './redux/operatorSlice';

const session_key = getCookies("session_key");
const sip_login = getCookies("sip_login");
const fs_server = getCookies("fs_server");

const App: React.FC = () => {
    const dispatch = useDispatch();

    const roomId = useMemo(() => makeId(40), []);

    useEffect(() => {
        // Подписываемся на событие 'fs_status'
        socket.on('fs_status', (msg: any) => {
            console.log('Получили fs_status:', msg);
            dispatch(setFsStatus(msg));
        });

        // При размонтировании удаляем подписку
        // return () => {
        //     socket.off('fs_status');
        // };
    }, [dispatch]);

    useEffect(() => {
        dispatch(setRoomId(roomId));
    }, [dispatch, roomId]);

    return (
        <div className="app-container">
            <HeaderPanel />
            <div style={{display: "flex", flexDirection: "row", gap: "16px"}}>
                <CallsDashboard />
                <CallControlPanel />
            </div>
            {/*<ModulesPanel />*/}
            {/*<ScriptPanel />*/}
            {/*<StatusPanel />*/}
        </div>
    );
};

export default App;
