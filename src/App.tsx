import React, { useState, useMemo, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setRoomId } from './redux/roomSlice';
import HeaderPanel, {OutActivePhone, Project} from './components/headerPanel';
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
    const [outboundCall, setOutboundCall] = useState<boolean>(false)
    const [outActivePhone, setOutActivePhone] = useState<OutActivePhone | null>(null);
    const [outActiveProjectName, setOutActiveProjectName] = useState('');
    const [assignedKey, setAssignedKey] = useState('');
    useEffect(()=> console.log("assignedKey: ", assignedKey))
    const sessionKey = getCookies('session_key') || '';
    const sipLogin = getCookies('sip_login') || '';
    const fsServer = getCookies('fs_server') || '';
    const worker = getCookies('worker') || '';

    // useEffect(()=> console.log())
    const dispatch = useDispatch();
    const roomId = useMemo(() => makeId(40), []);
    const rawActiveCalls = useSelector((state: RootState) => state.operator.activeCalls);
    const activeCalls: any[] = useMemo(() => {
        return Array.isArray(rawActiveCalls) ? rawActiveCalls : Object.values(rawActiveCalls || {});
    }, [rawActiveCalls]);
    useEffect(() => {
        console.log("activeCalls123: ", activeCalls);
    }, [activeCalls]);
    useEffect(()=> {
        if (!activeCall && postActive) {
            socket.emit('get_fs_report', {
                worker,
                session_key: sessionKey,
                sip_login: sipLogin,
                room_id: roomId,
                fs_server: fsServer,
                level: 0,
            });
        }
    },[activeCall, postActive, activeCalls])
    useEffect(() => {
        const first = activeCalls[0];
        if (activeCalls.length > 0 && !activeCall && first?.application) {
            console.log("activeCall change");
            setActiveCall(true);
        } else if (activeCalls.length > 0 && Object.keys(first || {}).length === 0 && activeCall) {
            console.log("POSTSTSTSTS drop");
            setActiveCall(false);
            setOutboundCall(false);
            setPostActive(true);
        }
    }, [activeCalls]);
    useEffect(()=> console.log("activeProjectName: ", activeProjectName),[activeProjectName])

    useEffect(()=> {
        const getOuboundProject = (msg:any) => {
            setActiveProjectName(msg.project_name)
        }
        socket.on('get_out_start', getOuboundProject);
        return () => {
            socket.off('get_out_start', getOuboundProject);
        };
    },[])
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
            if (!outboundCall) {
                setActiveProjectName(msg.project_name);
            }
        };

        socket.on('fs_dia_des', handleFsDiaDes);
        return () => {
            socket.off('fs_dia_des', handleFsDiaDes);
        };
    }, [outboundCall]);
    useEffect(() => {
        const handleFsStatus = (msg: any) => {
            dispatch(setFsStatus(msg));
            // if (msg.status === "Available (On Demand)" && msg.state === "Idle") {
            //     setPostActive(true);
            // } else if (msg.status === "Available (On Demand)" && msg.state !== "Idle") {
            //     setPostActive(false);
            // }
        };

        const handleFsCalls = (msg: any) => {
            console.log("fs_calls msg: ", msg);
            const callsArray: any[] = Object.values(msg);
            console.log("callsArray: ", callsArray);
            dispatch(setActiveCalls(callsArray));
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
    useEffect(()=> console.log("selectedCall: ", selectedCall),[selectedCall])
    return (
        <div className="container-fluid">
            {/* Шапка с панелью управления (HeaderPanel) */}
            <HeaderPanel
                setShowScriptPanel={setShowScriptPanel}
                showScriptPanel={showScriptPanel}
                selectedProject={selectedProject}
                setPostActive={setPostActive}
                setSelectedProject={setSelectedProject}
                setOutboundCall={setOutboundCall}
                setActiveProjectName={setActiveProjectName}
                outActivePhone={outActivePhone}
                setOutActivePhone={setOutActivePhone}
                outActiveProjectName={outActiveProjectName}
                setOutActiveProjectName={setOutActiveProjectName}
                assignedKey={assignedKey}
                setAssignedKey={setAssignedKey}
            />

            {/* Основной контент */}
            <div className="row my-3">
                {/* Левая колонка: Дашборд звонков или панель скриптов */}
                <div className="col-12 col-md-7">
                    {showScriptPanel || activeCall  ? (
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

                <div className="col-12 col-md-5">
                    {(selectedCall || activeCall || postActive) && (
                        <CallControlPanel
                            call={selectedCall}
                            hasActiveCall={activeCall}
                            activeProject={activeProjectName}
                            onClose={() => setSelectedCall(null)}
                            postActive={postActive}
                            setPostActive={setPostActive}
                            currentPage={currentPage}
                            outActivePhone={outActivePhone}
                            outActiveProjectName={outActiveProjectName}
                            assignedKey={assignedKey}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
