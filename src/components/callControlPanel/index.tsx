import React, {useState, useEffect, useRef, useMemo} from 'react';
import { socket } from '../../socket';
import PhoneProjectSelect from './components/PhoneProjectSelect';
import { useSelector } from "react-redux";
import {RootState, store} from "../../redux/store";
import Swal from "sweetalert2";
import EditableFields from "./components";
import {makeSelectFullProjectPool} from "../../redux/operatorSlice";
import SearchableSelect from "./components/select";
import {ModuleData, MonoProjectsModuleData} from "../../App";
import styles from "../taskDashboard/components/checkbox.module.css";
import GroupActionModal from "../taskDashboard/components";
import {OptionType, Preset} from "../taskDashboard";
import stylesButton from './index.module.css';


// Типы (упрощённые — оставьте свои)

interface Project {
    comment: string | null;
    call_reason: number | null;
    call_result: number | null
    base_fields: {
        [field: string]: any;
    };
    // …any other props on each project
}

type ProjectsMap = Record<string, Project>;

declare const call: {
    projects: ProjectsMap;
};

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
    variable_last_arg: string;
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
    total_direction?: 'inbound' | 'outbound'
    special_key_call: string;
    special_key_conn: string;
    projects: ProjectsMap
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

    editable: boolean;
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
    group_id?: number | null ;
    group_position?: number | null;
}

type GroupFieldValues = Record<
    string,                     // project_name
    Record<string/*field_id*/, string/*value*/>
>;

export interface ExpressState {
    project: string;
    express_id: number;
    active: boolean;
    calls: number;
    agents: string[];
}

interface CallControlPanelProps {
    call: CallData | null;
    onClose: () => void;
    activeProject: string;
    postActive: boolean;
    setPostActive: (postActive: boolean) => void;
    currentPage: number;
    hasActiveCall: boolean
    outActivePhone: string | null
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
    setTuskMode?: (tuskMode:boolean) => void
    fullWidthCard?: boolean
    setFullWidthCard?: (fullWidthCard: boolean) => void
    openedPhones?: any[]
    setOpenedPhones?: (openedPhones: any[]) => void
    monoModules?: MonoProjectsModuleData
    setMonoModules?: (monoModules: MonoProjectsModuleData) => void
    setActiveProjectName?: (activeProjectName: string) => void
    selectedPreset?: OptionType | null
    postCallData: ActiveCall | null
    setPostCallData: (postCallData: ActiveCall | null) => void
    role?: string,
    setOpenedGroup?: (group: any[]) => void
    setPhonesData?: (group: any[]) => void
    momoProjectRepo?: React.MutableRefObject<boolean>;
    startModulesRanRef: React.MutableRefObject<boolean>;
}

