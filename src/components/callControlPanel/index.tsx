import React, {useState, useEffect, useRef, useMemo} from 'react';
import {initSocket} from '../../socket';
import { useSelector } from "react-redux";
import {RootState, store} from "../../redux/store";
import Swal from "sweetalert2";
import EditableFields from "./components";
import {makeSelectFullProjectPool} from "../../redux/operatorSlice";
import {OutActivePhone} from "../headerPanel";
import SearchableSelect from "./components/select";
import {ModuleData} from "../../App";

export interface ReasonItem {
    id: string;
    name: string;
    description?: string;
    project_name: string;
    [key: string]: any;
}
export interface ResultItem {
    id: string;
    name: string;
    description?: string;
    project_name: string;
    [key: string]: any;
}
export interface FieldDefinition {
    field_id: string;
    field_name: string;
    field_type: string;
    field_vals: string | null;
    editable: boolean;
    must_have: boolean;
    project_name: string;
    [key: string]: any;
}

export interface CallData {
    destination_id: string
    caller_id: string ;
    id: number;
    a_line_num: string;
    b_line_num: string;
    datetime_start: string;
    direction: string;           // 'inbound' | 'outbound'
    record_name?: string;
    base_fields?: { [key: string]: string };
    call_reason?: string | number;
    call_result?: string | number;
    user_comment?: string;
    project_name?: string;
    total_direction?: string;    // 'inbound' | 'outbound'
    // ... и т. д.
}
export interface ActiveCall {
    accountcode: string;
    application: string;
    application_data: string;
    b_accountcode: string;
    b_application: string;
    b_application_data: string;
    b_call_uuid: string;
    b_callee_direction: string;
    b_callee_name: string;
    b_callee_num: string;
    b_callstate: string;
    b_cid_name: string;
    b_cid_num: string;
    b_context: string;
    b_created: string;
    b_created_epoch: string;
    b_dest: string;
    b_dialplan: string;
    b_direction: string;
    b_hostname: string;
    b_ip_addr: string;
    b_name: string;
    b_presence_data: string;
    b_presence_id: string;
    b_read_bit_rate: string;
    b_read_codec: string;
    b_read_rate: string;
    b_secure: string;
    b_sent_callee_name: string;
    b_sent_callee_num: string;
    b_state: string;
    b_uuid: string;
    b_write_bit_rate: string;
    b_write_codec: string;
    b_write_rate: string;
    call_created_epoch: string;
    call_uuid: string;
    callee_direction: string;
    callee_name: string;
    callee_num: string;
    callstate: string;
    cid_name: string;
    cid_num: string;
    context: string;
    created: string;
    created_epoch: string;
    dest: string;
    dialplan: string;
    direction: string;
    hostname: string;
    ip_addr: string;
    name: string;
    presence_data: string;
    presence_id: string;
    read_bit_rate: string;
    read_codec: string;
    read_rate: string;
    secure: string;
    sent_callee_name: string;
    sent_callee_num: string;
    state: string;
    uuid: string;
    write_bit_rate: string;
    write_codec: string;
    write_rate: string;
}


interface CallControlPanelProps {
    call: CallData | null;
    onClose: () => void;
    activeProject: string;
    postActive: boolean;
    setPostActive: (postActive: boolean) => void;
    currentPage: number;
    hasActiveCall: boolean
    outActivePhone: OutActivePhone | null
    outActiveProjectName: string
    assignedKey: string
    isLoading: boolean
    setIsLoading: (isLoading: boolean) => void
    modules: ModuleData[]
    setModules: (modules: ModuleData[]) => void
    prefix: string
    outboundCall: boolean
}


