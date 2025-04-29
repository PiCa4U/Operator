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
import {RootState, store} from './redux/store';

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
    const [isLoading,    setIsLoading]    = useState(false);
    const [specialKey, setSpecialKey] = useState<string>('')

    // const sessionKey = getCookies('session_key') || '';
    const sipLogin = getCookies('sip_login') || '';
    const worker = getCookies('worker') || '';
    console.log("worker: ", worker)
    const dispatch = useDispatch();
    const roomId = useMemo(() => makeId(40), []);
    const rawActiveCalls = useSelector((state: RootState) => state.operator.activeCalls);
    const activeCalls: any[] = useMemo(() => {
        return Array.isArray(rawActiveCalls) ? rawActiveCalls : Object.values(rawActiveCalls || {});
    }, [rawActiveCalls]);
    useEffect(()=> console.log("activeCall: ", activeCall),[activeCall])
    const { sessionKey } = store.getState().operator

    useEffect(()=> {
        if (!activeCall && postActive && sessionKey) {
            socket.emit('get_fs_report', {
                worker,
                session_key: sessionKey,
                sip_login: sipLogin,
                level: 0,
            });
        }
    },[activeCall, postActive, activeCalls, sessionKey])
    useEffect(() => {
        console.log("activeCalls: ", activeCalls)
        const first = activeCalls[0];
        if (activeCalls.length > 0 && !activeCall && first?.application) {
            setActiveCall(true);
        } else if (!activeCalls.length && activeCall) {
            setActiveCall(false);
            setOutboundCall(false);
            setPostActive(true);
        }
    }, [activeCalls]);

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
        if (postActive && sessionKey) {
            socket.emit('get_fs_report', {
                session_key: sessionKey,
                sip_login: sipLogin,
                level: 0,
                date_range: "",
                phone_search: "",
            });
            setCurrentPage(1)
        }
    },[showScriptPanel, postActive, sessionKey])

    useEffect(() => {
        const handleFsDiaDes = (msg: any) => {
            if (!outboundCall) {
                setActiveProjectName(msg.project_name);
                socket.emit('get_fs_reasons', {
                    project_name: msg.project_name,
                    session_key: sessionKey,
                    worker
                })
            }
        };

        socket.on('get_callcenter_queues', handleFsDiaDes);
        return () => {
            socket.off('get_callcenter_queues', handleFsDiaDes);
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
            const callsArray: any[] = Object.values(msg);
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
        if (activeCall && activeCalls.length && activeCalls[0].application) {
            const requestParams = {
                session_key: sessionKey,
                worker,
                phone: activeCalls[0].cid_num,
            };
            socket.emit('get_callcenter_queues', requestParams);

        }
    }, [activeCall, activeCalls]);
    //TODO fix
    // socket.on('data_saved', () => {
    //     const sessionKey = store.getState().operator.sessionKey;
    //     const sipLogin   = getCookies('sip_login') || '';
    //
    //     socket.emit('get_fs_report', {
    //         session_key:  sessionKey,
    //         sip_login:    sipLogin,
    //         level:        0,
    //         date_range:   '',
    //         phone_search: '',
    //     });
    // });

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
                setIsLoading={setIsLoading}
                specialKey={specialKey}
                setSpecialKey={setSpecialKey}
                activeProjectName={activeProjectName}
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
                            isLoading={isLoading}
                            setIsLoading={setIsLoading}
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
                            isLoading={isLoading}
                            setIsLoading={setIsLoading}
                            specialKey={specialKey}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
