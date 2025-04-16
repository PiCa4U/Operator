import React, { useState, useMemo, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setRoomId } from './redux/roomSlice';
import HeaderPanel, { Project } from './components/headerPanel';
import CallControlPanel, { CallData } from './components/callControlPanel';
import CallsDashboard from './components/callsDashboard';
import ScriptPanel from './components/scriptPanel';
import { socket } from "./socket";
import { getCookies, makeId } from "./utils";
import { setActiveCalls, setFsStatus } from './redux/operatorSlice';
import { RootState } from './redux/store';

const App: React.FC = () => {
    const [selectedCall, setSelectedCall] = useState<CallData | null>(null);
    const [showScriptPanel, setShowScriptPanel] = useState<boolean>(false);
    const [activeCall, setActiveCall] = useState<boolean>(false);
    const [activeProjectName, setActiveProjectName] = useState<string>("")
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [postActive, setPostActive] = useState<boolean>(false);
    const [currentPage, setCurrentPage] = useState(1);

    const sessionKey = getCookies('session_key') || '';
    const sipLogin = getCookies('sip_login') || '';
    const fsServer = getCookies('fs_server') || '';
    const worker = getCookies('worker') || '';

    const dispatch = useDispatch();
    const roomId = useMemo(() => makeId(40), []);
    const activeCalls: any[] = useSelector((state: RootState) => state.operator.activeCalls);

    useEffect(()=> {
        if (postActive) {
            socket.emit('get_fs_report', {
                worker,
                session_key: sessionKey,
                sip_login: sipLogin,
                room_id: roomId,
                fs_server: fsServer,
                level: 0,
                date_range: "",
                phone_search: "",
            });
            setCurrentPage(1)
        }
    },[showScriptPanel, postActive])

    useEffect(() => {
        const handleFsDiaDes = (msg: any) => {
            console.log("fs_dia_des msg: ", msg);
            setActiveProjectName(msg.project_name);
        };

        socket.on('fs_dia_des', handleFsDiaDes);
        return () => {
            socket.off('fs_dia_des', handleFsDiaDes);
        };
    }, []);
    useEffect(() => {
        const handleFsStatus = (msg: any) => {
            dispatch(setFsStatus(msg));
            if (msg.status === "Available (On Demand)" && msg.state === "Idle") {
                setPostActive(true);
            } else if (msg.status === "Available (On Demand)" && msg.state !== "Idle") {
                setPostActive(false);
            }
        };

        const handleFsCalls = (msg: any) => {
            // console.log("fs_calls msg: ", msg);
            // const callsArray: any[] = Object.values(msg);
            // setActiveCall(callsArray.some((ac: any) => Object.keys(ac).length > 0));
            // console.log("callsArray: ", callsArray);
            // dispatch(setActiveCalls(callsArray));
        };

        socket.on('fs_status', handleFsStatus);
        socket.on('fs_calls', handleFsCalls);

        return () => {
            socket.off('fs_status', handleFsStatus);
            socket.off('fs_calls', handleFsCalls);
        };
    }, [dispatch]);

    useEffect(() => {
        dispatch(setRoomId(roomId));
    }, [dispatch, roomId]);

    useEffect(() => {
        if (activeCall && activeCalls[0].application_data) {
            const requestParams = {
                fs_server: getCookies("fs_server"),
                room_id: roomId,
                worker: getCookies("worker"),
                session_key: getCookies("session_key"),
                uuid: activeCalls[0].uuid,
                b_uuid: activeCalls[0].b_uuid,
                phone: activeCalls[0].cid_num,
                direction: activeCalls[0].direction,
                caller_id:activeCalls[0].dest,
                destination_number:activeCalls[0].dest,
                cid_name:activeCalls[0].cid_name,
                call_section: 1,
            };
            console.log("Отправляем get_fs_dia_dest с параметрами:", requestParams);
            socket.emit('get_fs_dia_dest', requestParams);

        }
    }, [activeCall, activeCalls]);

    return (
        <div className="container-fluid">
            {/* Шапка с панелью управления (HeaderPanel) */}
            <HeaderPanel
                setShowScriptPanel={setShowScriptPanel}
                showScriptPanel={showScriptPanel}
                selectedProject={selectedProject}
                setSelectedProject={setSelectedProject}
            />

            {/* Основной контент */}
            <div className="row my-3">
                {/* Левая колонка: Дашборд звонков или панель скриптов */}
                <div className="col-12 col-md-7">
                    {showScriptPanel || activeCall ? (
                        <ScriptPanel
                            direction={activeCalls[0]?.direction}
                            projectName={activeProjectName}
                            onClose={() => setShowScriptPanel(false)}
                        />
                    ) : (
                        <CallsDashboard
                            setSelectedCall={setSelectedCall}
                            selectedCall={selectedCall}
                            currentPage={currentPage}
                            setCurrentPage={setCurrentPage}
                        />
                    )}
                </div>

                {/* Правая колонка: Панель управления вызовом */}
                <div className="col-12 col-md-5">
                    {(selectedCall || activeCall || postActive) && (
                        <CallControlPanel
                            call={selectedCall}
                            activeProject={activeProjectName}
                            onClose={() => setSelectedCall(null)}
                            postActive={postActive}
                            setPostActive={setPostActive}
                            currentPage={currentPage}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
