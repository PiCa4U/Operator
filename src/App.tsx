import React, {useState, useMemo, useEffect, useRef} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setRoomId } from './redux/roomSlice';
import HeaderPanel, {OutActivePhone, Project} from './components/headerPanel';
import CallControlPanel, { CallData } from './components/callControlPanel';
import CallsDashboard from './components/callsDashboard';
import ScriptPanel from './components/scriptPanel';
import {initSocket} from "./socket";
import { makeId } from "./utils";
import {setActiveCalls, setFsStatus, setUserStatuses} from './redux/operatorSlice';
import {RootState, store} from './redux/store';
import {first} from "lodash";


export interface ModuleData {
    name: string;
    id: number | string;
    start_modes: { [projectName: string]: string };
    inputs: { [inputKey: string]: { [project: string]: any } };
    outputs: { [inputKey: string]: { [project: string]: any } };
}
export interface CallRecord {
    a_line_num: string;
    api_transfer: boolean;
    b_line_num: string;
    base_fields: Record<string, string>;
    billsec: number;
    call_reason: number | null;
    call_reson_manual: string | null;
    call_result: number | null;
    call_result_manual: string | null;
    call_stopper: string;
    caller_context: string;
    caller_id: string;
    cc_cancel_reason: string | null;
    cc_cause: string | null;
    cc_member_pre_answer_uuid: string | null;
    cc_member_session_uuid: string | null;
    cc_member_uuid: string | null;
    cc_queue_joined_epoch: string | null; // ISO дата-время
    cc_queue_terminated_epoch: string | null;
    channel_call_state: string;
    channel_direction: "inbound" | "outbound" | "internal";
    channel_name: string;
    date_end: string; // YYYY-MM-DD
    date_start: string;
    datetime_end: string; // YYYY-MM-DD HH:mm:ss
    datetime_start: string;
    destination_id: string;
    direction: "inbound" | "outbound";
    duration: number;
    event_sequence: number;
    fs_server: string;
    hangup_cause: string;
    id: number;
    id_gateway: string | null;
    is_recorded: boolean;
    len_queue: number;
    len_time: number;
    missed_mark: string | null;
    oper_saved: boolean | null;
    other_type: string;
    project_name: string;
    recall: boolean;
    record_name: string;
    refer_uuid: string | null;
    seqence_num: string;
    special_key_call: string;
    special_key_conn: string;
    stampsec: number;
    time_end: string; // HH:mm:ss
    time_start: string;
    total_direction: string;
    total_queue_time: number | null;
    transfer_destination: string | null;
    transfered: boolean | null;
    user_comment: string | null;
    user_login: string;
    variable_cc_queue: string | null;
    variable_last_arg: string | null;
    variable_profile_start_stamp: string;
    variable_sip_contact_user: string;
    waitsec: number;
}