const CallControlPanel: React.FC<CallControlPanelProps> = ({
                                                               isLoading,
                                                               setIsLoading,
                                                               assignedKey,
                                                               outActiveProjectName,
                                                               outActivePhone,
                                                               call,
                                                               hasActiveCall,
                                                               onClose,
                                                               activeProject,
                                                               setPostActive,
                                                               postActive,
                                                               currentPage,
                                                               modules,
                                                               setModules,
                                                               prefix,
                                                               outboundCall,
}) => {
    // Из cookies
    const {
        sessionKey = '',
        sipLogin   = '',
        fsServer   = '',
        worker     = '',
    } = store.getState().credentials;
    const roomId     = useSelector((state: RootState) => state.room.roomId) || 'default_room';
    const socket = initSocket();

    // Состояния для формы
    const fsReasons = useSelector((state: RootState) => state.operator.fsReasons);
    const [callReason, setCallReason] = useState(call?.call_reason || '');
    const [callResult, setCallResult] = useState(call?.call_result || '');
    const [comment,   setComment]     = useState(call?.user_comment || '');
    const [baseFieldValues, setBaseFieldValues] = useState<{ [fieldId: string]: string }>(
        call?.base_fields || {}
    );
    // Списки причин, результатов и полей для заполнения
    const [callReasons, setCallReasons] = useState<ReasonItem[]>([]);
    const [callResults, setCallResults] = useState<ResultItem[]>([]);
    const [params, setParams]      = useState<FieldDefinition[]>([]);

    // Состояние для списка модулей, полученных с сервера
    const [isParams, setIsParams] = useState<boolean>(true)
    const [startModulesRan, setStartModulesRan] = useState(false);

    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    const projectPool = useSelector(selectFullProjectPool) || [];
    const projectPoolForCall = useMemo(() => {
        return projectPool.filter(project => (project.out_active && project.active)).map(project => project.project_name);
    }, [projectPool]);
    // Активные звонки (из redux)
    const activeCalls: ActiveCall[] = useSelector((state: RootState) => state.operator.activeCalls);

    // const hasActiveCall = Array.isArray(activeCalls) ? activeCalls.some(ac => Object.keys(ac).length > 0) : false

    // Логика «постобработки»
    const POST_LIMIT = worker.includes('fs.at.akc24.ru') ? 120 : 15;
    const [postSeconds, setPostSeconds] = useState(POST_LIMIT);
    const [postCallData, setPostCallData] = useState<ActiveCall | null>(null);
    useEffect(() => {
        console.log("postCallData: ", postCallData)
    },[postCallData])
    const fsReport = useSelector((state: RootState) => state.operator.fsReport);

    const forbiddenProjects = ['outbound', 'api_call', 'no_project_out'];
    const project = call?.project_name || '';
    const hideReportFields = forbiddenProjects.includes(project);

    const prevCallRef = useRef<ActiveCall | null>(null);

    const startModulesRanRef = useRef(false);

    useEffect(() => {
        if (hasActiveCall) {
            setCallReason('');
            setCallResult('');
            setComment('');
            setBaseFieldValues({});

        }
    },[hasActiveCall])

    const sanitize = (v: any) =>
        typeof v === 'string' && v.includes('|_|_|') ? '' : v;

    useEffect(() => {
        if (!hasActiveCall) {
            startModulesRanRef.current = false;
        }

    }, [hasActiveCall]);

    useEffect(() => {

        if (hasActiveCall && !postActive && activeCalls[0].application){
            setPostCallData(activeCalls[0] as ActiveCall);
        }

        if (
            hasActiveCall &&
            !postActive &&
            activeCalls.length === 1 &&
            Boolean(activeCalls[0].application) &&
            modules.length > 0 &&
            !startModulesRanRef.current
        ) {
            const startModules = modules.filter(
                mod => mod.start_modes[activeProject] === "start"
            );
            startModules.forEach(mod => handleModuleRun(mod));

            startModulesRanRef.current = true;
        }

    }, [activeCalls, activeProject, modules, hasActiveCall, postActive]);

    useEffect(()=> {
        if (postActive) {
            setStartModulesRan(false)
        }
    },[postActive])
    const findNameProject = (projectName: string)=> {
        if (!projectName) return "";
        const found = projectPool.find(
            (proj) => proj.project_name === projectName
        );
        return found ? found.glagol_name : projectName;
    }

    useEffect(() => {
        const handleReports = (msg: any) => {
            const item = msg.find((c: any) => c.special_key_call === postCallData?.call_uuid)
            if (item) {
                setIsLoading(false)
            }
        }
        socket.on('fs_report', handleReports);

        return () => {
            socket.off('fs_report', handleReports);
        };
    },[postCallData, setIsLoading, socket])
    useEffect(() => {
        if(!hasActiveCall && !postActive){
            setCallReason(call?.call_reason || '');
            setCallResult(call?.call_result || '');
            setComment(call?.user_comment || '');
            setBaseFieldValues(call?.base_fields || {});
        }
    }, [call]);

    useEffect(() => {
        const handleFsReasons = (data: {
            call_reasons:  ReasonItem[];
            call_results:  ResultItem[];
            as_is_dict:    FieldDefinition[];
        } | null) => {
            if (!isParams || postActive) return
            if (data && !hasActiveCall && !postActive) {
                setCallReasons(data.call_reasons.filter(r => r.project_name === call?.project_name));
                setCallResults(data.call_results.filter(r => r.project_name === call?.project_name));
                setParams(data.as_is_dict.filter(p => p.project_name === call?.project_name));
            } else if (data && (hasActiveCall || postActive)){
                setCallReasons(data.call_reasons.filter(r => r.project_name === activeProject));
                setCallResults(data.call_results.filter(r => r.project_name === activeProject));
                setParams(data.as_is_dict.filter(p => p.project_name === activeProject));
            } else {
                setCallReasons([]);
                setCallResults([]);
                setParams([]);
            }
        };
        handleFsReasons(fsReasons)
    }, [call, activeProject, fsReasons, hasActiveCall, isParams]);

    // ***** МОДУЛИ *****
    // При открытии панели вызова (если вызов не активен) запрашиваем список модулей
    // useEffect(() => {
    //     if (hasActiveCall && activeProject) {
    //         socket.emit('module_operations', {
    //             worker,
    //             sip_login: sipLogin,
    //             session_key: sessionKey,
    //             room_id: roomId,
    //             fs_server: fsServer,
    //             action: 'get_modules',
    //             project_name: activeProject,
    //         });
    //     }
    // }, [hasActiveCall, worker, sipLogin, sessionKey, roomId, fsServer, activeProject]);
    //
    // // Обработка ответа сервера для "get_modules"
    // useEffect(() => {
    //     const handleModules = (data: any) => {
    //         console.log("modules123: ", data)
    //         setModules(data.modules || []);
    //     };
    //     socket.on('get_modules', handleModules);
    //     return () => {
    //         socket.off('get_modules', handleModules);
    //     };
    // }, [hasActiveCall, postActive]);

    useEffect(() => {
        // setModules([]);
        startModulesRanRef.current = false;

        if (!hasActiveCall || !activeProject) return;

        const handleModules = (data: any) => {
            if (data.project_name !== activeProject) return;
            setModules(data.modules || []);
        };

        socket.on('get_modules', handleModules);
        socket.emit('module_operations', {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            room_id: roomId,
            fs_server: fsServer,
            action: 'get_modules',
            project_name: activeProject,
        });

        return () => {
            socket.off('get_modules', handleModules);
            // setModules([]);
            startModulesRanRef.current = false;
        };

    }, [hasActiveCall, activeProject]);

    // Функция для запуска модуля
    const handleModuleRun = (mod: any) => {
        // Базовый payload
        const payload: any = {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            room_id: roomId,
            fs_server: fsServer,
            action: 'run_module',
            name___n: mod.name,
            project_name: activeProject,
            uuid: activeCalls[0]?.uuid || postCallData?.uuid || '',
            b_uuid: activeCalls[0]?.b_uuid || postCallData?.uuid || '',
            run_mode: mod.start_modes[activeProject],
            ma_id: mod.id,
            c_s: 1,
        };

        let to_parse = '';
        const inputs = mod.inputs || {};

        Object.keys(inputs).forEach(inputName => {
            const baseKey = inputs[inputName][activeProject];
            let rawValue: any = '';

            // 1) сначала пробуем взять из baseFieldValues
            if (baseKey && baseFieldValues.hasOwnProperty(baseKey)) {
                rawValue = baseFieldValues[baseKey];
            } else {
                // 2) иначе собираем из call / пост-колл данных
                const call = hasActiveCall ? activeCalls[0] : postCallData;
                switch (baseKey) {
                    case 'operator_id':
                        rawValue = sipLogin;
                        break;
                    case 'reason': {
                        const ri = callReasons.find(r => String(r.id) === String(callReason));
                        rawValue = ri?.name || '';
                        break;
                    }
                    case 'result': {
                        const ri = callResults.find(r => String(r.id) === String(callResult));
                        rawValue = ri?.name || '';
                        break;
                    }
                    case 'phone':
                        rawValue =
                            call?.direction === 'outbound' ? call?.b_dest : call?.cid_num;
                        break;
                    case 'comment':
                        rawValue = comment;
                        break;
                    case 'uuid':
                        rawValue = call?.uuid || '';
                        break;
                    case 'b_uuid':
                        rawValue = call?.b_uuid || '';
                        break;
                    case 'datetime_start':
                        rawValue = call?.created || '';
                        break;
                    case 'dest':
                        rawValue = call?.dest || '';
                        break;
                    case 'cid_num':
                        rawValue = call?.cid_num || '';
                        break;
                    default:
                        rawValue = '';
                }
            }

            const value = sanitize(rawValue);
            payload[inputName] = value;
            to_parse = to_parse ? `${to_parse},${inputName}` : inputName;
        });

        payload.to_parse = to_parse;
        socket.emit('module_operations', payload);
    };
    useEffect(() => {
        const handleModuleResult = (data: any) => {
            if (data.result !== "success") return;

            const mod = modules.find(m => m.id === data.ma_id);
            if (!mod) return;

            const outputs = mod.outputs || {};
            const returnedValues: Record<string, string> = data.module_return || {};

            setParams(prevParams =>
                prevParams.map(p => {
                    // нашли, какой field_id нужно обновить
                    const outName = Object.keys(outputs).find(
                        name => outputs[name]?.[activeProject] === p.field_id
                    );
                    if (!outName) return p;

                    // “сырое” значение из модуля
                    const rawValue = returnedValues[outName];
                    if (typeof rawValue !== 'string') return p;

                    // нормализуем маркером
                    const normalized = rawValue.includes('|_|_|')
                        ? rawValue
                        : `${rawValue}|_|_|`;

                    // Парсим новые и старые опции
                    const newOpts = normalized
                        .split('|_|_|')
                        .map(s => s.trim())
                        .filter(Boolean);

                    const oldRaw = p.field_vals || '';
                    const oldOpts = oldRaw
                        .split('|_|_|')
                        .map(s => s.trim())
                        .filter(Boolean);

                    // Если все новые опции уже есть среди старых — не меняем
                    const allExist = newOpts.every(opt => oldOpts.includes(opt));
                    if (allExist) {
                        return p;
                    }

                    // Иначе — обновляем field_vals
                    return {
                        ...p,
                        field_vals: normalized
                    };
                })
            );

            // baseFieldValues можно оставить без изменений
            Object.entries(returnedValues).forEach(([outName, rawValue]) => {
                const key = outputs[outName]?.[activeProject];
                if (!key) return;
                setBaseFieldValues(prev => ({
                    ...prev,
                    [key]: typeof rawValue === 'string'
                        ? rawValue
                        : JSON.stringify(rawValue)
                }));
            });

            Swal.fire({
                title: "Успех",
                text: "Результат работы модуля передан в систему",
                icon: "success"
            });
        };

        socket.on("run_module", handleModuleResult);
        return () => {
            socket.off("run_module", handleModuleResult);
        };
    }, [modules, activeProject, setParams, setBaseFieldValues]);

    // Логика постобработки (если звонок завершён)
    useEffect(() => {
        const prevCall = prevCallRef.current;
        const thisCall = hasActiveCall ? activeCalls[0] : null;
        if (prevCall && !postActive && !activeCalls[0].application ) {
            setIsParams(false)
            setPostActive(true);
            setPostSeconds(POST_LIMIT);
        }
        if (hasActiveCall) {
            setIsParams(true)
            setPostActive(false);
            setPostSeconds(POST_LIMIT);
        }
        prevCallRef.current = thisCall;
    }, [hasActiveCall, activeCalls, POST_LIMIT]);

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        if (postActive && postSeconds > 0) {
            timer = setInterval(() => setPostSeconds(sec => sec - 1), 1000);
        } else if (postActive && postSeconds <= 0) {
            handleAutoReturn();
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [postActive, postSeconds]);

    const handleAutoReturn = () => {
        Swal.fire({
            title: "Время постобработки истекло",
            icon: "warning",
            timer: 1500,
        });
        socket.emit('change_state_fs', {
            fs_server: fsServer,
            sip_login: sipLogin,
            room_id: roomId,
            worker,
            session_key: sessionKey,
            state: 'waiting',
            reason: 'auto_return',
            page: 'online',
        });
        setIsParams(true)
        setPostActive(false);
        setPostSeconds(POST_LIMIT);
        setCallReason('');
        setCallResult('');
        setComment('');
        setBaseFieldValues({});
    };

    const handleHold = (activeCall: ActiveCall) => {
        const currentUUID = activeCall?.call_uuid;
        if (!currentUUID) return;
        socket.emit('sofia_operations', {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            room_id: roomId,
            fs_server: fsServer,
            uuid: currentUUID,
            action: 'hold_toggle'
        });
    };

    const handleStop = (activeCall: ActiveCall, callSection: number) => {
        const currentUUID = activeCall?.call_uuid;
        if (!currentUUID) return;
        socket.emit('sofia_operations', {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            room_id: roomId,
            fs_server: fsServer,
            uuid: currentUUID,
            action: 'uuid_break',
            idle_set: true
        });
        setIsLoading(true)
        socket.emit('get_fs_report', {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            room_id: roomId,
            fs_server: fsServer,
            level: 0,
        });
        if (callSection === 1) {
            setIsParams(false)
            setPostActive(true)
            setPostSeconds(POST_LIMIT);
        }
    };

    const handleRedirect = () => {
        if (activeCalls.length < 2) return;
        const uuid1 = activeCalls[0].direction === "outbound" ? activeCalls[0]?.b_uuid : activeCalls[0]?.uuid;
        const uuid2 = activeCalls[1]?.b_uuid;
        if (!uuid1 || !uuid2) return;
        socket.emit('sofia_operations', {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            room_id: roomId,
            fs_server: fsServer,
            uuid: uuid1,
            uuid_2: uuid2,
            action: 'uuid_bridge'
        });
    };


    const handleSave = () => {
        if (!callReason || !callResult) {
            Swal.fire({ title: "Ошибка", text: "Проверьте заполнение обязательных полей", icon: "error" });
            return;
        }
        const reasonText = callReasons.find(r => String(r.id) === callReason)?.name || '';
        const resultText = callResults.find(r => String(r.id) === callResult)?.name || '';
        const sanitizedBaseFields = Object.fromEntries(
            Object.entries(baseFieldValues).map(([k, v]) => [k, sanitize(v)])
        );
        socket.emit('edit_call_fs', {
            fs_server: fsServer,
            call_id:   call?.id,
            call_reason: callReason,
            call_result: callResult,
            comment,
            session_key: sessionKey,
            worker,
            base_fields: sanitizedBaseFields,
            reason_text: reasonText,
            result_text: resultText
        });
        setIsLoading(true)
        socket.emit('get_fs_report', {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            room_id: roomId,
            fs_server: fsServer,
            level: (currentPage - 1) * 10,
        });
        onClose();
    };

    // useEffect(()=> console.log("outboundCall: ", outboundCall),[outboundCall])
    const handlePostSave = () => {
        if (!callReason || !callResult) {
            Swal.fire({
                title: "Ошибка",
                text: "Проверьте заполнение обязательных полей",
                icon: "error",
            });
            return;
        }
        const afterModules = modules.filter(
            (mod) =>
                mod.start_modes &&
                mod.start_modes[activeProject] === "after"
        );

        afterModules.forEach((mod) => {
            handleModuleRun(mod);
        });

        const reasonText =
            callReasons.find((r) => String(r.id) === callReason)?.name || "";
        const resultText =
            callResults.find((r) => String(r.id) === callResult)?.name || "";
        if (outboundCall) {
            socket.emit('outbound_calls', {
                'worker': worker,
                'sip_login':sipLogin,
                'session_key':sessionKey,
                'room_id':roomId,
                'fs_server':fsServer,
                'project_pool':projectPoolForCall,
                'action':'update_phone_to_call',
                'assigned_key': assignedKey,
                'base_fields':baseFieldValues,
                'log_status':'saved',
                'phone_status': resultText,
                'special_key':outActivePhone?.special_key,
                'project_name':outActiveProjectName
            })

        }
        const sanitizedBaseFields = Object.fromEntries(
            Object.entries(baseFieldValues).map(([k, v]) => [k, sanitize(v)])
        );

        socket.emit("edit_call_fs", {
            fs_server: fsServer,
            call_id: fsReport.find((c: any) => c.special_key_call === postCallData?.call_uuid)
                .id,
            call_reason: callReason,
            call_result: callResult,
            comment,
            session_key: sessionKey,
            worker,
            base_fields: sanitizedBaseFields,
            reason_text: reasonText,
            result_text: resultText,
        });

        socket.emit("change_state_fs", {
            fs_server: fsServer,
            sip_login: sipLogin,
            room_id: roomId,
            worker,
            session_key: sessionKey,
            state: "waiting",
            reason: "manual_return",
            page: "online",
        });
        setIsLoading(true)
        socket.emit("get_fs_report", {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            room_id: roomId,
            fs_server: fsServer,
            level: 0,
        });
        setIsParams(true)
        setPostActive(false);
        setPostSeconds(POST_LIMIT);
        onClose();
    };


    const [callDuration, setCallDuration] = useState(0);
    const [secondCallDuration, setSecondCallDuration] = useState(0)
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (hasActiveCall) {
            interval = setInterval(() => {
                const startTimeStr = activeCalls[0].created;
                if (startTimeStr) {
                    const startMs = new Date(startTimeStr).getTime();
                    const now = Date.now();
                    const diffSec = Math.floor((now - startMs) / 1000);
                    setCallDuration(diffSec);
                }
                if (activeCalls.length > 1) {
                    const startTimeStr = activeCalls[1].created;
                    if (startTimeStr) {
                        const startMs = new Date(startTimeStr).getTime();
                        const now = Date.now();
                        const diffSec = Math.floor((now - startMs) / 1000);
                        setSecondCallDuration(diffSec);
                    }
                }
            }, 1000);
        } else {
            setCallDuration(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [hasActiveCall, activeCalls]);

    function formatDuration(sec: number): string {
        const minutes = Math.floor(sec / 60);
        const seconds = sec % 60;
        return `${minutes} мин. ${seconds} сек.`;
    }

    function extractSuffix(input?: string | null): string {
        return input?.split(' ').pop() ?? '';
    }

    const iconCol = call?.total_direction === 'outbound' ? '#f26666' : '#7cd420';

    const renderActiveCallHeader = (activeCall: ActiveCall) => {

        const isHeld = (activeCall.callstate === 'HELD' || activeCall.b_callstate === 'HELD');
        const iconName = isHeld ? 'play_arrow' : 'pause';
        const iconColor = activeCall.direction === 'outbound' ?  '#f26666' : '#7cd420';
        return (
            <div className="mb-3">
                <div className="d-flex">
                    <button className="btn btn-outline-warning mr-2" onClick={() => handleHold(activeCall)}>
                        <span className="material-icons">{iconName}</span>
                    </button>
                    <button className="btn btn-outline-danger mr-2" onClick={() => handleStop(activeCall, 1)}>
                        <span className="material-icons">call_end</span>
                    </button>
                    {activeCalls.length > 1 &&
                        <button className="btn btn-outline-success" onClick={handleRedirect}>
                            Объединить вызовы
                        </button>
                    }
                </div>
                <div className="d-flex align-items-center mt-2">
                  <span className="material-icons" style={{ color: iconColor }}>
                    {activeCall.direction === 'outbound' ? 'logout' : 'login'}
                  </span>
                    <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600}}>
                        {activeCall.direction === 'outbound' ? activeCall.callee_num || extractSuffix(activeCall.cid_num) : extractSuffix(activeCall.cid_num)}
                        {' | '}
                        {new Date(activeCall.created).toLocaleString()}
                    </strong>
                </div>
                <div className="mt-2 mb-2">
                    <strong style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: isHeld ? "#cba200" : "#0BB918"
                    }}
                    >
                        {isHeld ? 'На удержании' : 'Вызов активен'}:</strong> {formatDuration(callDuration)}
                </div>
                <strong style={{ whiteSpace: 'nowrap', marginTop: "4px", fontWeight: 600, fontSize: 16 }}>
                    {`Проект: ${findNameProject(activeProject)}`}
                </strong>
            </div>
        );
    };

    const renderPostCallHeader = () => {

        const iconColor = postCallData?.direction === 'outbound' ? '#f26666' : '#7cd420';
        const iconName = postCallData?.direction === 'outbound' ? 'logout' : 'login';
        const phoneNumber = postCallData?.direction === 'outbound' ? postCallData.b_dest : postCallData?.cid_num;
        const startDate = new Date(postCallData?.b_created || "0").toLocaleString();

        return (
            <div className="mb-3">
                <div className="d-flex align-items-center">
                    <span className="material-icons" style={{ color: iconColor }}>{iconName}</span>
                    <strong className="ml-2" style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: 16 }}>{phoneNumber} | {startDate}</strong>
                </div>
                <label className="mt-3" style={{ whiteSpace: 'nowrap', marginTop: "4px", fontWeight: 600, fontSize: 16 }}>
                    {`Проект: ${findNameProject(activeProject)}`}
                </label>
            </div>
        );
    };

    const renderSecondCall = () => {
        if (activeCalls.length > 1 && Object.keys(activeCalls[1]).length > 0 && activeCalls[1].application) {
            const sc = activeCalls[1];
            const isHeld = sc.callstate === 'HELD' || sc.b_callstate === 'HELD';
            const iconName = isHeld ? 'play_arrow' : 'pause';
            const iconColor = sc.direction === 'outbound' ? '#f26666' : '#7cd420';

            return (
                <div className="mt-3">
                    <div className="card col ml-3 w-100" style={{ marginTop: '1rem' }}>
                        <div className="card-body" style={{ padding: '1rem' }}>
                            <div className="d-flex">
                                <button
                                    className="btn btn-outline-warning mr-2"
                                    onClick={() => handleHold(sc)}
                                >
                                    <span className="material-icons">{iconName}</span>
                                </button>
                                <button
                                    className="btn btn-outline-danger mr-2"
                                    onClick={() => handleStop(sc, 2)}
                                >
                                    <span className="material-icons">call_end</span>
                                </button>
                            </div>
                            <div className="d-flex align-items-center mt-2">
                              <span
                                  className="material-icons"
                                  style={{ color: iconColor }}
                              >
                                {sc.direction === 'outbound' ? 'logout' : 'login'}
                              </span>
                                <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600}}>
                                    {sc.direction === 'outbound' ? sc.callee_num  : extractSuffix(sc.cid_num)}
                                    {' | '}
                                    {new Date(sc.created).toLocaleString()}
                                </strong>
                            </div>
                            <div className="mt-2 mb-2">
                                <strong style={{ fontSize: 16, fontWeight: 400 }}>
                                    {isHeld ? 'На удержании' : 'Вызов активен'}:
                                </strong>{' '}
                                {formatDuration(secondCallDuration)}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };


    const renderPostProcessing = () => {
        if (!postActive) return null;
        return (
            <div className="post-processing mt-3">
                <p className="alert-warning" style={{ width: 220, padding: 4, borderRadius: 6 }}>
                    Постобработка: осталось {postSeconds} сек.
                </p>
                <button className="btn btn-outline-success" onClick={handlePostSave}>
                    Сохранить и вернуться на линию
                </button>
            </div>
        );
    };
    useEffect(()=> console.log("1234modules: ", modules),[modules])
    const renderModules = () => {
        if (!hasActiveCall && !postActive) {
            console.log("123ffff")
            return null
        };
        console.log("123activeProject: ", activeProject)
        const manualModules = modules.filter(mod => mod.start_modes[activeProject] === "manual")
        console.log("123manualModules: ", manualModules)
        if (manualModules.length === 0) return null;

        return (
            <div style={{display: "flex", flexDirection: "row", gap: 8, alignItems: "center", marginLeft:20, marginBottom: 10}}>
                <div style={{fontWeight: 600, fontSize: 16}}>Модули: </div>
                {manualModules.map((mod, idx) => (
                    <button
                        key={idx}
                        onClick={() => handleModuleRun(mod)}
                        className="btn btn-outline-success"
                    >
                        {mod.name}
                    </button>
                ))}
            </div>
        );
    };
    useEffect(()=> console.log("selectedCall: ", call),[call])
    return (
        <div>
            {renderModules()}
        <div className="col ml-2 pr-0 mr-0">
            <div className="card col ml-0">
                <div className="card-body">
                    {hasActiveCall && renderActiveCallHeader(activeCalls[0])}
                    {!hasActiveCall && postActive && renderPostCallHeader()}
                    <div>
                            {!hasActiveCall && !postActive && (
                                <div>
                                    <div className="d-flex align-items-center my-2">
                                    <span className="material-icons" style={{ color: iconCol }}>
                                      {call?.total_direction === 'outbound' ? 'logout' : 'login'}
                                    </span>
                                        <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600}}>
                                            {call?.total_direction === 'outbound' ? call?.b_line_num || call.caller_id || '—' : call?.a_line_num || call?.destination_id || call?.caller_id || '—'}
                                            {' | '}
                                            {new Date(call?.datetime_start || "0").toLocaleString()}
                                        </strong>
                                    </div>
                                    {!hasActiveCall && call?.record_name && (
                                        <div className="mb-3">
                                            <audio controls style={{ width: '100%' }}>
                                                <source
                                                    src={`https://my.glagol.ai/get_cc_audio/${(call.project_name || '').replace('@', '_at_')}/${call.record_name}`}
                                                    type="audio/mpeg"
                                                />
                                                Ваш браузер не поддерживает аудиоплеер
                                            </audio>
                                        </div>
                                    )}
                                    {((hasActiveCall || postActive) || !hideReportFields) && (
                                        <label
                                            className="mb-2"
                                            style={{
                                                whiteSpace: 'nowrap',
                                                marginTop: "4px",
                                                fontWeight: 600,
                                                fontSize: 16
                                            }}
                                        >
                                            Проект:&nbsp;
                                            <span>
                                                {findNameProject(call?.project_name || "")}
                                            </span>
                                        </label>
                                    )}
                                </div>
                            )}
                            {((hasActiveCall || postActive) || !hideReportFields) && (
                                <div className="form-group d-flex align-items-center" style={{ flex: '1 1 0%', minWidth: 0, gap: '8px' }}>
                                    <label className="mb-0" style={{ whiteSpace: 'nowrap', fontWeight: 400, fontSize: 16 }}>
                                        Причина звонка: <span style={{ color: 'red' }}>*</span>
                                    </label>
                                    <SearchableSelect
                                        options={callReasons}
                                        value={callReason}
                                        onChange={setCallReason}
                                        placeholder="Выберите причину..."
                                        augmentSaved={!hasActiveCall && !postActive}
                                    />
                                </div>
                            )}
                            {((hasActiveCall || postActive) || !hideReportFields) && (
                                <div className="form-group d-flex align-items-center" style={{ flex: '1 1 0%', minWidth: 0, gap: '8px' }}>
                                    <label className="mb-0" style={{ whiteSpace: 'nowrap', fontWeight: 400, fontSize: 16 }}>
                                        Результат звонка: <span style={{ color: 'red' }}>*</span>
                                    </label>
                                    <SearchableSelect
                                        options={callResults}
                                        value={callResult as number}
                                        onChange={setCallResult}
                                        placeholder="Выберите результат..."
                                        augmentSaved={!hasActiveCall && !postActive}
                                    />
                                </div>
                            )}
                            <EditableFields
                                params={params}
                                initialValues={baseFieldValues}
                                onChange={setBaseFieldValues}
                                augmentSaved={!hasActiveCall && !postActive}
                            />
                            {((hasActiveCall || postActive) || !hideReportFields) && (
                                <div className="form-group d-flex align-items-center" style={{ flexWrap: 'nowrap', gap: '8px' }}>
                                    <textarea
                                        className="form-control"
                                        placeholder="Введите комментарий"
                                        value={comment}
                                        onChange={e => setComment(e.target.value)}
                                    />
                                </div>
                            )}
                            {!hasActiveCall && !postActive && !hideReportFields &&  (
                                <div className="card-footer d-flex justify-content-end">
                                    <button className="btn btn-outline-success" onClick={handleSave}>
                                        Сохранить
                                    </button>
                                </div>
                            )}

                        </div>

                    {postActive && (
                        <div>
                            <p>Постобработка: осталось {postSeconds} сек.</p>
                            <button className="btn btn-outline-success" onClick={handlePostSave} disabled={isLoading}>
                                Сохранить и вернуться на линию
                            </button>
                        </div>
                    )}

                </div>

            </div>
        </div>
            {renderSecondCall()}
        </div>
    );
};

export default CallControlPanel;