type PhoneGroup = {
    phone: string;
    entries: Array<{
        project: string;
        contact_info: Record<string, string>;
    }>;
};

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
                                                               setTuskMode,
                                                               fullWidthCard,
                                                               setFullWidthCard,
                                                               openedPhones,
                                                               setOpenedPhones,
                                                               monoModules,
                                                               setMonoModules,
                                                               setActiveProjectName,
                                                               selectedPreset,
                                                               postCallData,
                                                               setPostCallData,
                                                               role,
                                                               setOpenedGroup,
                                                               setPhonesData,
                                                               momoProjectRepo,
                                                               startModulesRanRef
                                                           }) => {
    // Из cookies
    const { sessionKey } = store.getState().operator
    useEffect(() => console.log("monoModulesCallControlPanel: ", monoModules),[monoModules])
    console.log("startModulesRanRef: ", startModulesRanRef)
    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;
    const [manualNumber, setManualNumber] = useState('');
    // Состояния для формы

    const [callReason, setCallReason] = useState('');
    const [callResult, setCallResult] = useState('');
    const [comment,   setComment]     = useState('')
    const [baseFieldValues, setBaseFieldValues] = useState<{ [fieldId: string]: string }>(
        call?.base_fields || {}
    );
    // Списки причин, результатов и полей для заполнения
    const [callReasons, setCallReasons] = useState<ReasonItem[]>([]);
    const [callResults, setCallResults] = useState<ResultItem[]>([]);
    const [group_instructions, setGroup_instructions] = useState<any>(null)
    const [mergedFields, setMergedFields] = useState<MergedField[]>([]);
    const [values, setValues] = useState<GroupFieldValues>({});
    const [basicFields, setBasicFields] = useState<any[]>([])
    useEffect(() => console.log("values323123: ", values), [values])

    useEffect(() => console.log("mergedFields: ", mergedFields), [mergedFields])
    // Состояние для списка модулей, полученных с сервера
    // const [modules, setModules] = useState<ModuleData[]>([]);
    const [isParams, setIsParams] = useState<boolean>(true)
    const [groupSelectedIds, setGroupSelectedIds] = useState<number[]>([]);

    const [selectedPhoneByField, setSelectedPhoneByField] = useState<
        Record<string, { phone: string; project: string }>
    >({});


    const [groupModalOpen, setGroupModalOpen] = useState(false);

    const moduleProjectMapRef = useRef<Record<number, string>>({});

    useEffect(() => {
        if (hasActiveCall && !openedPhones && outboundCall) {
            socket.emit("get_project_fields",{
                projects: [outActiveProjectName],
                session_key: sessionKey,
                worker
            })
        }
    },[hasActiveCall, openedPhones, outActiveProjectName, outboundCall, sessionKey, worker])

    // const [projectsData, setProjectsData] = useState<ProjectFieldsResponse | null>(null);

    const getPhonesByIds = (ids: number[]) => {
        return openedPhones?.filter(p => ids.includes(p.id)) || [];
    };

    const groupProjects = useMemo(() => {
        console.log("openedPhonesMEMO: ", openedPhones)
        if (!openedPhones) return [];
        return Array.from(new Set(openedPhones.map(p => p.project)));
    }, [openedPhones]);
    useEffect(() => setActiveProjectName?.(groupProjects[0]),[groupProjects, setActiveProjectName])
    const [selectedProjects, setSelectedProjects] = useState<string[]>(groupProjects);

    const idProjectMap = useMemo(() =>
            openedPhones?.map(ph => ({ id: ph.id, project_name: ph.project })) || [],
        [openedPhones]);
    useEffect(() => console.log("444groupProjects: ", groupProjects),[groupProjects])
    useEffect(() => console.log("444selectedProjects: ", selectedProjects),[selectedProjects])

    useEffect(() => {
        if (groupProjects.length === 0 && activeProject) {
            setSelectedProjects([activeProject])
        } else if (call && call.project_name) {
            if(Object.keys(call?.projects).length   > 1 ) {
                setSelectedProjects(Object.keys(call?.projects))
            } else if (call.project_name === "outbound") {
                console.log("FUCK!@#")
                setSelectedProjects([cleanProjectName(call.variable_last_arg)])
            } else {
                setSelectedProjects([cleanProjectName(call.project_name)])
            }
        } else {
            setSelectedProjects(groupProjects)
        }
    },[activeProject, call, groupProjects])

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
    const projectPoolForCall = useMemo(() => {
        return projectPool.filter(project => (project.out_active && project.active)).map(project => project.project_name);
    }, [projectPool]);

    // Активные звонки (из redux)
    const activeCalls: ActiveCall[] = useSelector((state: RootState) => state.operator.activeCalls);
    // const hasActiveCall = Array.isArray(activeCalls) ? activeCalls.some(ac => Object.keys(ac).length > 0) : false

    // Логика «постобработки»
    const POST_LIMIT = worker.includes('fs@akc24.ru') ? 12000 : 15;
    const [postSeconds, setPostSeconds] = useState(POST_LIMIT);
    useEffect(() => console.log("postCall: ", postCallData),[postCallData])

    const forbiddenProjects = ['api_call', 'no_project_out'];
    const project = call?.project_name || '';
    const hideReportFields = forbiddenProjects.includes(project);

    const prevCallRef = useRef<ActiveCall | null>(null);

    useEffect(() => {
        if (openedPhones && tuskMode){
            const projects = Array.from(new Set(openedPhones.map(p => p.project)));
            // const projects = ["group_project_2", "group_project_1"];

            socket.emit("get_project_fields",{
                projects: projects,
                session_key: sessionKey,
                worker
            })
        } if (activeCalls[0]?.direction === "inbound" && activeProject) {
            socket.emit("get_project_fields",{
                projects: [activeProject],
                session_key: sessionKey,
                worker
            })

        } if (!hasActiveCall && !postActive && call?.project_name) {
            const projectNames = Object.keys(call.projects).map((proj => cleanProjectName(proj)))
            if(projectNames.length === 1 && projectNames[0] === "outbound") {
                socket.emit("get_project_fields",{
                    projects: [call.variable_last_arg],
                    session_key: sessionKey,
                    worker
                })
            } else {
                socket.emit("get_project_fields",{
                    projects: projectNames,
                    session_key: sessionKey,
                    worker
                })
            }
            console.log("projectNames: ", projectNames)
            const projectName = projectNames[0];
            const projectDataArray = Object.values(call.projects) as Array<{
                call_reason: number;
                call_result: number;
                comment: string;
                base_fields: Record<string, string>;
            }>;
            setValues({ [projectName]: {} });
            const firstProjectData = projectDataArray[0];
            const baseFields = firstProjectData?.base_fields || {};
            console.log("baseFieldsbaseFieldsbaseFieldsbaseFields: ", baseFields)
            const sanitized: Record<string, string> = {};
            Object.entries(baseFields).forEach(([fid, val]) => {
                if (!fid.startsWith("AS_")) return;
                sanitized[fid] = String(val);
            });

            setValues({ [projectName]: sanitized });
            console.log("valueanotherOneTRADE1")
        }

    },[call, openedPhones, activeProject, activeCalls, tuskMode, hasActiveCall, postActive, sessionKey, worker])

// ────────────────────────────────────────────────────────────────────────────────
    const handleProjectFields = (data: {
        project_fields: string;
        as_is_dict: Record<string, FieldDefinition[]>;
        call_reasons: ReasonItem[];
        call_results: ResultItem[];
        group_instructions: any
    }) => {
        //TODO TEST
        // Если включён tuskMode, собираем mergedFields (вне зависимости от hasActiveCall)
        // if (tuskMode) {
            console.log("testOUTBOUNDCALLCHILDRILL")
            const map = new Map<string, MergedField>();
            setGroup_instructions(data.group_instructions || null)
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
                            editable: f.editable,
                            projects: [projName],
                            fieldIds: { [projName]: f.field_id },
                            spatialGroup: (f as any).spatial_group,
                            group_position: f.group_position || null,
                            group_id: f.group_id || null
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
            console.log("merged: ", merged)
            setMergedFields(merged);

            // Инициализируем пустые значения сразу для всех выбранных проектов
            const init: GroupFieldValues = { ...values }; // не пустой, а текущий
            selectedProjects.forEach(p => {
                if (!init[p]) init[p] = {};
            });
            console.log("initValues: ", values)
            console.log("init: ", init)
            console.log("TEST123call: ",call)
            console.log("TEST123momoProjectRepo: ",momoProjectRepo)

            if (call && momoProjectRepo && momoProjectRepo.current) {
                // 1) InitKwargs — копируем base_fields всех проектов
                type InitKwargs = {
                    [K in keyof ProjectsMap]: ProjectsMap[K]['base_fields']
                };
                const initKwargs = Object.entries(call.projects).reduce<InitKwargs>(
                    (acc, [projName, project]) => {
                        acc[projName as keyof ProjectsMap] = project.base_fields;
                        return acc;
                    },
                    {} as InitKwargs
                );
                setValues(initKwargs);

                // 2) Берём первый проект, чтобы инициализировать причину/результат/комментарий
                const firstProject   = Object.values(call.projects)[0];
                const projNames = Object.keys(call.projects)
                const rawReasonId    = firstProject.call_reason;
                const rawResultId    = firstProject.call_result;
                const rawComment     = firstProject.comment || '';

                // 3) Находим в списках по id и project_name нужные объекты, достаём .name
                const reasonItem = callReasons.find(r =>
                    String(r.id) === String(rawReasonId)
                );
                const resultItem = callResults.find(r =>
                    String(r.id) === String(rawResultId)
                );

                setComment(rawComment);
                setCallReason(String(rawReasonId) || '');
                setCallResult(String(rawResultId) || '');
            } else {
                setValues(init);
            }


        //TODO TEST
            // if (!call && !postActive) {
            //     setValues(init);
            //
            // }
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
        // else {
        //     const map = new Map<string, MergedField>();
        //
        //     Object.entries(data.as_is_dict).forEach(([projName, fields]) => {
        //         if (!selectedProjects.includes(projName)) return;
        //         fields.forEach(f => {
        //             const key = [
        //                 f.field_name,
        //                 f.field_type,
        //                 f.field_vals || "",
        //                 (f as any).spatial_group || "",
        //             ].join("|");
        //             if (!map.has(key)) {
        //                 map.set(key, {
        //                     id: key,
        //                     label: f.field_name,
        //                     type: f.field_type,
        //                     values: f.field_vals,
        //                     projects: [projName],
        //                     fieldIds: { [projName]: f.field_id },
        //                     spatialGroup: (f as any).spatial_group,
        //                 });
        //             } else {
        //                 const e = map.get(key)!;
        //                 if (!e.projects.includes(projName)) {
        //                     e.projects.push(projName);
        //                     e.fieldIds[projName] = f.field_id;
        //                 }
        //             }
        //         });
        //     });
        //
        //     // Только basicFields, без mergedFields и без инициализации значений
        //     setBasicFields(Array.from(map.values()));
    //     }
    // };
// ✅ Правильная инициализация значений:

    useEffect(() => {
        // if (!tuskMode) return;

        socket.on("project_fields", handleProjectFields);
        return () => {
            socket.off("project_fields", handleProjectFields);
        };
    }, [tuskMode, groupProjects, sessionKey, worker, activeCalls, openedPhones, handleProjectFields, call, hasActiveCall, values]);

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
    function cleanProjectName(name: string = ''): string {
        return name.replace(/\s*\(.*?\)\s*$/, '').trim();
    }


    useEffect(() => {
        if (!hasActiveCall && !postActive && call) {
            const projectName = cleanProjectName(call.project_name!);

            const projectDataArray = Object.values(call.projects) as Array<{
                call_reason: number;
                call_result: number;
                comment: string;
                base_fields: Record<string, string>;
            }>;

            const firstProjectData = projectDataArray[0];
            if (firstProjectData && projectDataArray.length < 2) {
                setCallReason(String(firstProjectData.call_reason) !== "null" ? String(firstProjectData.call_reason) : "");
                setCallResult(String(firstProjectData.call_result) !== "null" ? String(firstProjectData.call_result) : "");
                setComment(firstProjectData.comment || "");
                // setValues({ [projectName]: firstProjectData.base_fields || {}})
            }
        }
    }, [call, hasActiveCall, postActive]);

    // useEffect(() => {
    //     if(!tuskMode){
    //         const handleFsReasons = (data: {
    //             call_reasons:  ReasonItem[];
    //             call_results:  ResultItem[];
    //             as_is_dict:    FieldDefinition[];
    //         } | null) => {
    //             if (!isParams || postActive) return
    //             if (data && !hasActiveCall && !postActive) {
    //                 setCallReasons(data.call_reasons.filter(r => r.project_name === call?.project_name || r.project_name === `${call?.project_name}@default`));
    //                 setCallResults(data.call_results.filter(r => r.project_name === call?.project_name || r.project_name === `${call?.project_name}@default`));
    //                 setParams(data.as_is_dict.filter(p => p.project_name === call?.project_name || p.project_name === `${call?.project_name}@default`));
    //             } else if (data && (hasActiveCall || postActive)) {
    //                 setCallReasons(data.call_reasons.filter(r => r.project_name === activeProject || r.project_name === `${activeProject}@default`));
    //                 setCallResults(data.call_results.filter(r => r.project_name === activeProject || r.project_name === `${activeProject}@default`));
    //                 setParams(data.as_is_dict.filter(p => p.project_name === activeProject || p.project_name === `${activeProject}@default`));
    //             } else {
    //                 setCallReasons([]);
    //                 setCallResults([]);
    //                 setParams([]);
    //             }
    //         };
    //         handleFsReasons(fsReasons)
    //     }
    //
    // }, [call, activeProject, fsReasons, hasActiveCall, isParams]);


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
        // startModulesRanRef.current = false;
        console.log()
        // if ((!hasActiveCall && (!openedPhones?.length || !call))) return;
        console.log("it's working")
        const handleModules = (data: any) => {
            // if (data.project !== activeProject) return;

            // if (tuskMode) {
            //     console.log("it's workingtuskMode")
                if (data && typeof data === 'object' && setMonoModules) {
                    setMonoModules(data);
                }
            // } else if (!tuskMode && call){
            //     console.log("it's working!!!!!!!!!tuskMode")
            //     if (setMonoModules) {
            //         setMonoModules(data)
            //     }
            // }
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

        } else if (!tuskMode && activeProject){
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

    }, [openedPhones, hasActiveCall, activeProject, worker, sessionKey, setModules, tuskMode, setMonoModules, selectedProjects]);

    useEffect(() => console.log("activeProject: ", activeProject),[activeProject])
    const handleModuleRun = (mod: ModuleData, common_code?: false, proj?: string) => {
        // if (!tuskMode) {
        //     console.warn('Запуск модулей вне tuskMode пока не поддерживается');
        //     return;
        // }
        if (!monoModules) {
            console.warn('Описание monoModules отсутствует');
            return;
        }

        // 1) Собираем список проектов, в которых нужно запустить модуль
        const projectList: string[] = mod.common_code || tuskMode
            ? Object.entries(monoModules)
                .filter(([_, mods]) => mods.some(m => m.filename === mod.filename))
                .map(([project]) => project)
            : activeProject
                ? [activeProject]
                : call && Object.keys(call.projects)[0] !== "outbound"
                    ? [cleanProjectName(Object.keys(call.projects)[0])]
                    : call
                        ? [call.variable_last_arg]
                        : [""]


        if (projectList.length === 0) {
            console.warn(`Не найдено ни одного проекта для модуля ${mod.filename}`);
            return;
        }

        // 2) Составляем для каждого проекта свой набор параметров
        const projectsPayload: Record<string, Record<string, string>> = {};

        projectList.forEach(project => {
            // для общих модулей берём spec.kwargs из monoModules[project],
            // для обычных — из самого mod
            const projectMod = monoModules[project].find(m => m.filename === mod.filename) || mod;
            const specKwargs = projectMod.kwargs || {};
            const fieldMap   = values[project] || baseFieldValues;
            const kw: Record<string,string> = {};

            Object.entries(specKwargs).forEach(([inputName, spec]: [string, any]) => {
                const key = spec.source;
                let value = '';

                switch (key) {
                    case 'operator_id':
                        value = sipLogin;
                        break;
                    case 'call_reason':
                        value = callReasons.find(r => String(r.id) === String(callReason))?.name || '';
                        break;
                    case 'call_result':
                        value = callResults.find(r => String(r.id) === String(callResult))?.name || '';
                        break;
                    case 'phone':
                        value = activeCalls[0]?.direction === 'outbound'
                            ? activeCalls[0].b_dest
                            : activeCalls[0].cid_num || '';
                        break;
                    case 'uuid':
                        value = activeCalls[0]?.uuid || postCallData?.uuid || '';
                        break;
                    case 'b_uuid':
                        value = activeCalls[0]?.b_uuid || postCallData?.b_uuid || '';
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
                        value = fieldMap[key] || '';
                }

                kw[key] = value;
            });

            projectsPayload[project] = kw;
        });

        // 3) Формируем единый payload
        const payload = {
            filename:    mod.filename,
            common_code: Boolean(mod.common_code),
            session_key: sessionKey,
            uuid:        activeCalls[0]?.uuid   || postCallData?.uuid   || '',
            b_uuid:      activeCalls[0]?.b_uuid || postCallData?.b_uuid || '',
            worker,
            projects:    projectsPayload,
        };

        // 4) Шлём один emit
        socket.emit('run_module', payload);
    };

    //
// Слушаем ответы от run_module и распределяем значения по проектам
    useEffect(() => {
        const handleModuleResult = (...args: any[]) => {
            // 1) Найдём первый аргумент-объект
            const dataObj: Record<string, any> | undefined = args.find(
                a => typeof a === 'object' && a !== null
            );
            if (!dataObj) return;

            // 2) Случай: { project_name, result: {...} }
            if ('project_name' in dataObj && 'result' in dataObj && tuskMode) {
                const project = dataObj.project_name;
                const result  = dataObj.result || {};

                Object.entries(result).forEach(([fieldKey, value]) => {
                    let v: string;
                    if (value == null) {
                        v = '';
                    } else if (typeof value === 'object') {
                        v = JSON.stringify(value);
                    } else {
                        v = String(value);
                    }
                    applyFieldUpdate(project, fieldKey, v);
                });

                // 3) Новый групповой формат: { projectA: {...}, projectB: {...} }
            } else if (Object.values(dataObj).every(v => typeof v === 'object')) {
                Object.entries(dataObj).forEach(([project, result]) => {
                    Object.entries(result || {}).forEach(([fieldKey, value]) => {
                        let v: string;
                        if (value == null) {
                            v = '';
                        } else if (typeof value === 'object') {
                            v = JSON.stringify(value);
                        } else {
                            v = String(value);
                        }
                        applyFieldUpdate(project, fieldKey, v);
                    });
                });

                // 4) fallback — старый плоский формат без project_name
            } else {
                let project = activeProject;
                if (tuskMode) {
                    // пытаемся угадать проект по ключам
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
                        if (entry) project = entry[0];
                    }
                }

                Object.entries(dataObj).forEach(([fieldKey, value]) => {
                    let v: string;
                    if (value == null) {
                        v = '';
                    } else if (typeof value === 'object') {
                        v = JSON.stringify(value);
                    } else {
                        v = String(value);
                    }
                    applyFieldUpdate(project, fieldKey, v);
                });
            }

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
        callReasons,
        callResults,
        postCallData,
        activeCalls,
    ]);


    function applyFieldUpdate(
        project: string,
        fieldKey: string,
        v: string
    ) {
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
                // if (tuskMode) {
                    setValues(prev => ({
                        ...prev,
                        [project]: {
                            ...prev[project],
                            [fieldKey]: v
                        }
                    }));
                // } else {
                //     setBaseFieldValues(prev => ({
                //         ...prev,
                //         [fieldKey]: v
                //     }));
                // }
        }
    }


    const startModules = useMemo<ModuleData[]>(() => {
        if (monoModules) {
            // flatten всех модулей из monoModules
            return Object.values(monoModules)
                .flat()
                .filter(mod =>
                    Array.isArray(mod.start_modes) &&
                    mod.start_modes.includes('start')
                );
        } else {
            return modules.filter(mod =>
                Array.isArray(mod.start_modes) &&
                mod.start_modes.includes('start')
            );
        }
    }, [monoModules, modules]);

    useEffect(() => console.log("startModules: ", startModules),[startModules])
