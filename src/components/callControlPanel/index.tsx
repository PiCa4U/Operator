import React, {useState, useEffect, useRef, useMemo} from 'react';
import { socket } from '../../socket';
import { getCookies } from '../../utils';
import { useSelector } from "react-redux";
import {RootState, store} from "../../redux/store";
import Swal from "sweetalert2";
import EditableFields from "./components";
import {makeSelectFullProjectPool} from "../../redux/operatorSlice";
import {OutActivePhone} from "../headerPanel";
import SearchableSelect from "./components/select";
import {ModuleData, MonoProjectsModuleData} from "../../App";
import styles from "../taskDashboard/components/checkbox.module.css";
import GroupActionModal from "../taskDashboard/components";
import {OptionType} from "../taskDashboard";
import stylesButton from './index.module.css';


// Типы (упрощённые — оставьте свои)
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
    special_key_call: string;
    special_key_conn: string;
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

interface MergedField {
    /** внутренний ключ = name|type|opts|group */
    id: string;
    /** то, что покажем в заголовке поля */
    label: string;
    /** select | regular | multiselect и т.п. */
    type: string;
    /** исходные опции для select’а, если есть */
    values: string | null;
    /** в каких проектах это поле встречается */
    projects: string[];
    /** для каждого проекта — его родной field_id */
    fieldIds: Record<string, string>;
    /** (опционально) spatial-group, если она есть у FieldDefinition */
    spatialGroup?: string;
    /** (опционально) позиция в сетке, если нужно */
    position?: number;
}

type GroupFieldValues = Record<
    string,                     // project_name
    Record<string/*field_id*/, string/*value*/>
>;

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
    specialKey: string
    modules: ModuleData[]
    setModules: (modules: ModuleData[]) => void
    prefix: string
    outboundCall: boolean
    tuskMode:boolean
    fullWidthCard?: boolean
    setFullWidthCard?: (fullWidthCard: boolean) => void
    openedPhones?: any[]
    setOpenedPhones?: (openedPhones: any[]) => void
    monoModules?: MonoProjectsModuleData
    setMonoModules?: (monoModules: MonoProjectsModuleData) => void
    setActiveProjectName?: (activeProjectName: string) => void
    selectedPreset?: OptionType | null
}


