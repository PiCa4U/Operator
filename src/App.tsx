import React, {useState, useMemo, useEffect, useRef} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setRoomId } from './redux/roomSlice';
import HeaderPanel, {Project} from './components/headerPanel';
import CallControlPanel, {ActiveCall, CallData} from './components/callControlPanel';
import CallsDashboard from './components/callsDashboard';
import ScriptPanel from './components/scriptPanel';
import { socket } from "./socket";
import { getCookies, makeId } from "./utils";
import {makeSelectFullProjectPool, setActiveCalls, setFsStatus, setUserStatuses} from './redux/operatorSlice';
import {RootState, store} from './redux/store';
import TasksDashboard, {ApiRow, OptionType, Preset} from "./components/taskDashboard";
import stylesButton from './components/callControlPanel/index.module.css';
import axios from "axios";
import {ManagerPanel} from "./components/managerPanel";
import Swal from "sweetalert2";

export interface ModuleData {
    start_modes: string[];
    filename: string;
    id: number;
    kwargs: any;
    return_structure: any;
    common_code: boolean
}

export interface MonoProjectsModuleData {
    [projectName: string]: ModuleData[];
}
const App: React.FC = () => {
    const [selectedCall, setSelectedCall] = useState<CallData | null>(null);
    const [showScriptPanel, setShowScriptPanel] = useState<boolean>(false);
    const [activeCall, setActiveCall] = useState<boolean>(false);
    const [activeProjectName, setActiveProjectName] = useState<string>("")
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [postActive, setPostActive] = useState<boolean>(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [outboundCall, setOutboundCall] = useState<boolean>(false)
    const [outActivePhone, setOutActivePhone] = useState<string | null>(null);
    const [outActiveProjectName, setOutActiveProjectName] = useState('');
    const [assignedKey, setAssignedKey] = useState('');
    const [isLoading,    setIsLoading]    = useState(false);
    const [specialKey, setSpecialKey] = useState<string>('')

    const [modules, setModules] = useState<ModuleData[]>([]);
    const [monoModules, setMonoModules] = useState<MonoProjectsModuleData>({})
    const [scriptProject, setScriptProject] = useState<string>("");
    const [postCallData, setPostCallData] = useState<ActiveCall | null>(null);
    const [expressCall, setExpressCall] = useState<boolean>(false)

    const [phoneID, setPhoneID] = useState<number|null>(null)
    useEffect(() => console.log("expressCall:", expressCall ),[expressCall])

    useEffect(() => console.log("scriptProject:", scriptProject ),[scriptProject])
    const { start: defaultStart, end: defaultEnd } = getInitialDateRange();
    const [startDate, setStartDate] = useState<Date | null>(defaultStart);
    const [endDate, setEndDate]     = useState<Date | null>(defaultEnd);
    const [selectedStatus, setSelectedStatus] = useState<string | null>(() => {
        const saved = localStorage.getItem('selectedStatus');
        console.log("saved: ", saved)
        return saved !== null ? saved : null;
    });

    const [openedGroup, setOpenedGroup] = useState<any[]>([]);
    const [phonesData, setPhonesData] = useState<any[]>([])
    const [openedPhones, setOpenedPhones] = useState<any[]>([])
    const [GroupIDs, setGroupIDs] = useState<any[]>([])

    const [managerPanel, setManagerPanel] = useState<boolean>(false)

    const momoProjectRepo = useRef<boolean>(false)
    const startModulesRanRef = useRef<boolean>(false);
    const { sessionKey } = store.getState().operator

    useEffect(() => {
        if (selectedStatus !== null) {
            localStorage.setItem('selectedStatus', selectedStatus);

        } else {
            localStorage.setItem('selectedStatus', "");
        }
    }, [selectedStatus]);

    const [prefix, setPrefix] = useState<string>('')
    const [get_callcenter, setGet_callcenter] = useState<boolean>(false)
    const [scriptDir, setScriptDir] = useState<"inbound" | "outbound" >("inbound")
    // const [currentPresetPage, setCurrentPresetPage]         = useState(1);
    const [presets, setPresets] = useState<OptionType[]>([]);
    const [showTasksDashboard, setShowTasksDashboard] = useState<boolean>(() => {
        const saved = localStorage.getItem('showTasksDashboard');
        return saved !== null ? JSON.parse(saved) : false;
    });

    const [currentPresetPage, setCurrentPresetPage] = useState<number>(() => {
        const saved = localStorage.getItem('tasksCurrentPage');
        return saved !== null ? parseInt(saved, 10) : 1;
    });
    useEffect(() => console.log("currentPresetPage: ", currentPresetPage),[currentPresetPage])
    const [selectedPreset, setSelectedPreset] = useState<OptionType | null>(() => {
        const saved = localStorage.getItem('tasksSelectedPreset');
        return saved ? JSON.parse(saved) as OptionType : null;
    });

    const { monitorUsers } = useSelector(
        (state: RootState) => state.operator.monitorData
    );

    useEffect(() => {
        setSelectedStatus(null)
    },[selectedPreset])
    function getInitialDateRange(): { start: Date; end: Date } {
        const raw = localStorage.getItem('dateRange');
        if (raw) {
            try {
                const { start, end, saved } = JSON.parse(raw) as {
                    start: string;
                    end?: string; // может отсутствовать
                    saved: string;
                };

                const savedDate = new Date(saved);
                const today = new Date();

                const isSameDay =
                    savedDate.getFullYear() === today.getFullYear() &&
                    savedDate.getMonth() === today.getMonth() &&
                    savedDate.getDate() === today.getDate();

                if (isSameDay && start) {
                    const startDate = new Date(start);
                    const endDate = end ? new Date(end) : new Date(startDate);
                    if (!end) {
                        endDate.setDate(endDate.getDate() + 1);
                    }
                    return { start: startDate, end: endDate };
                }

                localStorage.removeItem('dateRange');
            } catch {
                localStorage.removeItem('dateRange');
            }
        }

        // дефолт: сегодня → завтра
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { start: today, end: tomorrow };
    }
    const logoutShownRef = useRef(false);

    const handleLogout = () => {
        if (logoutShownRef.current) return;

        logoutShownRef.current = true;

        window.location.href = "https://my.glagol.ai/accounts/login/?next=/projects/";
    };

    useEffect(() => {
        socket.on('logout', handleLogout);
        return () => {
            socket.off('logout', handleLogout);
        };
    }, []);

    useEffect(() => {
        const now = new Date().toISOString();
        localStorage.setItem(
            'dateRange',
            JSON.stringify({
                start: startDate?.toISOString(),
                end:   endDate?.toISOString(),
                saved: now
            })
        );
    }, [startDate, endDate]);
    // 1) showTasksDashboard
    useEffect(() => {
        localStorage.setItem('showTasksDashboard', JSON.stringify(showTasksDashboard));
    }, [showTasksDashboard]);

// 2) currentPage
    useEffect(() => {
        localStorage.setItem('tasksCurrentPage', currentPresetPage.toString());
    }, [currentPresetPage]);

// 3) selectedPreset


    useEffect(() => console.log("scriptProject: ", scriptProject),[scriptProject])
    useEffect(() => {
        if (!selectedCall || !openedPhones.length) {
            setScriptProject("")
        }
    },[openedPhones.length, selectedCall])

    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;

    const role =
        "manager"
        // monitorUsers[sipLogin]?.type || "operator"

    const [outboundID, setOutboundID] = useState<number | null>(null)
    // const [selectedPreset, setSelectedPreset] = useState<OptionType | null>(null);

    useEffect(() => console.log('selectedPreset: ', selectedPreset),[selectedPreset])
    const [fullWidthCard, setFullWidthCard] = useState<boolean>(() => {
        try {
            return JSON.parse(localStorage.getItem('fullWidthCard') ?? 'false');
        } catch {
            return false;
        }
    });

    const rawActiveCalls = useSelector((state: RootState) => state.operator.activeCalls);
    const activeCalls: any[] = useMemo(() => {
        return Array.isArray(rawActiveCalls) ? rawActiveCalls : Object.values(rawActiveCalls || {});
    }, [rawActiveCalls]);

    function cleanProjectName(name?: string | null): string {
        const _name = name ?? '';
        return _name
            .replace(/(\s*\(.*?\)|@default)\s*$/g, '')
            .trim();
    }
    useEffect(() => {
        if (activeCalls.length || postActive) return
        console.log("scriptTestselectedCall: ",selectedCall)
        if (selectedCall) {
            console.log("scriptTestselectedCall112: ",Object.values(selectedCall?.projects)[0].call_result)
        }
        if (selectedCall && Object.values(selectedCall.projects)[0].call_result === null) {

        }
        if (selectedCall && Object.values(selectedCall.projects)[0].call_result === null) {
            // console.log("script")
            const scriptDirection = selectedCall.total_direction || "inbound"
            const scriptProj = Object.keys(selectedCall.projects)[0] !== "outbound" ?
                Object.keys(selectedCall.projects)[0] :
                selectedCall.variable_last_arg
            socket.emit('get_modules', {
                worker,
                session_key: sessionKey,
                projects: [cleanProjectName(scriptProj)],
            });

            setScriptDir(scriptDirection)
            setScriptProject(cleanProjectName(scriptProj))
        }
    },[activeCalls.length, postActive, selectedCall, sessionKey, worker])

    useEffect(()=> {
        if (showTasksDashboard && !momoProjectRepo.current) {
            setSelectedCall(null)
        }
    },[showTasksDashboard])

    const selectFullProjectPool3 = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    // Вызываем useSelector для получения «полных» проектов
    const projectPool2 = useSelector(selectFullProjectPool3) || [];
    const projectPoolForCall = useMemo(() => {
        return projectPool2
            // .filter(project => (project.out_active && project.active))
            .map(project => project.project_name);
    }, [projectPool2]);

    // useEffect(() => {
    //     socket.emit('get_modules', {
    //         worker,
    //         session_key: sessionKey,
    //         projects: projectPoolForCall,
    //     });
    // },[projectPoolForCall, sessionKey, worker])

    useEffect(() => {
        if(!showTasksDashboard) {
            setOpenedGroup([])
            setPhonesData([])
            setOpenedPhones([])
            setGroupIDs([])
        }
        // if(!postActive && !activeCalls.length && !selectedCall) {
        //     setOpenedGroup([])
        //     setPhonesData([])
        //     setOpenedPhones([])
        //     setGroupIDs([])
        // }
    },[showTasksDashboard, postActive, activeCalls.length, selectedCall])
    useEffect(() => console.log("openedPhones: ", openedPhones),[openedPhones])
    useEffect(() => console.log("phonesData: ", phonesData),[phonesData])

    const groupProjects = useMemo(() =>
            Array.from(new Set(openedPhones.map(p => p.project))),
        [openedPhones]
    );
    useEffect(() => {
        console.log("fullWidthCard: ", fullWidthCard)
    },[fullWidthCard])
    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    const projectPool = useSelector(selectFullProjectPool) || [];

    const projectColors = useMemo(() => {
        const palette = [
            '#4c78a8', '#f58518', '#54a24b', '#e45756',
            '#b279a2', '#9d755d', '#bab0ac', '#72b7b2',
            '#f2cf5b', '#7b4173',
        ];
        return groupProjects.reduce<Record<string,string>>((acc, proj, i) => {
            acc[proj] = palette[i % palette.length];
            return acc;
        }, {});
    }, [groupProjects]);

    useEffect(() => {
        if (groupProjects.length > 0) {
            setScriptProject(groupProjects[0]);
        } else if (openedPhones.length){
            setScriptProject('');
        }
    }, [groupProjects, openedPhones.length]);

    // useEffect(() => {
    //     if(!showTasksDashboard) {
    //         setOpenedPhones([])
    //         setPhonesData([])
    //         setOpenedGroup([])
    //     }
    // },[showTasksDashboard])
    useEffect(() => {
        // 🗂 Работает только если TasksDashboard активен И нет активного outbound вызова И нет выбранного outboundID
        if (showTasksDashboard && !outboundCall && !outboundID) {
            if (openedGroup.length > 0 && phonesData.length > 0) {
                const matched = phonesData.filter(phone =>
                    openedGroup.includes(phone.id)
                );
                setOpenedPhones(matched);
            } else {
                setOpenedPhones([]); // Если группу очистили вручную
            }
        }

        // 🚀 Работает только если именно outbound режим и есть outboundID
        // if (showTasksDashboard && outboundCall && outboundID && GroupIDs.length > 0 && phonesData.length > 0) {
        //     const matchedGroup = GroupIDs.find(group => group.includes(outboundID));
        //     if (matchedGroup) {
        //         const matched = phonesData.filter(phone =>
        //             matchedGroup.includes(phone.id)
        //         );
        //         setOpenedPhones(matched);
        //     } else {
        //         setOpenedPhones([]);
        //     }
        // }

        // В остальных случаях — НЕ ТРОГАТЬ
    }, [openedGroup, phonesData, outboundID, GroupIDs, outboundCall, showTasksDashboard]);


    useEffect(()=> console.log("activeProjectName: ", activeProjectName),[activeProjectName])
    useEffect(()=> console.log("activeCall: ", activeCall),[activeCall])

    // const sessionKey = getCookies('session_key') || '';
    useEffect(() => {
        try {
            localStorage.setItem('fullWidthCard', JSON.stringify(fullWidthCard));
        } catch {}
    }, [fullWidthCard]);

    const dispatch = useDispatch();
    const roomId = useMemo(() => makeId(40), []);

    useEffect(() => {
        // TODO fix check_express
        // if (activeCalls.length > 0) {
        //     socket.emit('check_express', {
        //         phone,
        //         project_name,
        //         session_key,
        //         worker
        //     })
        // }
        console.log("activeCalls: ", activeCalls)
    },[activeCalls])


    useEffect(()=> {
        if (!activeCall && !postActive && (modules.length || Object.keys(monoModules).length) && !openedPhones.length && !selectedCall) {
            console.log("1234delete")
            setModules([])
            setMonoModules({})
        }
    },[activeCall, modules.length, monoModules, openedPhones.length, postActive, selectedCall])

    useEffect(() => {
        if (!activeCall && !postActive) {
            setActiveProjectName('');
            setSelectedCall(null);
            setOutboundCall(false);
            setOutboundID(null)
            setOutActivePhone(null);
            setGet_callcenter(false);
            setOutActiveProjectName('');
            setPhoneID(null)
            setAssignedKey('');
            setOpenedGroup([])
            setPhonesData([])
            setOpenedPhones([])
            setGroupIDs([])
            setExpressCall(false)
        }
    }, [activeCall, postActive]);

    useEffect(() => {
        if(openedPhones.length === 0) {
            momoProjectRepo.current = false
        }
    },[openedPhones])
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
        const first = activeCalls && activeCalls.length ? activeCalls[0] : {};
        console.log("first: ", first)

        if (activeCalls.length > 0 && !activeCall && (first?.application || first?.b_callstate === "ACTIVE")) {
            setActiveCall(true);
        } else if (!activeCalls.length && activeCall) {
            setActiveCall(false);
            // setOutboundCall(false);
            setPostActive(true);
        }
    }, [activeCall, activeCalls]);

    useEffect(()=> {
        const getOuboundProject = (msg:any) => {
            setScriptDir("outbound")
            setActiveProjectName(msg.project_name)
            if (expressCall){
                setPhoneID(msg.phone_line[0].id)
            }
        }
        socket.on('get_out_start', getOuboundProject);
        return () => {
            socket.off('get_out_start', getOuboundProject);
        };
    },[expressCall])
    // useEffect(()=> {
    //     if (postActive && sessionKey) {
    //         socket.emit('get_fs_report', {
    //             session_key: sessionKey,
    //             sip_login: sipLogin,
    //             level: 0,
    //             date_range: "",
    //             phone_search: "",
    //         });
    //         setCurrentPage(1)
    //     }
    // },[showScriptPanel, postActive, sessionKey])

    useEffect(() => {
        const handleFsDiaDes = (msg: any) => {
            // ✅ Ставим активный проект
            setActiveProjectName(msg.project_name);

            // ✅ Проверяем express по активному номеру
            if (activeCalls[0]?.cid_num) {
                socket.emit('check_express', {
                    phone: activeCalls[0].cid_num,
                    project_name: msg.project_name,
                    session_key: sessionKey,
                    worker,
                });
            }

            // ✅ Запрашиваем FS причины
            socket.emit('get_fs_reasons', {
                project_name: msg.project_name,
                session_key: sessionKey,
                worker,
            });
        };

        const handleCheckExpress = (check: any) => {
            console.log("check_express response:", check);
            if (check.express && check.assigned_key) {
                setShowTasksDashboard(true)
                setAssignedKey(check.assigned_key);
                setExpressCall(check.express)
                setOutActiveProjectName(activeProjectName)
                // ✅ Запрашиваем phone_line
                setOutActivePhone(activeCalls[0].cid_num)
                socket.emit('get_phone_line', {
                    worker,
                    session_key: sessionKey,
                    project_name: activeProjectName,
                    phones: [activeCalls[0].cid_num],
                    express: check.express
                });
            }
        };

        const handleGetPhoneLine = (msg: any) => {
            console.log("get_phone_line response:", msg);

            // ✅ Если приходит массив phone_line, берем special_key
            if (msg.phone_line[0]?.special_key) {
                setSpecialKey(msg.phone_line[0].special_key);
                if (assignedKey && msg.phone_line[0].special_key) {
                    socket.emit('outbound_call_update', {
                        worker,
                        session_key: sessionKey,
                        assigned_key: assignedKey,
                        log_status: 'ringing',
                        phone_status: 'ringing',
                        special_key: msg.phone_line[0].special_key,
                    });

                }
            }
            console.log()
            if (expressCall) {
                socket.emit("accept_express_call",{
                    worker,
                    session_key: sessionKey,
                    assigned_key: assignedKey,
                    sip_login: sipLogin,
                    project_name: msg.project_name
                })
            }
        };

        socket.on('get_callcenter_queues', handleFsDiaDes);
        socket.on('check_express', handleCheckExpress);
        socket.on('get_out_start', handleGetPhoneLine);

        return () => {
            socket.off('get_callcenter_queues', handleFsDiaDes);
            socket.off('check_express', handleCheckExpress);
            socket.off('get_out_start', handleGetPhoneLine);
        };
    }, [outboundCall, sessionKey, worker, activeCalls, assignedKey, activeProjectName, expressCall]);

    function extractPhoneGroups(obj: any): any[][] {
        const groups: any[][] = [];
        function recurse(node: any) {
            if (Array.isArray(node)) {
                if (node.length && typeof node[0] === 'object' && 'phone' in node[0]) {
                    groups.push(node); // нашли массив телефонов
                }
            } else if (typeof node === 'object' && node !== null) {
                Object.values(node).forEach(recurse);
            }
        }
        recurse(obj);
        return groups;
    }

    useEffect(() => {
        if (!selectedCall) return;

        const projNames = Object.keys(selectedCall?.projects)
        const projNamesSaved = projNames[0] === "outbound" && projNames.length === 1 ? [selectedCall.variable_last_arg] : projNames
        console.log("projNames: ", projNames)
        if (projNames.length < 2 && projNames[0] !== "outbound") return;

        const fetchPresetsAndCheckPhone = async () => {
            try {

                let myPresets = presets;
                if (presets.length === 0) {
                    const response = await axios.post<Preset[]>('/api/v1/get_preset_list', {
                        glagol_parent: 'fs.at.glagol.ai',
                        worker,
                        projects: projectPoolForCall,
                        role,
                    });

                    // Данные уже в response.data
                    const data: Preset[] = response.data;

                    const myPresets = data.map(p => ({
                        value: p.id,
                        label: p.preset_name,
                        preset: p,
                    }));
                    setPresets(myPresets);
                }

                const matchedPreset = myPresets.find(p =>
                    p.preset.projects.includes(projNamesSaved[0])
                );
                if (!matchedPreset) {
                    console.log('Нет пресета под проект:', projNamesSaved[0]);
                    return;
                } else {
                    console.log("matchedPreset:", matchedPreset);
                    setSelectedPreset(matchedPreset);
                }

                const response2 = await axios.post<any>('/api/v1/get_grouped_phones', {
                    glagol_parent: projectPool[0].scheme || '',
                    group_by: matchedPreset.preset.group_by,
                    filter_by: { project: ['IN', matchedPreset.preset.projects] },
                    group_table: matchedPreset.preset.group_table,
                    role,
                });
                console.log("FUCKED")
                const projectIdData = response2.data;
                console.log("OUT1121projectIdData:", projectIdData);

                // ✅ Используем рекурсивный обход для сбора всех массивов телефонов
                const allGroups = extractPhoneGroups(projectIdData);
                console.log("OUT1121allGroups:", allGroups);

                // ✅ Все телефоны одним списком
                const flatPhones = allGroups.flat();
                console.log('OUT1121flatPhones:', flatPhones);

                const phoneNumber = selectedCall.b_line_num;
                if (!phoneID) return;

                // ✅ Фильтруем группы, где хотя бы один телефон совпадает
                const matchedGroups = allGroups.filter(group =>
                    group.some(item => item.id === phoneID)
                );
                console.log("matchedGroups:", matchedGroups);

                if (matchedGroups.length > 0) {
                    setShowTasksDashboard(true);

                    const matchedGroupIDs = Array.from(
                        new Set(matchedGroups.flat().map(item => item.id))
                    );
                    console.log("OUTmatchedGroup:", matchedGroupIDs);
                    const openedPhones = matchedGroups.flat()
                    console.log("OUTopenedPhones:", openedPhones);

                    const groupIDs = allGroups.map(group => group.map(item => item.id));

                    setGroupIDs(groupIDs);
                    setPhonesData(flatPhones);
                    setOpenedGroup(matchedGroupIDs);
                    setOpenedPhones(openedPhones);

                    momoProjectRepo.current=true

                } else {
                    console.log("Номер не найден → tuskMode OFF");
                    setShowTasksDashboard(false);
                }

            } catch (err) {
                console.error('Ошибка при проверке пресетов:', err);
            }
        };

        fetchPresetsAndCheckPhone();
    }, [selectedCall, phoneID, selectedPreset, presets, projectPool, worker, projectPoolForCall]);

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
        if (!(activeCalls[0] && Object.keys(activeCalls[0]).length > 0)) return
        const first = activeCalls[0]
        if (first.direction === "inbound") {
            setShowTasksDashboard(false)
        }
        console.log("first: ", first)
        if (first.uuid !== "" && first.cid_num !== "" && !get_callcenter && !outboundCall){
            setGet_callcenter(true)
            setScriptDir("inbound")
            const requestParams = {
                session_key: sessionKey,
                worker,
                phone: activeCalls[0].cid_num,
            };
            socket.emit('get_callcenter_queues', requestParams);
        }
    }, [activeCall, activeCalls, get_callcenter, outboundCall]);

    const findNameProject = (projectName: string)=> {
        if (!projectName) return "";
        const found = projectPool.find(
            (proj) => proj.project_name === projectName
        );
        return found ? found.glagol_name : projectName;
    }

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
                showTasksDashboard={showTasksDashboard}
                setShowTasksDashboard={setShowTasksDashboard}
                prefix={prefix}
                setPrefix={setPrefix}
                setOutboundID={setOutboundID}
                setOpenedGroup={setOpenedGroup}
                setGroupIDs={setGroupIDs}
                setOpenedPhones={setOpenedPhones}
                setPhonesData={setPhonesData}
                setSelectedPreset={setSelectedPreset}
                role={role}
                expressCall={expressCall}
                groupProjects={groupProjects}
                setManagerPanel={setManagerPanel}
                managerPanel={managerPanel}
                setPhoneID={setPhoneID}
                phoneID={phoneID}
            />

            {managerPanel ? (
                (<ManagerPanel/>)
            ) :
                showTasksDashboard ? (
                        <>
                            {/* Показываем Dashboard, если нет активного звонка */}
                            {!(activeCall || postActive) && openedPhones.length === 0 && (
                                <TasksDashboard
                                    openedGroup={openedGroup}
                                    setOpenedGroup={setOpenedGroup}
                                    phonesData={phonesData}
                                    setPhonesData={setPhonesData}
                                    setGroupIDs={setGroupIDs}
                                    selectedPreset={selectedPreset}
                                    setSelectedPreset={setSelectedPreset}
                                    role={role}
                                    currentPage={currentPresetPage}
                                    setCurrentPage={setCurrentPresetPage}
                                    startDate={startDate}
                                    setStartDate={setStartDate}
                                    endDate={endDate}
                                    setEndDate={setEndDate}
                                    selectedStatus={selectedStatus}
                                    setSelectedStatus={setSelectedStatus}
                                />
                            )
                            }
                            <div
                                // общий «ряд», в котором скрипт и карточка
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 16,
                                }}
                            >
                                {/* ScriptPanel */}
                                <div
                                    style={{
                                        order: fullWidthCard ? 2 : 1,
                                        flex: fullWidthCard ? '0 0 100%' : '0 0 48%',
                                    }}
                                >
                                    {!postActive && !activeCall && openedPhones.length > 0 && (
                                        <div style={{ marginLeft: 13, marginRight: 14 }}>
                                            {groupProjects.length > 1 && (
                                                <div style={{ display: "flex", gap: "8px", marginBottom: "6px", marginLeft: "25px" }}>
                                                    {groupProjects.map(proj => {
                                                        const isActive = scriptProject === proj;
                                                        return (
                                                            <button
                                                                key={proj}
                                                                className={`${stylesButton.projectButton} ${isActive ? stylesButton.active : ""}`}
                                                                style={{
                                                                    color:        isActive ? "#fff" : projectColors[proj],
                                                                    background:   isActive ? projectColors[proj] : "transparent",
                                                                    borderColor:  projectColors[proj],
                                                                }}
                                                                onClick={() => setScriptProject(proj)}
                                                            >
                                                                {findNameProject(proj)}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {scriptProject && (
                                        <ScriptPanel
                                            key={scriptProject}
                                            projectName={scriptProject}
                                            onClose={() => setShowScriptPanel(false)}
                                            direction={scriptDir}
                                            uuid={postCallData?.uuid}
                                            bUuid={postCallData?.b_uuid}
                                            tuskMode={showTasksDashboard}
                                        />
                                    )}
                                </div>

                                <div
                                    style={{
                                        order: fullWidthCard ? 1 : 2,
                                        flex: fullWidthCard ? '0 0 100%' : '0 0 50%',
                                    }}
                                >
                                    {(openedPhones.length > 0 || activeCall || postActive) && (
                                        <CallControlPanel
                                            call={selectedCall}
                                            hasActiveCall={activeCall}
                                            activeProject={scriptProject}
                                            onClose={() => setSelectedCall(null)}
                                            postActive={postActive}
                                            setPostActive={setPostActive}
                                            currentPage={currentPage}
                                            outActivePhone={outActivePhone}
                                            outActiveProjectName={outActiveProjectName}
                                            assignedKey={assignedKey}
                                            isLoading={isLoading}
                                            setSelectedCall={setSelectedCall}
                                            setIsLoading={setIsLoading}
                                            specialKey={specialKey}
                                            setModules={setModules}
                                            modules={modules}
                                            prefix={prefix}
                                            outboundCall={outboundCall}
                                            tuskMode={showTasksDashboard}
                                            setTuskMode={setShowTasksDashboard}
                                            fullWidthCard={fullWidthCard}
                                            setFullWidthCard={setFullWidthCard}
                                            openedPhones={openedPhones}
                                            setOpenedPhones={setOpenedPhones}
                                            monoModules={monoModules}
                                            setMonoModules={setMonoModules}
                                            setActiveProjectName={setActiveProjectName}
                                            selectedPreset={selectedPreset}
                                            postCallData={postCallData}
                                            setPostCallData={setPostCallData}
                                            role={role}
                                            setOpenedGroup={setOpenedGroup}
                                            setPhonesData={setPhonesData}
                                            momoProjectRepo={momoProjectRepo}
                                            startModulesRanRef={startModulesRanRef}
                                            expressCall={expressCall}
                                            phoneID={phoneID}
                                            setPhoneID={setPhoneID}
                                        />
                                    )}
                                </div>
                            </div>
                        </>
                    ) : <div className="row my-3">
                        {/* Левая колонка: Дашборд звонков или панель скриптов */}
                        <div className="col-12 col-md-6">
                            {(selectedCall && scriptDir && scriptProject && !postActive && !activeCalls.length) ?
                                <ScriptPanel
                                    direction={scriptDir}
                                    projectName={scriptProject}
                                    onClose={() => setSelectedCall(null)}
                                    tuskMode={showTasksDashboard}
                                    selectedCall={selectedCall}
                                />
                                :
                                (
                                    showScriptPanel ||
                                    (activeCall && activeProjectName) ||
                                    (postActive && activeProjectName)
                                        ? (
                                            <ScriptPanel
                                                direction={scriptDir}
                                                projectName={activeProjectName}
                                                onClose={() => setShowScriptPanel(false)}
                                                tuskMode={showTasksDashboard}
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
                                        ))}
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
                                    assignedKey={assignedKey}
                                    isLoading={isLoading}
                                    setIsLoading={setIsLoading}
                                    specialKey={specialKey}
                                    setModules={setModules}
                                    setSelectedCall={setSelectedCall}
                                    modules={modules}
                                    prefix={prefix}
                                    outboundCall={outboundCall}
                                    tuskMode={showTasksDashboard}
                                    postCallData={postCallData}
                                    setPostCallData={setPostCallData}
                                    startModulesRanRef={startModulesRanRef}
                                    monoModules={monoModules}
                                    setMonoModules={setMonoModules}
                                    expressCall={expressCall}
                                />
                            )}
                        </div>
                    </div>
            }
        </div>
    );
};

export default App;