// ручные модули — всё, что не стартовое
    const manualModules = useMemo<ModuleData[]>(() => {
        if (monoModules && Object.keys(monoModules).length) {
            return Object.values(monoModules)
                .flat()
                .filter(mod =>
                    !Array.isArray(mod.start_modes) ||
                    mod.start_modes.includes('manual')
                );
        } else {
            return modules.filter(mod =>
                !Array.isArray(mod.start_modes) ||
                mod.start_modes.includes('manual')
            );
        }
    }, [monoModules, modules]);
    useEffect(() => console.log("manualModules: ", manualModules),[manualModules])
    useEffect(() => {
        // если уже запустили — не запускаем снова
        if (startModulesRanRef.current) return;
        console.log("START")

        // 1) активный звонок
        if (startModules.length && (hasActiveCall || call)) {
            console.log("startModules")
            startModules.forEach(mod => handleModuleRun(mod));
            startModulesRanRef.current = true;
            return;
        }

        // 2) таск-мод: карточка открыта (есть openedPhones), но колл не активен и не в пост-моде
        const countPhones = openedPhones?.length ?? 0;
        if (startModules.length && tuskMode && countPhones > 0 && !postActive) {
            console.log("TUSKMODESTART")

            startModules.forEach(mod => handleModuleRun(mod));
            startModulesRanRef.current = true;
        }
    }, [
        hasActiveCall,
        tuskMode,
        // смотрим на сам массив, а не на length — тогда зависимость сработает и при смене проекта
        openedPhones,
        postActive,
        startModules,
        handleModuleRun,
    ]);