const App: React.FC = () => {
    const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
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
    const [modules, setModules] = useState<ModuleData[]>([]);
    const [prefix, setPrefix] = useState<string>('')
    const [get_callcenter, setGet_callcenter] = useState<boolean>(false)
    const [scriptDir, setScriptDir] = useState<"inbound" | "outbound" >("inbound")
    const [editScript, setEditScript] = useState<string>("")
    const [editProject, setEditProject] = useState<string>("")
    const [scriptAnotherID, setScriptAnotherID] = useState<string>("test")
    const [scriptFlag, setScriptFlag] = useState<boolean>(false)
    useEffect(() => console.log("outActivePhone: ", outActivePhone),[outActivePhone])

    useEffect(() => {
        setScriptAnotherID("test")
    },[selectedCall])
    const socket = initSocket();
    const {
        sessionKey = '',
        sipLogin   = '',
        fsServer   = '',
        worker     = '',
    } = store.getState().credentials;

    useEffect(() => {
        console.log("selected: ", selectedCall)
        if (selectedCall && !selectedCall.call_reason) {
            setEditScript(selectedCall.total_direction)
            setEditProject(selectedCall.project_name || "")
        }
        if (!selectedCall) {
            setEditScript("")
            setEditProject("")
        }
    },[selectedCall])


    const dispatch = useDispatch();
    const roomId = useMemo(() => makeId(40), []);
    const rawActiveCalls = useSelector((state: RootState) => state.operator.activeCalls);
    const activeCalls: any[] = useMemo(() => {
        return Array.isArray(rawActiveCalls) ? rawActiveCalls : Object.values(rawActiveCalls || {});
    }, [rawActiveCalls]);

    useEffect(()=> {
        if (!(activeCalls[0] && Object.keys(activeCalls[0]).length > 0)) return
        const first = activeCalls[0]
        if (first.uuid !== "" && first.cid_num !== "" && !get_callcenter && !outboundCall){
            setGet_callcenter(true)
            setScriptDir("inbound")
            setSelectedCall(null)
            setEditProject('')
            setEditScript('')
            socket.emit('get_callcenter_queues', {
                'fs_server':fsServer,
                'room_id':roomId,
                'worker':worker,
                'session_key':sessionKey,
                'uuid':first.uuid,
                'b_uuid':first.b_uuid,
                'phone':first.cid_num
            })
        }
    },[activeCalls, get_callcenter])
    useEffect(()=> {
        if (!activeCall && !postActive) {
            setModules([])
        }
    },[activeCall, postActive])

    useEffect(() => {
        if (!activeCall && !postActive) {
            setActiveProjectName('');
            setSelectedCall(null);
            setEditProject('')
            setEditScript('')
            setOutboundCall(false);
            setOutActivePhone(null);
            setGet_callcenter(false)
            setOutActiveProjectName('');
            setAssignedKey('');
        }
    }, [activeCall, postActive]);

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
        if (activeCalls.length > 0 && !activeCall && (first?.application || first?.b_callstate === "ACTIVE")) {
            setActiveCall(true);
        } else if (activeCalls.length > 0 && Object.keys(first || {}).length === 0 && activeCall) {
            setActiveCall(false);
            // setOutboundCall(false);
            setPostActive(true);
        }
    }, [activeCall, activeCalls]);

    useEffect(()=> {
        const getOuboundProject = (msg:any) => {
            setActiveProjectName(msg.project_name)
            setScriptDir("outbound")
            setSelectedCall(null)
            setEditProject('')
            setEditScript('')
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
            // console.log("desdede: ", msg)
            if (!outboundCall) {
                if (msg.out_extensions[0]?.prefix) {
                    setPrefix(msg.out_extensions[0]?.prefix || '')
                }
                setActiveProjectName(msg.project_name);
            }
        };

        socket.on('fs_dia_des', handleFsDiaDes);
        return () => {
            socket.off('fs_dia_des', handleFsDiaDes);
        };
    }, [outboundCall]);

    useEffect(() => {
        const handleProject = (msg: any) => {
            setActiveProjectName(msg.project_name)
        }
        socket.on('get_callcenter_queues', handleProject);
        return () => {
            socket.off('get_callcenter_queues', handleProject);
        };

    },[socket])

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

        const handleOtherUsers = (msg:any) => {
            dispatch(setUserStatuses(msg))
        }

        socket.on('fs_status', handleFsStatus);
        socket.on('fs_calls', handleFsCalls);
        socket.on("other_users", handleOtherUsers)

        return () => {
            socket.off('fs_status', handleFsStatus);
            socket.off('fs_calls', handleFsCalls);
            socket.off("other_users", handleOtherUsers)
        };
    }, [dispatch]);

    useEffect(() => {
        dispatch(setRoomId(roomId));
    }, [dispatch, roomId]);

    useEffect(() => {
        if (activeCall && activeCalls[0].application_data) {
            // console.log("diadest: ", activeCalls)
            const requestParams = {
                fs_server: fsServer,
                room_id: roomId,
                worker: worker,
                session_key: sessionKey,
                uuid: activeCalls[0].uuid,
                b_uuid: activeCalls[0].b_uuid,
                phone: activeCalls[0].cid_num,
                direction: activeCalls[0].direction,
                caller_id:activeCalls[0].dest,
                destination_number:activeCalls[0].dest,
                cid_name:activeCalls[0].cid_name,
                call_section: 1,
            };
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
                prefix={prefix}
                setPrefix={setPrefix}
            />

            <div className="row my-3">
                <div className="col-12 col-md-6">
                    {showScriptPanel || (activeCalls[0] && Object.keys(activeCalls[0]).length > 0 && activeCalls[0].uuid && activeProjectName) || activeCall || (postActive && activeProjectName) ? (
                        <ScriptPanel
                            direction={scriptDir}
                            projectName={activeProjectName}
                            onClose={() => setShowScriptPanel(false)}
                        />
                    ) :
                        (selectedCall && !selectedCall.call_result && editProject) && (scriptAnotherID) ?
                            <ScriptPanel
                                direction={editScript}
                                projectName={editProject}
                                selectedCall={selectedCall}
                                onClose={() => setSelectedCall(null)}
                                setScriptFlag={setScriptFlag}
                                setScriptAnotherID={setScriptAnotherID}
                            />
                            :
                            <CallsDashboard
                                setSelectedCall={setSelectedCall}
                                selectedCall={selectedCall}
                                currentPage={currentPage}
                                setCurrentPage={setCurrentPage}
                                isLoading={isLoading}
                                setIsLoading={setIsLoading}
                            />
                    }
                </div>

                <div className="col-12 col-md-6">
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
                            outboundCall={outboundCall}
                            assignedKey={assignedKey}
                            isLoading={isLoading}
                            setIsLoading={setIsLoading}
                            setModules={setModules}
                            modules={modules}
                            prefix={prefix}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