const CallControlPanel: React.FC<CallControlPanelProps> = ({
                                                               specialKey,
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
                                                               tuskMode,
                                                               fullWidthCard,
                                                               setFullWidthCard,
                                                               openedPhones,
                                                               setOpenedPhones,
                                                               monoModules,
                                                               setMonoModules,
                                                               setActiveProjectName,
                                                               selectedPreset
                                                           }) => {
    // Из cookies
    const { sessionKey } = store.getState().operator
    useEffect(() => console.log("openedPhones: ", openedPhones),[openedPhones])
    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;
    const roomId     = useSelector((state: RootState) => state.room.roomId) || 'default_room';

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
    // useEffect(() => console.log("1111callReasons: ", callReasons),[callReasons])
    // useEffect(() => console.log("1111callResults: ", callResults),[callResults])
    // useEffect(() => console.log("1111params: ", params),[params])

    const [mergedFields, setMergedFields] = useState<MergedField[]>([]);
    const [values, setValues] = useState<GroupFieldValues>({});
    const [basicFields, setBasicFields] = useState<any[]>([])

    useEffect(() => console.log("values: ", values),[values])
    useEffect(() => console.log("1111values: ", values),[values])
    useEffect(() => console.log("1111mergedFields: ", mergedFields),[mergedFields])

    // Состояние для списка модулей, полученных с сервера
    // const [modules, setModules] = useState<ModuleData[]>([]);
    const [isParams, setIsParams] = useState<boolean>(true)
    const [groupSelectedIds, setGroupSelectedIds] = useState<number[]>([]);

    const [groupModalOpen, setGroupModalOpen] = useState(false);

    const moduleProjectMapRef = useRef<Record<number, string>>({});


    // const [projectsData, setProjectsData] = useState<ProjectFieldsResponse | null>(null);

    const getPhonesByIds = (ids: number[]) => {
        return openedPhones?.filter(p => ids.includes(p.id)) || [];
    };

    const groupProjects = useMemo(() => {
        if (!openedPhones) return [];
        return Array.from(new Set(openedPhones.map(p => p.project)));
    }, [openedPhones]);
    useEffect(() => console.log("groupProjects: ", groupProjects),[groupProjects])
    useEffect(() => setActiveProjectName?.(groupProjects[0]),[groupProjects, setActiveProjectName])
    const [selectedProjects, setSelectedProjects] = useState<string[]>(groupProjects);
    useEffect(() => console.log("555mergedFields: ", mergedFields),[mergedFields])

    const idProjectMap = useMemo(() =>
            openedPhones?.map(ph => ({ id: ph.id, project_name: ph.project })) || [],
        [openedPhones]);

    useEffect(() => {
        setSelectedProjects(groupProjects)
    },[groupProjects])

    const projectColors = useMemo(() => {
        const palette = [
            '#4c78a8', // спокойный синий
            '#f58518', // оранжевый (как в кнопке "перерыв")
            '#54a24b', // зелёный (но не яркий как #0f0)
            '#e45756', // мягкий красный (не ядреный)
            '#b279a2', // фиолетовый
            '#9d755d', // коричневатый / теплый нейтральный
            '#bab0ac', // серо-бежевый
            '#72b7b2', // бирюзовый
            '#f2cf5b', // жёлто-золотистый (подходит к твоему header'у)
            '#7b4173', // тёмно-лиловый
        ];        return groupProjects.reduce<Record<string,string>>((acc, proj, i) => {
            acc[proj] = palette[i % palette.length];
            return acc;
        }, {});
    }, [groupProjects]);

    const toggleProject = (proj: string) => {
        setSelectedProjects(prev => {
            if (prev.includes(proj)) {
                // не даём сбросить все
                if (prev.length === 1) return prev;
                return prev.filter(p => p !== proj);
            } else {
                return [...prev, proj];
            }
        });
    };

    const compact = tuskMode && fullWidthCard;
    const sanitize = (v: any) =>
        typeof v === 'string' && v.includes('|_|_|') ? '' : v;

    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    const projectPool = useSelector(selectFullProjectPool) || [];
    console.log("projectPool: ", projectPool)
    const projectPoolForCall = useMemo(() => {
        return projectPool.filter(project => (project.out_active && project.active)).map(project => project.project_name);
    }, [projectPool]);

    // Активные звонки (из redux)
    const activeCalls: ActiveCall[] = useSelector((state: RootState) => state.operator.activeCalls);
    // const hasActiveCall = Array.isArray(activeCalls) ? activeCalls.some(ac => Object.keys(ac).length > 0) : false

    // Логика «постобработки»
    const POST_LIMIT = worker.includes('fs@akc24.ru') ? 12000 : 15;
    const [postSeconds, setPostSeconds] = useState(POST_LIMIT);
    const [postCallData, setPostCallData] = useState<ActiveCall | null>(null);
    useEffect(() => console.log("postCall: ", postCallData),[postCallData])

    const forbiddenProjects = ['outbound', 'api_call', 'no_project_out'];
    const project = call?.project_name || '';
    const hideReportFields = forbiddenProjects.includes(project);

    const prevCallRef = useRef<ActiveCall | null>(null);

    const startModulesRanRef = useRef(false);

    useEffect(() => {
        if (openedPhones){
            const projects = Array.from(new Set(openedPhones.map(p => p.project)));
            // const projects = ["group_project_2", "group_project_1"];

            socket.emit("get_project_fields",{
                projects:projects,
                session_key: sessionKey,
                worker
            })
        }

    },[openedPhones])

// ────────────────────────────────────────────────────────────────────────────────
    const handleProjectFields = (data: {
        project_fields: string;
        as_is_dict: Record<string, FieldDefinition[]>;
        call_reasons: ReasonItem[];
        call_results: ResultItem[];
    }) => {
        // Если включён tuskMode, собираем mergedFields (вне зависимости от hasActiveCall)
        if (tuskMode) {
            const map = new Map<string, MergedField>();

            Object.entries(data.as_is_dict).forEach(([projName, fields]) => {
                if (!selectedProjects.includes(projName)) return;
                fields.forEach(f => {
                    const key = [
                        f.field_name,
                        f.field_type,
                        f.field_vals || "",
                        (f as any).spatial_group || "",
                    ].join("|");
                    if (!map.has(key)) {
                        map.set(key, {
                            id: key,
                            label: f.field_name,
                            type: f.field_type,
                            values: f.field_vals,
                            projects: [projName],
                            fieldIds: { [projName]: f.field_id },
                            spatialGroup: (f as any).spatial_group,
                        });
                    } else {
                        const e = map.get(key)!;
                        if (!e.projects.includes(projName)) {
                            e.projects.push(projName);
                            e.fieldIds[projName] = f.field_id;
                        }
                    }
                });
            });

            // Записали объединённые поля для tuskMode
            const merged = Array.from(map.values());
            setMergedFields(merged);

            // Инициализируем пустые значения сразу для всех выбранных проектов
            const init: GroupFieldValues = {};
            selectedProjects.forEach(p => {
                init[p] = {};
            });
            setValues(init);

            // Причины/результаты (тоже фильтруем по selectedProjects)
            setCallReasons(
                data.call_reasons.filter(r => selectedProjects.includes(r.project_name))
            );
            setCallResults(
                data.call_results.filter(r => selectedProjects.includes(r.project_name))
            );

            // При необходимости, мы также обновляем basicFields, чтобы в tuskMode
            // можно было опираться на них, если вам нужны оба набора полей:
            setBasicFields(merged);
        }
        // Если tuskMode выключен, работаем только с basicFields
        else {
            const map = new Map<string, MergedField>();

            Object.entries(data.as_is_dict).forEach(([projName, fields]) => {
                if (!selectedProjects.includes(projName)) return;
                fields.forEach(f => {
                    const key = [
                        f.field_name,
                        f.field_type,
                        f.field_vals || "",
                        (f as any).spatial_group || "",
                    ].join("|");
                    if (!map.has(key)) {
                        map.set(key, {
                            id: key,
                            label: f.field_name,
                            type: f.field_type,
                            values: f.field_vals,
                            projects: [projName],
                            fieldIds: { [projName]: f.field_id },
                            spatialGroup: (f as any).spatial_group,
                        });
                    } else {
                        const e = map.get(key)!;
                        if (!e.projects.includes(projName)) {
                            e.projects.push(projName);
                            e.fieldIds[projName] = f.field_id;
                        }
                    }
                });
            });

            // Только basicFields, без mergedFields и без инициализации значений
            setBasicFields(Array.from(map.values()));
        }
    };

    useEffect(() => console.log("setBasicFields: ", basicFields),[basicFields])
    useEffect(() => {
        if (!tuskMode) return;

        socket.on("project_fields", handleProjectFields);
        return () => {
            socket.off("project_fields", handleProjectFields);
        };
    }, [tuskMode, groupProjects, sessionKey, worker, activeCalls, openedPhones, handleProjectFields]);

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
        if (hasActiveCall) {
            // Очистка полей формы, как и раньше
            setCallReason('');
            setCallResult('');
            setComment('');
            setBaseFieldValues({});

        }
    },[hasActiveCall])

    useEffect(() => {
        if (!hasActiveCall) {
            startModulesRanRef.current = false;
        }
    }, [hasActiveCall]);

    useEffect(() => {

        if (hasActiveCall && activeCalls.length && !postActive && activeCalls[0].application){
            setPostCallData(activeCalls[0] as ActiveCall);
        }

        // if (hasActiveCall  && !postActive && activeCalls[0].application) {
        //     const startModules = modules.filter(
        //         (mod) => mod.start_modes && mod.start_modes[activeProject] === "start"
        //     );
        //     if (activeCalls.length === 1) {
        //         startModules.forEach((mod) => {
        //             handleModuleRun(mod);
        //         });
        //
        //     }
        // }
    }, [activeCalls, activeProject, hasActiveCall, modules, postActive]);

    const findNameProject = (projectName: string)=> {
        if (!projectName) return "";
        const found = projectPool.find(
            (proj) => proj.project_name === projectName
        );
        return found ? found.glagol_name : projectName;
    }

    useEffect(() => {
        if(!hasActiveCall && !postActive){
            setCallReason(call?.call_reason || '');
            setCallResult(call?.call_result || '');
            setComment(call?.user_comment || '');
            setBaseFieldValues(call?.base_fields || {});
        }
    }, [call]);

    useEffect(() => {
        if(!tuskMode){
            const handleFsReasons = (data: {
                call_reasons:  ReasonItem[];
                call_results:  ResultItem[];
                as_is_dict:    FieldDefinition[];
            } | null) => {
                if (!isParams || postActive) return
                if (data && !hasActiveCall && !postActive) {
                    setCallReasons(data.call_reasons.filter(r => r.project_name === call?.project_name || r.project_name === `${call?.project_name}@default`));
                    setCallResults(data.call_results.filter(r => r.project_name === call?.project_name || r.project_name === `${call?.project_name}@default`));
                    setParams(data.as_is_dict.filter(p => p.project_name === call?.project_name || p.project_name === `${call?.project_name}@default`));
                } else if (data && (hasActiveCall || postActive)) {
                    setCallReasons(data.call_reasons.filter(r => r.project_name === activeProject || r.project_name === `${activeProject}@default`));
                    setCallResults(data.call_results.filter(r => r.project_name === activeProject || r.project_name === `${activeProject}@default`));
                    setParams(data.as_is_dict.filter(p => p.project_name === activeProject || p.project_name === `${activeProject}@default`));
                } else {
                    setCallReasons([]);
                    setCallResults([]);
                    setParams([]);
                }
            };
            handleFsReasons(fsReasons)
        }

    }, [call, activeProject, fsReasons, hasActiveCall, isParams]);


    // ***** МОДУЛИ *****
    // При открытии панели вызова (если вызов не активен) запрашиваем список модулей
    // useEffect(() => {
    //     if (hasActiveCall && activeProject) {
    //         socket.emit('get_modules', {
    //             worker,
    //             session_key: sessionKey,
    //             project_name: activeProject,
    //         });
    //     }
    // }, [hasActiveCall, worker, sipLogin, sessionKey, roomId, activeProject]);
    //
    // // Обработка ответа сервера для "get_modules"
    // useEffect(() => {
    //     const handleModules = (data: any) => {
    //         console.log("modules: ", data)
    //         setModules(data);
    //     };
    //     socket.on('get_modules', handleModules);
    //     return () => {
    //         socket.off('get_modules', handleModules);
    //     };
    // }, [hasActiveCall, postActive]);

    // Обработка ответа сервера для "get_modules"
    useEffect(() => {
        // setModules([]);
        startModulesRanRef.current = false;

        if (!hasActiveCall) return;

        const handleModules = (data: any) => {
            // if (data.project !== activeProject) return;
            console.log("setmoduletuskmodeTRY")

            if (tuskMode) {
                if (data && typeof data === 'object' && setMonoModules) {
                    setMonoModules(data);
                }
            } else {
                console.log("setmoduletuskmodeFAKE")
                setModules(data[activeProject] || []);
            }
        };

        socket.on('get_modules', handleModules);
        if (tuskMode) {
            socket.emit('get_modules', {
                worker,
                // sip_login: sipLogin,
                session_key: sessionKey,
                // action: 'get_modules',
                projects: selectedProjects,
            });

        } else {
            socket.emit('get_modules', {
                worker,
                // sip_login: sipLogin,
                session_key: sessionKey,
                // action: 'get_modules',
                projects: [activeProject],
            });

        }

        return () => {
            socket.off('get_modules', handleModules);
            // setModules([]);
        };

}, [hasActiveCall, activeProject, worker, sessionKey, setModules, tuskMode, setMonoModules, selectedProjects]);

    const handleModuleRun = (mod: ModuleData) => {
        if (tuskMode && mod.common_code === true && monoModules) {
            // Найдём все проекты, в которых есть этот модуль
            const projectList = Object.entries(monoModules)
                .filter(([_, mods]) => mods.some(m => m.filename === mod.filename))
                .map(([project]) => project);

            projectList.forEach(project => {
                const fieldMap = values[project] || {};

                const kwargsPayload: Record<string, string> = {};

                Object.entries(mod.kwargs || {}).forEach(([inputName, spec]: [string, any]) => {
                    const sourceKey: string = spec.source;
                    let value = '';

                    switch (sourceKey) {
                        case 'operator_id':
                            value = sipLogin;
                            break;
                        case 'call_reason': {
                            const reasonItem = callReasons.find(r => String(r.id) === String(callReason));
                            value = reasonItem?.name || '';
                            break;
                        }
                        case 'call_result': {
                            const resultItem = callResults.find(r => String(r.id) === String(callResult));
                            value = resultItem?.name || '';
                            break;
                        }
                        case 'phone':
                            value = activeCalls[0]?.direction === 'outbound'
                                ? activeCalls[0]?.b_dest
                                : activeCalls[0]?.cid_num;
                            break;
                        case 'uuid':
                            value = activeCalls[0]?.uuid || postCallData?.uuid || '';
                            break;
                        case 'b_uuid':
                            value = activeCalls[0]?.b_uuid || postCallData?.uuid || '';
                            break;
                        case 'datetime_start':
                            value = activeCalls[0]?.created || '';
                            break;
                        case 'dest':
                            value = activeCalls[0]?.dest || '';
                            break;
                        case 'cid_num':
                            value = activeCalls[0]?.cid_num || '';
                            break;
                        case 'comment':
                            value = comment;
                            break;
                        default:
                            value = fieldMap[sourceKey] || '';
                    }

                    kwargsPayload[sourceKey] = value;
                });

                moduleProjectMapRef.current[mod.id] = project;

                const payload = {
                    filename: mod.filename,
                    project_name: project,
                    session_key: sessionKey,
                    uuid: activeCalls[0]?.uuid || postCallData?.uuid || '',
                    b_uuid: activeCalls[0]?.b_uuid || postCallData?.uuid || '',
                    worker,
                    kwargs: kwargsPayload,
                };

                socket.emit('run_module', payload);
            });

            return; // завершаем, т.к. общий модуль уже отработал по всем проектам
        }

        // Обычный запуск для одиночного project-модуля
        let project = activeProject;
        let fieldMap = baseFieldValues;

        if (tuskMode && monoModules) {
            const foundEntry = Object.entries(monoModules).find(
                ([_, mods]) => mods.includes(mod)
            );
            if (!foundEntry) {
                console.warn("Не удалось определить проект модуля:", mod.filename);
                return;
            }
            project = foundEntry[0];
            fieldMap = values[project] || {};
        }

        const kwargsPayload: Record<string, string> = {};

        Object.entries(mod.kwargs || {}).forEach(([inputName, spec]: [string, any]) => {
            const sourceKey: string = spec.source;
            let value = '';

            switch (sourceKey) {
                case 'operator_id':
                    value = sipLogin;
                    break;
                case 'call_reason': {
                    const reasonItem = callReasons.find(r => String(r.id) === String(callReason));
                    value = reasonItem?.name || '';
                    break;
                }
                case 'call_result': {
                    const resultItem = callResults.find(r => String(r.id) === String(callResult));
                    value = resultItem?.name || '';
                    break;
                }
                case 'phone':
                    value = activeCalls[0]?.direction === 'outbound'
                        ? activeCalls[0]?.b_dest
                        : activeCalls[0]?.cid_num;
                    break;
                case 'uuid':
                    value = activeCalls[0]?.uuid || postCallData?.uuid || '';
                    break;
                case 'b_uuid':
                    value = activeCalls[0]?.b_uuid || postCallData?.uuid || '';
                    break;
                case 'datetime_start':
                    value = activeCalls[0]?.created || '';
                    break;
                case 'dest':
                    value = activeCalls[0]?.dest || '';
                    break;
                case 'cid_num':
                    value = activeCalls[0]?.cid_num || '';
                    break;
                case 'comment':
                    value = comment;
                    break;
                default:
                    value = fieldMap[sourceKey] || '';
            }

            kwargsPayload[sourceKey] = value;
        });

        moduleProjectMapRef.current[mod.id] = project;

        const payload = {
            filename: mod.filename,
            project_name: project,
            session_key: sessionKey,
            uuid: activeCalls[0]?.uuid || postCallData?.uuid || '',
            b_uuid: activeCalls[0]?.b_uuid || postCallData?.uuid || '',
            worker,
            kwargs: kwargsPayload,
        };

        socket.emit('run_module', payload);
    };

    //
    useEffect(() => {
        const handleModuleResult = (...args: any[]) => {
            const dataObj: Record<string, any> | undefined = args.find(
                a => typeof a === 'object' && a !== null
            );
            if (!dataObj) return;

            // ───── Определяем проект ─────
            let project = activeProject;
            if (tuskMode) {
                // Пытаемся определить проект по полям
                const fieldKeys = Object.keys(dataObj);
                const guess = fieldKeys.find(f =>
                    Object.entries(values).some(([proj, fields]) =>
                        Object.keys(fields).includes(f)
                    )
                );
                if (guess) {
                    const entry = Object.entries(values).find(([proj, fields]) =>
                        fields.hasOwnProperty(guess)
                    );
                    if (entry) {
                        project = entry[0];
                    }
                }
            }

            // ───── Обработка module_return-подобных структур ─────
            Object.entries(dataObj).forEach(([fieldKey, value]) => {
                const v = value == null ? '' : String(value);

                switch (fieldKey) {
                    case 'call_reason':
                        setCallReason(v);
                        break;
                    case 'call_result':
                        setCallResult(v);
                        break;
                    case 'comment':
                        setComment(v);
                        break;
                    default:
                        if (tuskMode) {
                            setValues(prev => ({
                                ...prev,
                                [project]: {
                                    ...prev[project],
                                    [fieldKey]: v
                                }
                            }));
                        } else {
                            setBaseFieldValues(prev => ({
                                ...prev,
                                [fieldKey]: v
                            }));
                        }
                }
            });

            Swal.fire({
                title: 'Успех',
                text: 'Результат работы модуля передан в систему',
                icon: 'success'
            });
        };

        socket.on('run_module', handleModuleResult);
        return () => {
            socket.off('run_module', handleModuleResult);
        };
    }, [
        activeProject,
        values,
        tuskMode,
        setCallReason,
        setCallResult,
        setComment,
        setBaseFieldValues,
        setValues
    ]);

    // Логика постобработки (если звонок завершён)
    useEffect(() => {
        const prevCall = prevCallRef.current;
        const thisCall = hasActiveCall ? activeCalls[0] : null;
        if (prevCall && !postActive && !activeCalls[0]?.application ) {
            socket.emit('fs_post_started', {
                session_key: sessionKey,
                sip_login: sipLogin,
                worker
            })
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
            sip_login: sipLogin,
            worker,
            session_key: sessionKey,
            state: 'waiting',
            reason: 'auto_return',
            page: 'online',
        });
        setPostActive(false);
        setIsParams(true)
        setPostSeconds(POST_LIMIT);
        setCallReason('');
        setCallResult('');
        setComment('');
        setBaseFieldValues({});
    };

    // Функции управления активным вызовом: удержание и завершение
    const handleHold = (activeCall: ActiveCall) => {
        const currentUUID = activeCall?.call_uuid;
        if (!currentUUID) return;
        socket.emit('sofia_operations', {
            worker,
            session_key: sessionKey,
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
            uuid: currentUUID,
            action: 'uuid_break',
            idle_set: true
        });
        setIsLoading(true)
        socket.emit('get_fs_report', {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            level: 0,
        });
        if (callSection === 1) {
            socket.emit('fs_post_started', {
                session_key: sessionKey,
                sip_login: sipLogin,
                worker
            })
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
            session_key: sessionKey,
            uuid: uuid1,
            uuid_2: uuid2,
            action: 'uuid_bridge'
        });
    };

    useEffect(()=> console.log("selectedCall: ", call),[call])
    const handleSave = () => {
        if (!callReason || !callResult) {
            Swal.fire({ title: "Ошибка", text: "Проверьте заполнение обязательных полей", icon: "error" });
            return;
        }
        const reasonNumber = typeof callReason === "string" ? parseInt(callReason, 10) : callReason
        const resultNumber = typeof callResult === "string" ? parseInt(callResult, 10) : callResult

        const sanitizedBaseFields = Object.fromEntries(
            Object.entries(baseFieldValues).map(([k, v]) => [k, sanitize(v)])
        );

        socket.emit('edit_call_fs', {
            // b_uuid: call?.special_key_call ,
            uuid: call?.special_key_conn ,
            // call_id: call?.id,
            project_name: call?.project_name,
            call_reason: reasonNumber,
            call_result: resultNumber,
            comment,
            session_key: sessionKey,
            worker,
            base_fields: sanitizedBaseFields,
            // reason_text: reasonText,
            // result_text: resultText
        });
        setIsLoading(true)
        socket.emit('get_fs_report', {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            level: (currentPage - 1) * 10,
        });
        onClose();
    };

    const handleGroupSave = () => {
        if (!callReason || !callResult) {
            Swal.fire({ title: "Ошибка", text: "Выберите причину и результат", icon: "error" });
            return;
        }
        if (!groupModalOpen) {
            setGroupModalOpen(true);
            return;
        }

        const selectedContacts = getPhonesByIds(groupSelectedIds);
        const statusText = callResults.find(r => String(r.id) === String(callResult))?.name || '';

        const groupedByProject = selectedContacts.reduce<Record<string, string[]>>((acc, contact) => {
            if (!acc[contact.project]) {
                acc[contact.project] = [];
            }
            acc[contact.project].push(contact.phone);
            return acc;
        }, {});

        if (statusText) {
            Object.entries(groupedByProject).forEach(([project_name, phones]) => {
                socket.emit("update_phone_status", {
                    phones,
                    project_name,
                    session_key: sessionKey,
                    worker,
                    status: statusText,
                });
            });
        }

        const reasonNum = Number(callReason);
        const resultNum = Number(callResult);

        const projectsPayload: Record<string, {
            call_reason: number;
            call_result: number;
            comment: string;
            base_fields: Record<string, string>;
        }> = {};

        selectedProjects.forEach(proj => {
            const baseFieldsForProj = values[proj] || {};
            const sanitizedFields = Object.fromEntries(
                Object.entries(baseFieldsForProj).map(([fid, val]) =>
                    [fid, typeof val === "string" && val.includes("|_|_|") ? "" : val]
                )
            );

            projectsPayload[proj] = {
                call_reason: reasonNum,
                call_result: resultNum,
                comment,
                base_fields: sanitizedFields,
            };
        });

        const b_uuid = postCallData?.b_uuid;
        const uuid = postCallData?.uuid;

        socket.emit("edit_call_fs", {
            b_uuid,
            uuid,
            session_key: sessionKey,
            worker,
            projects: projectsPayload,
        });
        socket.emit("change_state_fs", {
            sip_login: sipLogin,
            worker,
            session_key: sessionKey,
            state: "waiting",
            reason: "manual_return",
            page: "online",
        });
        setIsLoading(true);
        setOpenedPhones?.([])
        setPostActive(false);
        setPostSeconds(POST_LIMIT);
        onClose();
    };
    const handlePostSave = () => {
        if (!callReason || !callResult) {
            Swal.fire({
                title: "Ошибка",
                text: "Проверьте заполнение обязательных полей",
                icon: "error",
            });
            return;
        }
        if(tuskMode) {
            handleGroupSave()
        } else {
            const reasonText =
                callReasons.find((r) => String(r.id) === callReason)?.name || "";
            const resultText =
                callResults.find((r) => String(r.id) === callResult)?.name || "";

            const reasonNumber = typeof callReason === "string" ? parseInt(callReason, 10) : callReason
            const resultNumber = typeof callResult === "string" ? parseInt(callResult, 10) : callResult
            if (outboundCall) {
                socket.emit('outbound_call_update', {
                    'worker': worker,
                    'session_key':sessionKey,
                    'assigned_key': assignedKey,
                    'base_fields':baseFieldValues,
                    'log_status':'saved',
                    'phone_status': resultText,
                    'special_key':specialKey,
                    'project_name':outActiveProjectName
                })
            }
            const uuid = postCallData?.direction === "outbound" ? postCallData?.call_uuid : postCallData?.b_uuid
            const b_uuid = postCallData?.direction === "outbound" ? postCallData?.call_uuid : postCallData?.uuid
            const sanitizedBaseFields = Object.fromEntries(
                Object.entries(baseFieldValues).map(([k, v]) => [k, sanitize(v)])
            );

            socket.emit("edit_call_fs", {
                b_uuid,
                uuid,
                project_name: activeProject,
                call_reason: reasonNumber,
                call_result: resultNumber,
                comment,
                session_key: sessionKey,
                worker,
                base_fields: sanitizedBaseFields,
                // reason_text: reasonText,
                // result_text: resultText,
            });
            // socket.emit('edit_call_fs', {
            //     b_uuid: call?.special_key_call ,
            //     uuid: call?.special_key_conn ,
            //     // call_id: call?.id,
            //     project_name: call?.project_name,
            //     call_reason: reasonNumber,
            //     call_result: resultNumber,
            //     comment,
            //     session_key: sessionKey,
            //     worker,
            //     base_fields: baseFieldValues,
            //     // reason_text: reasonText,
            //     // result_text: resultText
            // });

            socket.emit("change_state_fs", {
                sip_login: sipLogin,
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
                level: 0,
            });
            setIsParams(true)
            setPostActive(false);
            setPostSeconds(POST_LIMIT);
            onClose();
        }
    };


    const [callDuration, setCallDuration] = useState(0);
    const [secondCallDuration, setSecondCallDuration] = useState(0)

    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (hasActiveCall) {
            interval = setInterval(() => {
                // const startTimeStr = activeCalls[0].b_created;
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

    const callFromCard = (project_name: string, phone: string) => {
        socket.emit('call',{
            phone,
            project_name,
            session_key: sessionKey,
            sip_login: sipLogin,
            worker: worker
        })
    }

    const getGroupProjects = (
        openedPhones: Array<{ phone: string; project: string }>
    ): string[] => {
        if (!openedPhones?.length) return [];
        // Извлекаем все project и убираем дубликаты
        const projectsSet = new Set(openedPhones.map(p => p.project));
        return Array.from(projectsSet);
    };

    const findProjectPrefix = (projectName: string) => {
        const project = projectPool.find(p => p.project_name === projectName);
        return project.out_gateways[2].prefix
    }
    const renderGroupPhones = () => {
        if (!openedPhones?.length) return null;

        const byPhone = openedPhones.reduce<Record<string, Set<string>>>((acc, ph) => {
            const { phone, project } = ph;
            if (!acc[phone]) acc[phone] = new Set();
            acc[phone].add(project);
            return acc;
        }, {});
        const grouped = Object.entries(byPhone).map(([phone, projectsSet]) => ({
            phone,
            projects: Array.from(projectsSet),
        }));

        const allProjects = getGroupProjects(openedPhones);
        return (
            <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start"}}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {grouped.map(({ phone, projects }) => (
                        <div
                            key={phone}
                            style={{
                                display: "flex",
                                flexDirection: "row",
                                gap: 8,
                                alignItems: "center",
                            }}
                        >
                            <div style={{ fontSize: 16, fontWeight: 600 }}>
                                {phone}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {projects.length === 1
                                    ? (
                                        <button
                                            className="btn btn-sm btn-outline-success"
                                            onClick={() => callFromCard(projects[0], phone)}
                                        >
                                            Вызов
                                        </button>
                                    ) : (
                                        projects.map(proj => (
                                            <button
                                                key={proj}
                                                className="btn btn-sm btn-outline-success"
                                                onClick={() => callFromCard(proj, phone)}
                                            >
                                                Вызов {findNameProject(proj)}
                                            </button>
                                        ))
                                    )}
                            </div>
                        </div>
                    ))}
                    <div style={{display: "flex", flexDirection: "row", fontSize:"16px", fontWeight: "600", gap: 8}}>
                        Проекты:
                        <div style={{display: "flex", flexDirection: "row", gap: 4}}>
                            {allProjects.map(proj => (
                                <div>{findNameProject(proj)}</div>
                            ))}
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => setOpenedPhones?.([])}
                    className="btn btn-outline-light text-dark"
                    style={{  height: 44 }}
                >
                    <span className="material-icons" style={{marginTop: 4, marginLeft: 2}}>close</span>
                </button>
            </div>
        );
    };

    const renderActiveCallHeader = (activeCall: ActiveCall) => {
        const mainActiveCall = activeCall || postCallData
        const isHeld = (mainActiveCall.callstate === 'HELD' || mainActiveCall.b_callstate === 'HELD');
        const iconName = isHeld ? 'play_arrow' : 'pause';
        const iconColor = mainActiveCall.direction === 'outbound' ?  '#f26666' : '#7cd420';
        return (
            <div className="mb-3">
                <div className="d-flex">
                    <button className="btn btn-outline-warning mr-2" onClick={() => handleHold(mainActiveCall)}>
                        <span className="material-icons">{iconName}</span>
                    </button>
                    <button className="btn btn-outline-danger mr-2" onClick={() => handleStop(mainActiveCall, 1)}>
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
                    {mainActiveCall.direction === 'outbound' ? 'logout' : 'login'}
                  </span>
                    <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600}}>
                        {mainActiveCall.direction === 'outbound' ? mainActiveCall.callee_num || extractSuffix(mainActiveCall.cid_num) : extractSuffix(mainActiveCall.cid_num)}
                        {' | '}
                        {new Date(mainActiveCall.created).toLocaleString()}
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
                {!tuskMode && <strong style={{whiteSpace: 'nowrap', marginTop: "4px", fontWeight: 600, fontSize: 16}}>
                    {`Проект: ${findNameProject(activeProject)}`}
                </strong>}
            </div>
        );
    };
    useEffect(() => console.log("activeProject: ", activeProject),[activeProject])
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
                {!tuskMode && <label className="mt-3"
                        style={{whiteSpace: 'nowrap', marginTop: "4px", fontWeight: 600, fontSize: 16}}>
                    {`Проект: ${findNameProject(activeProject)}`}
                </label>}
            </div>
        );
    };

    const renderSecondCall = () => {
        if (activeCalls.length > 1 && Object.keys(activeCalls[1]).length > 0 && activeCalls[1].application) {
            const sc = activeCalls[1];
            const isHeld = sc.callstate === 'HELD' || sc.b_callstate === 'HELD';
            const iconName = isHeld ? 'play_arrow' : 'pause';
            const iconColor = sc.direction === 'outbound' ? '#f26666' : '#7cd420';
            // Вычисляем длительность второго звонка (в секундах)
            // const secondCallDuration = Math.floor(
            //     (Date.now() - new Date(sc.b_created).getTime()) / 1000
            // );

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


    const commonModules = useMemo(() => {
        if (!monoModules) return [];

        const entries = Object.entries(monoModules);
        if (entries.length === 0) return [];

        const moduleMap: Record<string, { count: number, sample: ModuleData }> = {};

        for (const [_, mods] of entries) {
            const uniqueFilenames = new Set<string>();
            for (const mod of mods) {
                if (!mod.common_code) continue;
                if (uniqueFilenames.has(mod.filename)) continue;

                uniqueFilenames.add(mod.filename);
                if (!moduleMap[mod.filename]) {
                    moduleMap[mod.filename] = { count: 1, sample: mod };
                } else {
                    moduleMap[mod.filename].count += 1;
                }
            }
        }

        const totalProjects = entries.length;

        return Object.values(moduleMap)
            .filter(({ count }) => count === totalProjects)
            .map(({ sample }) => sample);
    }, [monoModules]);
    console.log("commonModules: ", commonModules)
    const projectModules = useMemo(() => {
        if (!monoModules) return {};

        const commons = new Set(commonModules.map(mod => mod.filename));

        const result: Record<string, ModuleData[]> = {};
        for (const [project, mods] of Object.entries(monoModules)) {
            result[project] = mods.filter(mod => !commons.has(mod.filename));
        }

        return result;
    }, [monoModules, commonModules]);
    console.log("projectModules: ", projectModules)
    const renderModules = () => {
        if (!hasActiveCall && !postActive) {
            return null
        };

        // console.log("renderModules: ", modules)
        if ((!tuskMode && modules.length === 0) || (tuskMode && monoModules && Object.values(monoModules).flat().length === 0)) {
            return null
        };
        if (!tuskMode) {
            return (
                <div style={{display: "flex", flexDirection: "row", gap: 8, alignItems: "center", marginLeft:20, marginBottom: 10}}>
                    <div style={{fontWeight: 600, fontSize: 16}}>Модули: </div>
                    {modules.map((mod, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleModuleRun(mod)}
                            className="btn btn-outline-success"
                        >
                            {mod.filename}
                        </button>
                    ))}
                </div>
            );
        } else if (monoModules) {
            return (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginLeft: 20, marginBottom: 10 }}>
                    {commonModules.map((mod, idx) => (
                        <button
                            key={`common-${mod.filename}-${idx}`}
                            onClick={() => handleModuleRun(mod)}
                            className="btn btn-outline-dark"
                        >
                            {mod.filename}
                        </button>
                    ))}

                    {/* Проектные модули с цветами проекта */}
                    {Object.entries(projectModules).map(([proj, mods]) =>
                        mods.map((mod, idx) => (
                            <button
                                key={`${proj}-${mod.filename}-${idx}`}
                                onClick={() => handleModuleRun(mod)}
                                className="btn"
                                style={{
                                    border: `1px solid ${projectColors[proj]}`,
                                    color: projectColors[proj]
                                }}
                            >
                                {mod.filename}
                            </button>
                        ))
                    )}
                </div>
            );
        }
    };

    const renderSelectedCallHeader = () => {
        return(
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
        )
    }


    const commonFields = mergedFields.filter(f => f.projects.length > 1);

    const uniqueFieldsByProject: Record<string, MergedField[]> = {};
    selectedProjects.forEach(proj => {
        uniqueFieldsByProject[proj] =
            mergedFields.filter(f => f.projects.length === 1 && f.projects[0] === proj);
    });

    const shouldShowMeta = tuskMode
        ? (hasActiveCall || postActive)
        : (hasActiveCall || postActive || !hideReportFields);

    useEffect(() => console.log("uniqueFieldsByProject: ", uniqueFieldsByProject),[commonFields])
    useEffect(() => console.log("uniqueFieldsByProjectcommonFields: ", commonFields),[commonFields])

    console.log("")
    const memoizedIds = useMemo(() => {
        return openedPhones?.map(p => p.id) || [];
    }, [openedPhones]);

    return (
        <div style={{marginTop: 20}}>
            {renderModules()}
        <div className="col ml-2 pr-0 mr-0">
            <div className="card col ml-0">
                <div className="card-body">
                    {hasActiveCall && renderActiveCallHeader(activeCalls[0])}
                    {!hasActiveCall && postActive && renderPostCallHeader()}
                    {tuskMode && !hasActiveCall && !postActive && renderGroupPhones()}
                    <div>
                            {!tuskMode && !hasActiveCall && !postActive && (
                                renderSelectedCallHeader()
                            )}
                            {shouldShowMeta && (
                                <div
                                    className="form-group d-flex align-items-center"
                                    style={
                                        compact
                                            ? { flex: '1 1 calc(50% - 12px)', minWidth: 0 }
                                            : { flex: '1 1 0%', minWidth: 0 }
                                    }
                                >
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

                            {/* Результат звонка */}
                            {shouldShowMeta && (
                                <div
                                    className="form-group d-flex align-items-center"
                                    style={
                                        compact
                                            ? { flex: '1 1 calc(50% - 22px)', minWidth: 0 }
                                            : { flex: '1 1 0%', minWidth: 0 }
                                    }
                                >
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
                        {(tuskMode && (hasActiveCall || postActive)) && (
                            <div style={{ padding:1}}>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {groupProjects
                                        .filter(proj => typeof proj === 'string' && proj.trim() !== '' && proj !== "0")
                                        .map(proj => {
                                            const selected = selectedProjects.includes(proj);
                                            return (
                                                <button
                                                    key={proj}
                                                    onClick={() => toggleProject(proj)}
                                                    disabled={selectedProjects.length === 1 && selectedProjects[0] === proj}
                                                    className={`${stylesButton.projectButton} ${selected ? stylesButton.active : ''}`}
                                                    style={{
                                                        color: selected ? '#fff' : projectColors[proj],
                                                        background: selected ? projectColors[proj] : 'transparent',
                                                        borderColor: projectColors[proj],
                                                        borderRadius: '0.75rem',
                                                    }}
                                                >
                                                    {findNameProject(proj)}
                                                </button>
                                            );
                                        })}
                                </div>

                                {commonFields.length > 0 && <div style={{marginTop: 8, marginBottom: 8}}>
                                    <div style={{
                                        border: `1px solid black`,
                                        borderRadius: 4,
                                        padding: 8
                                    }}>
                                        {commonFields.map(f => (
                                            <div key={f.id}>
                                                <EditableFields
                                                    params={[{
                                                        field_id: f.id,
                                                        field_name: f.label,
                                                        field_type: f.type,
                                                        field_vals: f.values,
                                                        editable: true,
                                                        must_have: false,
                                                        project_name: ''
                                                    }]}
                                                    initialValues={{[f.id]: values[f.projects[0]][f.fieldIds[f.projects[0]]] || ''}}
                                                    onChange={nv => {
                                                        const v = nv[f.id] || '';
                                                        setValues(cur => {
                                                            const copy = {...cur};
                                                            f.projects.forEach(proj => {
                                                                copy[proj] = {...copy[proj], [f.fieldIds[proj]]: v};
                                                            });
                                                            return copy;
                                                        });
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>}

                                {/* 2) УНИКАЛЬНЫЕ поля по проектам */}
                                <div style={{marginTop: 4, marginBottom: 4}}>
                                    {selectedProjects.map(proj => (
                                        uniqueFieldsByProject[proj].length ?
                                        <div style={{
                                            border: `1px solid ${projectColors[proj]}`,
                                            borderRadius: 4,
                                            padding: 8
                                        }}>
                                            {uniqueFieldsByProject[proj].map(f => (
                                                <div key={f.id}>
                                                    <EditableFields
                                                        params={[{
                                                            field_id: f.id,
                                                            field_name: f.label,
                                                            field_type: f.type,
                                                            field_vals: f.values,
                                                            editable: true,
                                                            must_have: false,
                                                            project_name: ''
                                                        }]}
                                                        initialValues={{[f.id]: values[proj][f.fieldIds[proj]] || ''}}
                                                        onChange={nv => {
                                                            const v = nv[f.id] || '';
                                                            setValues(cur => ({
                                                                ...cur,
                                                                [proj]: {...cur[proj], [f.fieldIds[proj]]: v}
                                                            }));
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div> : null
                                        )
                                    )}
                                </div>
                            </div>
                        )}
                        {tuskMode && !(hasActiveCall || postActive) && (
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                                    gap: 16,
                                    marginTop: 24,
                                }}
                            >
                                {openedPhones?.map(phone => (
                                    <div
                                        key={phone.id}
                                        style={{
                                            border: "1px solid #ddd",
                                            borderRadius: 8,
                                            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                                            padding: 16,
                                            display: "flex",
                                            flexDirection: "column",
                                        }}
                                    >
                                        {/* Шапка карточки */}
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                marginBottom: 12,
                                            }}
                                        >
                                            <div style={{ fontSize: 18, fontWeight: 600 }}>{phone.phone}</div>
                                        </div>

                                        {/* Тело карточки: contact_info */}
                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                            {phone.contact_info &&
                                                Object.entries(phone.contact_info).map(([fieldId, value]) => {
                                                    const fieldDef = basicFields.find(
                                                        f => f.fieldIds[phone.project] === fieldId
                                                    );
                                                    const label = fieldDef ? fieldDef.label : fieldId;
                                                    return (
                                                        <div
                                                            key={fieldId}
                                                            style={{ display: "flex", fontSize: 14, color: "#333" }}
                                                        >
                                                            <div style={{ width: "40%", fontWeight: 500 }}>{label}:</div>
                                                            <div style={{ width: "60%" }}>{String(value)}</div>
                                                        </div>
                                                    );
                                                })}
                                            <div style={{ fontSize: 14, color: "#333", marginTop: 4, fontWeight: 500 }}>
                                                Проект: <span style={{ fontWeight: 500 }}>{findNameProject(phone.project)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Дополнительные поля */}
                            <div
                                style={
                                    compact
                                        ? { flex: '1 1 100%', minWidth: 0 }
                                        : {}
                                }
                            >
                                <EditableFields
                                    params={params}
                                    initialValues={baseFieldValues}
                                    onChange={setBaseFieldValues}
                                    augmentSaved={!hasActiveCall && !postActive}
                                    compact={tuskMode && fullWidthCard}
                                />
                            </div>

                            {/* Комментарий */}
                            {shouldShowMeta && (
                                <div
                                    className="form-group"
                                    style={
                                        compact
                                            ? { flex: '1 1 100%', minWidth: 0 }
                                            : {}
                                    }
                                >
                                    <textarea
                                        className="form-control"
                                        placeholder="Введите комментарий"
                                        value={comment}
                                        onChange={e => setComment(e.target.value)}
                                        style={compact ? { width: '100%' } : {}}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Кнопка «Сохранить» для обычного режима */}
                        {(shouldShowMeta && !tuskMode) && (
                            <div className="card-footer d-flex justify-content-end">
                                <button className="btn btn-outline-success" onClick={handleSave}>
                                    Сохранить
                                </button>
                            </div>
                        )}

                        {/* Постобработка */}
                        {postActive && (
                            <div className="mt-3">
                                <p>Постобработка: осталось {postSeconds} сек.</p>
                                <button
                                    className="btn btn-outline-success"
                                    onClick={handlePostSave}
                                    // disabled={isLoading}
                                >
                                    Сохранить и вернуться на линию
                                </button>
                            </div>
                        )}
                    {(tuskMode) &&
                        <div className="d-flex justify-end mb-3">
                            <label style={{ cursor: 'pointer', fontWeight: 500, display: "flex", gap: 8 }}>
                                <input
                                    type="checkbox"
                                    checked={fullWidthCard}
                                    className={styles.customCheckbox}
                                    onChange={() => setFullWidthCard ? setFullWidthCard(!fullWidthCard) : console.log("nan")}
                                />
                                <div style={{ marginTop: 2}}>
                                    На всю ширину
                                </div>
                            </label>
                        </div>}
                    </div>
                </div>
            </div>
            {renderSecondCall()}
            {tuskMode && (hasActiveCall || postActive) && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, marginLeft: 16 }}>
                    {groupProjects.map(proj => {
                        const isActive = activeProject === proj;
                        return (
                            <button
                                key={proj}
                                onClick={() => setActiveProjectName?.(proj)}
                                className={`${stylesButton.projectButton} ${isActive ? stylesButton.active : ''}`}
                                style={{
                                    color: isActive ? '#fff' : projectColors[proj],
                                    backgroundColor: isActive ? projectColors[proj] : 'transparent',
                                    borderColor: projectColors[proj]
                                }}
                            >
                                {findNameProject(proj)}
                            </button>
                        );
                    })}
                </div>
            )}

            <GroupActionModal
                isOpen={groupModalOpen}
                onClose={() => setGroupModalOpen(false)}
                preset={selectedPreset?.preset ?? null}
                ids={memoizedIds}
                glagolParent="fs.at.glagol.ai"
                role="admin"
                idProjectMap={idProjectMap}
                onSelectionChange={setGroupSelectedIds}
                handleGroupSave={handleGroupSave}
            />
        </div>
    );
};

export default CallControlPanel;