// когда звонок кончается — сбрасываем флаг, чтобы при следующем звонке стартеры снова сработали
//     useEffect(() => {
//         if (!hasActiveCall) {
//             startModulesRanRef.current = false;
//         }
//     }, [hasActiveCall]);

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
            setPostSeconds(POST_LIMIT)
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
            // socket.emit('fs_post_started', {
            //     session_key: sessionKey,
            //     sip_login: sipLogin,
            //     worker
            // })
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
        // if (!callReason || !callResult) {
        //     Swal.fire({ title: "Ошибка", text: "Проверьте заполнение обязательных полей", icon: "error" });
        //     return;
        // }
        const reasonNumber = typeof callReason === "string" ? parseInt(callReason, 10) : callReason
        const resultNumber = typeof callResult === "string" ? parseInt(callResult, 10) : callResult
        const projectsPayload: Record<string, {
            call_reason: number;
            call_result: number;
            comment: string;
            base_fields: Record<string, string>;
        }> = {};

        // const sanitizedBaseFields = Object.fromEntries(
        //     Object.entries(baseFieldValues).map(([k, v]) => [k, sanitize(v)])
        // );
        const sanitizedBaseFields = Object.values(values)[0]

        projectsPayload[call?.project_name ?? "proj"] = {
            call_reason: reasonNumber,
            call_result: resultNumber,
            comment,
            base_fields: sanitizedBaseFields,
        };

        socket.emit("edit_call_fs", {
            b_uuid: call?.special_key_call,
            uuid: call?.special_key_conn,
            session_key: sessionKey,
            worker,
            projects: projectsPayload,
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
        // if (!callReason || !callResult) {
        //     Swal.fire({ title: "Ошибка", text: "Выберите причину и результат", icon: "error" });
        //     return;
        // }
        if (!groupModalOpen) {
            setGroupModalOpen(true);
            return;
        }
        if (setOpenedGroup && setPhonesData && setOpenedPhones) {
            setOpenedGroup([])
            setPhonesData([])
            setOpenedPhones([])
        }

        const post_time = POST_LIMIT - postSeconds

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
            post_time
        });
        socket.emit("change_state_fs", {
            sip_login: sipLogin,
            worker,
            session_key: sessionKey,
            state: "waiting",
            reason: "manual_return",
            page: "online",
        });
        socket.emit("get_fs_report", {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            level: 0,
        });

        setIsLoading(true);
        setOpenedPhones?.([])
        setPostActive(false);
        setPostSeconds(POST_LIMIT);
        onClose();
    };
    const handlePostSave = () => {
        // if (!callReason || !callResult) {
        //     Swal.fire({
        //         title: "Ошибка",
        //         text: "Проверьте заполнение обязательных полей",
        //         icon: "error",
        //     });
        //     return;
        // }

        const post_time = POST_LIMIT - postSeconds
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
                projects: {
                    [activeProject]: {
                        call_reason: reasonNumber,
                        call_result: resultNumber,
                        comment,
                        base_fields: values[activeProject],
                    },
                },
                post_time,
                session_key: sessionKey,
                worker,
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

    // Группируем телефоны: phoneGroups
    const phoneGroups = useMemo(() => {
        const map = new Map<string, { phone: string; entries: Array<{ project: string; contact_info: any }> }>();
        (openedPhones || []).forEach(ph => {
            if (!map.has(ph.phone)) {
                map.set(ph.phone, { phone: ph.phone, entries: [] });
            }
            map.get(ph.phone)!.entries.push({
                project: ph.project,
                contact_info: ph.contact_info || {},
            });
        });
        return Array.from(map.values());
    }, [openedPhones]);

// Строим карту вариантов для каждого поля
    const contactInfoVariants = useMemo(() => {
        const result: Record<string, Set<string>> = {};
        phoneGroups.forEach(group => {
            group.entries.forEach(entry => {
                Object.entries(entry.contact_info || {}).forEach(([fieldId, value]) => {
                    if (!result[fieldId]) result[fieldId] = new Set();
                    result[fieldId].add(String(value));
                });
            });
        });
        return result;
    }, [phoneGroups]);



    const renderContactInfoSelector = (
        phone: string,
        fieldId: string,
        entries: Array<{ project: string; contact_info: Record<string, any> }> = []
    ) => {
        const variants = (entries || [])
            .map(e => ({
                project: e.project,
                value: e.contact_info[fieldId] || '',
            }))
            .filter(v => v.value !== '');

        const unique = Array.from(new Set(variants.map(v => v.value)));
        if (unique.length <= 1) return null;

        return (
            <select
                style={{ marginBottom: 4 }}
                onChange={e => {
                    const val = e.target.value;
                    selectedProjects.forEach(proj => {
                        setValues(prev => ({
                            ...prev,
                            [proj]: {
                                ...prev[proj],
                                [fieldId]: val
                            }
                        }));
                    });
                }}
            >
                <option value="">Выберите значение</option>
                {variants.map((v, idx) => (
                    <option key={idx} value={v.value}>
                        {v.value} ({findNameProject(v.project)})
                    </option>
                ))}
            </select>
        );
    };

    const renderGroupPhones = () => {
        if (!phoneGroups.length) return null;


        return (
            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16,
                }}
            >
                {/* Кнопка «Закрыть» */}
                <button
                    onClick={() => {
                        setOpenedPhones?.([]);
                        setOpenedGroup?.([]);
                        setPhonesData?.([]);
                        startModulesRanRef.current = false;
                        if (momoProjectRepo && momoProjectRepo.current && setTuskMode) {
                            setTuskMode(false);
                            onClose();
                        }
                    }}
                    className="btn btn-outline-light text text-dark"
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        padding: '4px 8px',
                        fontSize: 14,
                        lineHeight: 1,
                        zIndex: 1,
                    }}
                >
          <span className="material-icons" style={{ marginTop: 4 }}>
            close
          </span>
                </button>

                {/* Первая карточка: свободный ввод номера */}
                <div
                    key="manual-entry"
                    style={{
                        border: '1px solid #ddd',
                        borderRadius: 6,
                        padding: 8,
                        minWidth: 180,
                        maxWidth: 240,
                        flex: '0 1 auto',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        background: '#fff',
                    }}
                >
                    <input
                        type="text"
                        placeholder="Введите номер..."
                        value={manualNumber}
                        onChange={e => {
                            // убираем все символы, кроме цифр
                            const onlyDigits = e.target.value.replace(/\D/g, '');
                            setManualNumber(onlyDigits);
                        }}
                        className="form-control mb-2"
                        inputMode="numeric"
                        pattern="\d*"
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {groupProjects.map(proj => (
                            <button
                                key={`manual-${proj}`}
                                className="btn btn-sm btn-outline-success"
                                onClick={() => {
                                    if (manualNumber.trim()) {
                                        callFromCard(proj, manualNumber.trim());
                                    }
                                }}
                            >
                                Вызов {findNameProject(proj)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Дальше — уже существующие карточки */}
                {phoneGroups.map(group => (
                    <div
                        key={group.phone}
                        style={{
                            border: '1px solid #ddd',
                            borderRadius: 6,
                            padding: 8,
                            minWidth: 180,
                            maxWidth: 240,
                            flex: '0 1 auto',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                            background: '#fff',
                        }}
                    >
                        <div
                            style={{
                                fontSize: 14,
                                fontWeight: 600,
                                marginBottom: 6,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {group.phone}
                        </div>
                        {group.entries.map(entry => (
                            <button
                                key={entry.project}
                                className="btn btn-sm btn-outline-success"
                                style={{ marginRight: 4, marginBottom: 4 }}
                                onClick={() => callFromCard(entry.project, group.phone)}
                            >
                                Вызов {findNameProject(entry.project)}
                            </button>
                        ))}
                    </div>
                ))}
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
                        {mainActiveCall.direction === 'outbound' && mainActiveCall.application !== 'uuid_bridge'?
                            // mainActiveCall.callee_num ||
                            extractSuffix(mainActiveCall.b_callee_num) : extractSuffix(mainActiveCall.cid_num)}
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
        const phoneNumber = postCallData?.direction === 'outbound' && postCallData?.application !== 'uuid_bridge' ? postCallData.b_callee_num : postCallData?.cid_num;
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
    const projectModules = useMemo(() => {
        if (!monoModules) return {};

        const commons = new Set(commonModules.map(mod => mod.filename));

        const result: Record<string, ModuleData[]> = {};
        for (const [project, mods] of Object.entries(monoModules)) {
            result[project] = mods.filter(mod => !commons.has(mod.filename));
        }

        return result;
    }, [monoModules, commonModules]);
    const renderModules = () => {
        // if ((!hasActiveCall && !postActive) || (!openedPhones?.length || !call)) {
        //     return null;
        // }

        // если совсем нет модулей
        const allCount =
            // tuskMode ?
                Object.values(monoModules || {}).flat().length
        //     : modules.length;
        if (allCount === 0) {
            return null;
        }

        // обычный режим — только ручные из modules
        if (!tuskMode) {
            return (
                <div style={{ display: "flex", gap: 8, margin: "0 0 10px 20px", alignItems: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>Модули:</div>
                    {manualModules.map((mod, idx) => (
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
        }

        // tuskMode — ручные общие + ручные проектные
        if (monoModules) {
            return (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 10px 20px" }}>
                    {/* ручные общие модули */}
                    {commonModules
                        .filter(mod => !mod.start_modes?.includes("start"))
                        .map((mod, idx) => (
                            <button
                                key={`common-${mod.filename}-${idx}`}
                                onClick={() => handleModuleRun(mod, false,)}
                                className="btn btn-outline-dark"
                            >
                                {mod.filename}
                            </button>
                        ))
                    }

                    {/* ручные проектные модули */}
                    {Object.entries(projectModules).map(([proj, mods]) =>
                        mods
                            .filter(mod => !mod.start_modes?.includes("start"))
                            .map((mod, idx) => (
                                <button
                                    key={`${proj}-${mod.filename}-${idx}`}
                                    onClick={() => handleModuleRun(mod, false, proj)}
                                    className="btn"
                                    style={{
                                        border: `1px solid ${projectColors[proj]}`,
                                        color: projectColors[proj],
                                    }}
                                >
                                    {mod.filename}
                                </button>
                            ))
                    )}
                </div>
            );
        }

        return null;
    };


    const phoneProjectOptions = useMemo(() => {
        const result: Array<{ phone: string; project: string }> = [];
        const seen = new Set<string>();

        (openedPhones || []).forEach(ph => {
            const key = `${ph.phone}|${ph.project}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push({ phone: ph.phone, project: ph.project });
            }
        });

        return result;
    }, [openedPhones]);

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
// в начале компонента
// map: fieldId → массив всех найденных { phone, project, value }
    const contactInfoOptions = useMemo(() => {
        const result: Record<string, Array<{ phone: string; project: string; value: string }>> = {};
        (openedPhones || []).forEach(ph => {
            Object.entries(ph.contact_info || {}).forEach(([fieldId, value]) => {
                if (!result[fieldId]) result[fieldId] = [];
                result[fieldId].push({
                    phone: ph.phone,
                    project: ph.project,
                    value: String(value),
                });
            });
        });
        return result;
    }, [openedPhones]);

// вот этот эффект надо добавить **после** объявления contactInfoOptions и перед return(...)
    useEffect(() => {
        // 1) сброс
        // setValues({});

        // если ничего не открыто — дальше не инициализируем
        if (!openedPhones?.length) return;

        // 2) заполняем заново
        const next: GroupFieldValues = {};
        // у нас selectedProjects уже содержит нужный набор проектов
        selectedProjects.forEach(proj => {
            next[proj] = {};
        });

        // для каждого поля смотрим, есть ли ровно одна уникальная value
        Object.entries(contactInfoOptions).forEach(([fieldId, opts]) => {
            const uniq = Array.from(new Set(opts.map(o => o.value).filter(v => v !== '')));
            if (uniq.length === 1) {
                // единственный вариант — распихиваем по всем проектам
                selectedProjects.forEach(proj => {
                    next[proj][fieldId] = uniq[0];
                });
            }
        });

        setValues(next);
    }, [openedPhones, contactInfoOptions, selectedProjects]);

    useEffect(() => {
        if (!openedPhones?.length) return;
        const next: GroupFieldValues = { ...values };

        // для каждого поля и каждого проекта смотрим, есть ли в contactInfoOptions ровно одно значение
        mergedFields.forEach(f => {
            f.projects.forEach(proj => {
                const fieldId = f.fieldIds[proj];
                // собрать все значения именно для этого проекта
                const vals = (contactInfoOptions[fieldId] || [])
                    .filter(o => o.project === proj)
                    .map(o => o.value);
                const uniq = Array.from(new Set(vals));
                if (uniq.length === 1) {
                    next[proj] = { ...next[proj], [fieldId]: uniq[0] };
                }
            });
        });

        setValues(next);
    }, [contactInfoOptions, selectedProjects, openedPhones]);

    // Делаем ТОЛЬКО если у нас уже есть openedPhones и выбранные проекты
// вверху компонента, рядом с другими useEffects
    useEffect(() => {
        // если нет телефонов – ничего не делаем
        if (!openedPhones?.length) return;

        // клонируем текущее состояние, чтобы не затирать старые данные
        const nextValues: GroupFieldValues = { ...values };

        // пройдём по всем полям, для которых есть contact_info
        Object.entries(contactInfoOptions).forEach(([fieldId, opts]) => {
            // отфильтруем только те варианты, у которых value непустая строка
            const vals = opts.map(o => o.value).filter(v => v !== '');
            const uniq = Array.from(new Set(vals));

            // если для этого fieldId ровно 1 вариант – подставляем его во все проекты
            if (uniq.length === 1) {
                const single = uniq[0];
                selectedProjects.forEach(proj => {
                    // инициализируем подпроект, если ещё нет
                    if (!nextValues[proj]) nextValues[proj] = {};
                    nextValues[proj][fieldId] = single;
                });
            }
        });

        setValues(nextValues);
    }, [openedPhones, contactInfoOptions, selectedProjects]);

    const commonFields = mergedFields.filter(f => f.projects.length > 1);
    const uniqueFieldsByProject: Record<string, MergedField[]> = {};
    selectedProjects.forEach(proj => {
        uniqueFieldsByProject[proj] =
            mergedFields.filter(f => f.projects.length === 1 && f.projects[0] === proj);
    });

    const shouldShowMeta = tuskMode
        ? (hasActiveCall || postActive)
        : (hasActiveCall || postActive || !hideReportFields);

    const memoizedIds = useMemo(() => {
        return openedPhones?.map(p => p.id) || [];
    }, [openedPhones]);

    return (
        <div style={{marginTop: 20}}>
            {renderModules()}
            <div className="col ml-2 pr-0 mr-0 mr-1">
                <div className="card col ml-0">
                    <div className="card-body">
                        {hasActiveCall && renderActiveCallHeader(activeCalls[0])}
                        {!hasActiveCall && postActive && renderPostCallHeader()}
                        {tuskMode && !hasActiveCall && !postActive && renderGroupPhones()}

                        <div>
                            {!(tuskMode && !call) && !hasActiveCall && !postActive && (
                                renderSelectedCallHeader()
                            )}
                            {shouldShowMeta && fullWidthCard ? (
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: 12,
                                        marginBottom: 8,
                                        flexWrap: 'wrap'
                                    }}
                                >
                                    {[
                                        {
                                            label: 'Причина звонка',
                                            value: callReason,
                                            onChange: setCallReason,
                                            options: callReasons
                                        },
                                        {
                                            label: 'Результат звонка',
                                            value: callResult,
                                            onChange: setCallResult,
                                            options: callResults
                                        }
                                    ]
                                        // Оставляем только те, у которых есть опции
                                        .filter(({ options }) => options && options.length > 0)
                                        .map(({ label, value, onChange, options }, idx) => (
                                            <div
                                                key={idx}
                                                className="form-group"
                                                style={{
                                                    flex: '1 1 calc(50% - 6px)',
                                                    minWidth: 0,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 4
                                                }}
                                            >
                                                <label style={{ fontWeight: 400, fontSize: 16 }}>
                                                    {label}: <span style={{ color: 'red' }}>*</span>
                                                </label>
                                                <SearchableSelect
                                                    options={options}
                                                    value={value}
                                                    onChange={onChange}
                                                    placeholder={`Выберите ${label.toLowerCase()}...`}
                                                    augmentSaved={!hasActiveCall && !postActive}
                                                />
                                            </div>
                                        ))}
                                </div>
                            ) : (
                                <>
                                    {(shouldShowMeta || tuskMode) && callReasons.length > 0 && (
                                        <div className="form-group d-flex align-items-center" style={compact ? { flex: '1 1 calc(50% - 12px)', minWidth: 0 } : { flex: '1 1 0%', minWidth: 0 }}>
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

                                    {(shouldShowMeta || tuskMode) && callResults.length > 0 && (
                                        <div className="form-group d-flex align-items-center" style={compact ? { flex: '1 1 calc(50% - 22px)', minWidth: 0 } : { flex: '1 1 0%', minWidth: 0 }}>
                                            <label className="mb-0" style={{ whiteSpace: 'nowrap', fontWeight: 400, fontSize: 16 }}>
                                                Результат звонка: <span style={{ color: 'red' }}>*</span>
                                            </label>
                                            <SearchableSelect
                                                options={callResults}
                                                value={callResult}
                                                onChange={setCallResult}
                                                placeholder="Выберите результат..."
                                                augmentSaved={!hasActiveCall && !postActive}
                                            />
                                        </div>
                                    )}
                                </>
                            )}

                        {/*{(tuskMode && (hasActiveCall || postActive)) && (*/}
                            {mergedFields.length > 0 && (

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
                                    {commonFields.length > 0 && (
                                        <div style={{ marginTop: 8, marginBottom: 8 }}>
                                            <div style={{ border: `2px solid black`, borderRadius: 4, padding: 8 }}>
                                                {commonFields.map(f => {
                                                    // собираем набор всех телефонов|проектов для этого общего поля
                                                    const uniquePhones = Array.from(
                                                        new Set(
                                                            f.projects.flatMap(p => {
                                                                const id = f.fieldIds[p];
                                                                return (contactInfoOptions[id] || [])
                                                                    .filter(o => o.project === p)
                                                                    .map(o => `${o.phone}|${o.project}`);
                                                            })
                                                        )
                                                    ).map(key => {
                                                        const [phone, project] = key.split('|');
                                                        return { phone, project };
                                                    });

                                                    const showSelector = uniquePhones.length > 1;
                                                    // для initialValues берём первое не-null значение из всех проектов
                                                    const fieldValue = f.projects.reduce<string | null>((acc, p) => {
                                                        const id = f.fieldIds[p];
                                                        return acc ?? values[p]?.[id] ?? null;
                                                    }, null);

                                                    return (
                                                        <div key={f.id} style={{ marginBottom: 16 }}>
                                                            {showSelector && (
                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    <label style={{ fontWeight: 500 }}>
                                                                        Выберите телефон для «{f.label}»:
                                                                    </label>
                                                                    <PhoneProjectSelect
                                                                        value={
                                                                            selectedPhoneByField[f.id]
                                                                                ? `${selectedPhoneByField[f.id].phone}|${selectedPhoneByField[f.id].project}`
                                                                                : ''
                                                                        }
                                                                        onChange={val => {
                                                                            const [phone, project] = val.split('|');
                                                                            // найдём все записи с этим телефоном
                                                                            const entries = (openedPhones || []).filter(
                                                                                ent => ent.phone === phone && ent.project === project
                                                                            );
                                                                            const id = f.fieldIds[project];
                                                                            const val0 = entries[0]?.contact_info[id] || '';

                                                                            // обновляем сразу все проекты, где есть это общее поле
                                                                            setValues(cur => {
                                                                                const next = { ...cur };
                                                                                f.projects.forEach(proj => {
                                                                                    const fid = f.fieldIds[proj];
                                                                                    next[proj] = { ...next[proj], [fid]: val0 };
                                                                                });
                                                                                return next;
                                                                            });

                                                                            // сохраняем выбор селекта
                                                                            setSelectedPhoneByField(cur => ({
                                                                                ...cur,
                                                                                [f.id]: { phone, project }
                                                                            }));
                                                                        }}
                                                                        options={uniquePhones.map(opt => ({
                                                                            id: `${opt.phone}|${opt.project}`,
                                                                            name: `${opt.phone} (${findNameProject(opt.project)})`
                                                                        }))}
                                                                        placeholder="— выберите телефон —"
                                                                    />
                                                                </div>
                                                            )}


                                                            <EditableFields
                                                                params={[
                                                                    {
                                                                        field_id: f.id,
                                                                        field_name: f.label,
                                                                        field_type: f.type,
                                                                        field_vals: f.values,
                                                                        editable: f.editable,
                                                                        must_have: false,
                                                                        project_name: '' // не используется для common
                                                                    }
                                                                ]}
                                                                initialValues={{ [f.id]: fieldValue || '' }}
                                                                onChange={nv => {
                                                                    const v = nv[f.id] || '';
                                                                    setValues(cur => {
                                                                        const copy = { ...cur };
                                                                        // при любом ручном вводе тоже обновляем сразу во всех проектах
                                                                        f.projects.forEach(proj => {
                                                                            const id = f.fieldIds[proj];
                                                                            copy[proj] = { ...copy[proj], [id]: v };
                                                                        });
                                                                        return copy;
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ marginTop: 4, marginBottom: 4 }}>
                                        {selectedProjects.map(proj => {
                                            const fields = uniqueFieldsByProject[proj];
                                            if (!fields.length) return null;

                                            const validGroupIds = new Set(
                                                (group_instructions[proj]?.groups || []).map((g: any) => g.id)
                                            );
                                            (group_instructions[proj]?.groups || []).forEach((group: any) => {
                                                console.log('>>> group.id:', group.id);
                                                const matching = fields.filter(f => f.group_id === group.id);
                                                console.log(`>>>Group ${group.id} matched fields:`, matching);
                                            });


                                            const groupedFields = (group_instructions[proj]?.groups || [])
                                                .slice()
                                                .sort((a: any, b: any) => a.position - b.position)
                                                .map((group: any) => {
                                                    const fieldsInGroup = fields
                                                        .filter(f => f.group_id === group.id)
                                                        .sort((a, b) => (a.group_position ?? 0) - (b.group_position ?? 0));
                                                    return { group, fields: fieldsInGroup };
                                                })
                                                .filter(({ fields }: any) => fields.length > 0);

                                            const orphanFields = fields.filter(
                                                f => f.group_id == null || !validGroupIds.has(f.group_id)
                                            );

                                            return (
                                                <div
                                                    key={proj}
                                                    style={{
                                                        border: `2px solid ${projectColors[proj]}`,
                                                        borderRadius: 4,
                                                        padding: 8,
                                                        marginBottom: 12
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            flexWrap: 'wrap',
                                                            gap: 16,
                                                            marginBottom: 16
                                                        }}
                                                    >
                                                        {groupedFields.map(({ group, fields }:{group: any, fields: any}) => (
                                                            <div
                                                                key={group.id}
                                                                style={{
                                                                    border: '1px solid #ccc',
                                                                    borderRadius: 4,
                                                                    padding: 8,
                                                                    width: fullWidthCard && group.width === 0.5 ? 'calc(50% - 8px)' : '100%',
                                                                    minWidth: 0
                                                                }}
                                                            >
                                                                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                                                                    {group.group_name}
                                                                </div>
                                                                {fields.map((f: any) => {
                                                                    const fieldId = f.fieldIds[proj];
                                                                    // берём только варианты из текущего проекта
                                                                    const opts = (contactInfoOptions[fieldId] || []).filter(
                                                                        o => o.project === proj
                                                                    );
                                                                    const uniquePhones = Array.from(
                                                                        new Set(opts.map(o => `${o.phone}|${o.project}`))
                                                                    ).map(key => {
                                                                        const [phone, project] = key.split('|');
                                                                        return { phone, project };
                                                                    });

                                                                    const showSelector = uniquePhones.length > 1;
                                                                    const picked = selectedPhoneByField[fieldId];

                                                                    return (
                                                                        <div key={f.id} style={{ marginBottom: 16 }}>
                                                                            {showSelector && (
                                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                    <label style={{ fontWeight: 500 }}>
                                                                                        Выберите телефон для «{f.label}»:
                                                                                    </label>
                                                                                    <PhoneProjectSelect
                                                                                        value={
                                                                                            selectedPhoneByField[fieldId]
                                                                                                ? `${selectedPhoneByField[fieldId].phone}|${selectedPhoneByField[fieldId].project}`
                                                                                                : ''
                                                                                        }
                                                                                        onChange={val => {
                                                                                            const [phone, project] = val.split('|');
                                                                                            const found = openedPhones?.find(p => p.phone === phone && p.project === project);
                                                                                            if (!found) return;
                                                                                            setValues(cur => ({
                                                                                                ...cur,
                                                                                                [proj]: { ...cur[proj], [fieldId]: found.contact_info[fieldId] || '' }
                                                                                            }));
                                                                                            setSelectedPhoneByField(cur => ({
                                                                                                ...cur,
                                                                                                [fieldId]: { phone, project }
                                                                                            }));
                                                                                        }}
                                                                                        options={uniquePhones.map(opt => ({
                                                                                            id: `${opt.phone}|${opt.project}`,
                                                                                            name: `${opt.phone} (${findNameProject(opt.project)})`
                                                                                        }))}
                                                                                        placeholder="— выберите телефон —"
                                                                                    />
                                                                                </div>
                                                                            )}

                                                                            <EditableFields
                                                                                params={[{
                                                                                    field_id: f.id,
                                                                                    field_name: f.label,
                                                                                    field_type: f.type,
                                                                                    field_vals: f.values,
                                                                                    editable: f.editable,
                                                                                    must_have: false,
                                                                                    project_name: proj
                                                                                }]}
                                                                                initialValues={{
                                                                                    [f.id]: values[proj]?.[fieldId] || ''
                                                                                }}
                                                                                onChange={nv => {
                                                                                    const v = nv[f.id] || '';
                                                                                    setValues(cur => ({
                                                                                        ...cur,
                                                                                        [proj]: { ...cur[proj], [fieldId]: v }
                                                                                    }));
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ))}

                                                        {orphanFields.length > 0 && (
                                                            <div style={{ flex: '1 1 100%' }}>
                                                                {orphanFields.map(f => {
                                                                    const fieldId = f.fieldIds[proj];
                                                                    return (
                                                                        <div key={f.id} style={{ marginBottom: 16 }}>
                                                                            {/* аналогичный селект для orphans, если нужно */}
                                                                            <EditableFields
                                                                                params={[{
                                                                                    field_id: f.id,
                                                                                    field_name: f.label,
                                                                                    field_type: f.type,
                                                                                    field_vals: f.values,
                                                                                    editable: f.editable,
                                                                                    must_have: false,
                                                                                    project_name: proj
                                                                                }]}
                                                                                initialValues={{
                                                                                    [f.id]: values[proj]?.[fieldId] || ''
                                                                                }}
                                                                                onChange={nv => {
                                                                                    const v = nv[f.id] || '';
                                                                                    setValues(cur => ({
                                                                                        ...cur,
                                                                                        [proj]: { ...cur[proj], [fieldId]: v }
                                                                                    }));
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                </div>
                            )}
                            {(shouldShowMeta || tuskMode) && (
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
                        {(shouldShowMeta && !hasActiveCall && !postActive) && (
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
                                <label style={{ cursor: 'pointer', fontWeight: 500, display: "flex", gap: 8, marginTop: 8}}>
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
                role={role || "operator"}
                idProjectMap={idProjectMap}
                onSelectionChange={setGroupSelectedIds}
                handleGroupSave={handleGroupSave}
            />
        </div>
    );
};

export default CallControlPanel;
