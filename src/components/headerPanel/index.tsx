import React, {useEffect, useMemo, useState} from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import {RootState, store} from '../../redux/store';
import {initSocket} from '../../socket';
import { getCookies, parseMonitorData } from '../../utils';
import {makeSelectFullProjectPool, selectProjectPool, setMonitorData} from "../../redux/operatorSlice";
import isEqual from "lodash/isEqual";

// types.ts
export interface Project {
    active: boolean;
    created_date: string;
    deleted_date: string | null;
    description: string | null;
    glagol_name: string;
    glagol_parent: string;
    id: number;
    in_script: {
        comment_mode: string;
        script_id: number;
        script_mode: string;
        source: string;
    };
    is_deleted: boolean;
    modified_date: string | null;
    out_active: boolean;
    out_gateways: {extension_name: string, prefix: string};
    out_priority: number | null;
    out_script: {
        comment_mode: string;
        script_id: number;
        script_mode: string;
        source: string;
    } | null;
    project_name: string;
    scheme: string;
    start_type: string | null;
}

interface HeaderPanelProps {
    setShowScriptPanel: (showScriptPanel: boolean) => void;
    showScriptPanel: boolean
    selectedProject: Project | null;
    setSelectedProject: (selectedProject: Project) => void;
    setPostActive: (postActive: boolean) => void
    setOutboundCall: (outBoundCall: boolean) => void
    setActiveProjectName:(activeProjectName: string) => void
    outActivePhone: OutActivePhone | null
    setOutActivePhone: (outActivePhone: OutActivePhone | null) => void
    outActiveProjectName: string
    setOutActiveProjectName: (outActiveProjectName: string) => void
    assignedKey: string
    setAssignedKey: (assignedKey: string) => void
    setIsLoading: (isLoading: boolean) => void
    prefix: string
    setPrefix: (prefix: string) => void
}

export interface OutActivePhone {
    phone?: string;
    special_key?: string;
    status?: string;
    contact_info:{ [fieldId: string]: string }
    // другие поля, если нужно
}

const HeaderPanel: React.FC<HeaderPanelProps> = ({
                                                     setIsLoading,
                                                     outActivePhone,
                                                     assignedKey,
                                                     setAssignedKey,
                                                     setOutActivePhone,
                                                     outActiveProjectName,
                                                     setOutActiveProjectName,
                                                     setOutboundCall,
                                                     setShowScriptPanel,
                                                     setPostActive,
                                                     showScriptPanel,
                                                     prefix,
                                                     setPrefix,
                                                     setActiveProjectName,
                                                 }) => {
    const {
        sessionKey = '',
        sipLogin   = '',
        fsServer   = '',
        worker     = '',
    } = store.getState().credentials;

    const roomId = useSelector((state: RootState) => state.room.roomId) || 'default_room';

    const dispatch = useDispatch();
    const { monitorUsers, monitorProjects, allProjects, monitorCallcenter } = useSelector(
        (state: RootState) => state.operator.monitorData
    );

    const fsStatus = useSelector(
        (state: RootState) => state.operator.fsStatus,
        isEqual
    );
    const post = fsStatus.status === "Available (On Demand)" && fsStatus.state === "Idle";
    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);

    const projectPool = useSelector(selectFullProjectPool) || [];
    // console.log("projectPool: ", projectPool)
    const projectPoolForCall = useMemo(() => {
        return projectPool.filter(project => (project.out_active && project.active)).map(project => project.project_name);
    }, [projectPool]);

    const rawActiveCalls = useSelector((state: RootState) => state.operator.activeCalls);
    const activeCalls = useMemo(() => {
        return Array.isArray(rawActiveCalls)
            ? rawActiveCalls
            : Object.values(rawActiveCalls || {});
    }, [rawActiveCalls]);
    const myCallCenter = monitorCallcenter[sipLogin]?.[0];

    // Локальные стейты
    const [showStatuses, setShowStatuses] = useState(false);
    const [phone, setPhone] = useState('');
    const [outExtension, setOutExtension] = useState('');
    const [outBaseFields, setOutBaseFieldValues] = useState<any>({});
    const [callType, setCallType] = useState<'call' | 'redirect'>('call');

    // Стейты для исходящих/автодозвона
    const [handleOutboundCall, setHandleOutboundCall] = useState<boolean>(false)
    // const [outActivePhone, setOutActivePhone] = useState<OutActivePhone | null>(null);
    // const [outActiveProjectName, setOutActiveProjectName] = useState('');
    const [outActiveStartType, setOutActiveStartType] = useState('');
    const [outActiveStart, setOutActiveStart] = useState('');
    const [outActiveTakenReason, setOutActiveTakenReason] = useState('');
    const [outExtensions, setOutExtensions] = useState<any[]>([]);
    // const [assignedKey, setAssignedKey] = useState('');
    const [outPreparation, setOutPreparation] = useState(false);
    const [hasActiveCall, setHasActiveCall] = useState<boolean>(false)
    const [postCallData, setPostCallData] = useState<any>({})
    // Список операторов
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'operators' | 'robots'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

    const [callStartTime, setCallStartTime] = useState<Date | null>(null);
    const [callTimer, setCallTimer] = useState<string>('00:00');

    const socket = initSocket();

    useEffect(() => {
        if (activeCalls.length > 0 && Object.keys(activeCalls[0]).length > 0) {
            setHasActiveCall(true);
        } else {
        setHasActiveCall(false);
      }
    }, [activeCalls]);

    useEffect(() => {
        setHandleOutboundCall(false);

        const first = activeCalls[0];
        const hasAppField = first !== undefined && 'application' in first;
        const hasApp      = Boolean(first?.application);


        if (hasAppField && hasApp) {
            setPostCallData(first);
        }

        if (!hasActiveCall && !hasAppField && postCallData?.application) {
            socket.emit('get_fs_report', {
                worker,
                session_key: sessionKey,
                sip_login: sipLogin,
                room_id: roomId,
                fs_server: fsServer,
                level: 0,
            });
            if (fsStatus.status === "On Break") {
                socket.emit('change_stat_fs', {
                    fs_server: fsServer,
                    sip_login: sipLogin,
                    room_id: roomId,
                    worker: sipLogin,
                    session_key: sessionKey,
                    action: 'available',
                    page: 'online',
                });
            }
            setIsLoading(true)
            socket.emit('outbound_calls', {
                worker,
                sip_login: sipLogin,
                session_key: sessionKey,
                room_id: roomId,
                fs_server: fsServer,
                project_pool: projectPoolForCall,
                action: 'update_phone_to_call',
                assigned_key: assignedKey,
                log_status: 'finished',
                phone_status: 'finished',
                special_key: outActivePhone?.special_key,
                project_name: outActiveProjectName,
            });
            setPostCallData({});
        }
    }, [activeCalls, postCallData, hasActiveCall]);


    const getRegisteredSofia = (status: string) => {
        return status.includes('Registered')
    };

    useEffect(() => {
        let intervalId: NodeJS.Timeout;

        if (hasActiveCall) {
            // получаем первый звонок
            const first = activeCalls[0];
            // пытаемся взять время из epoch-поля, иначе текущее время
            const epoch = first.b_created_epoch || first.created_epoch;
            const start = epoch
                ? new Date(Number(epoch) * 1000)
                : first.b_created
                    ? new Date(first.b_created)
                    : new Date();

            setCallStartTime(start);

            intervalId = setInterval(() => {
                const diffMs = Date.now() - start.getTime();
                const totalSec = Math.floor(diffMs / 1000);
                const mins = Math.floor(totalSec / 60);
                const secs = totalSec % 60;
                setCallTimer(
                    `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
                );
            }, 1000);

        } else {
            // звонок закончен — сбрасываем
            setCallStartTime(null);
            setCallTimer('00:00');
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [hasActiveCall, activeCalls]);



    useEffect(() => {
        const s_dot = worker.indexOf('.');
        const s_login = worker.slice(s_dot + 1);

        if (roomId !== "default_room") {
            socket.emit('monitor_fs', {
                login: s_login,
                room_id: roomId,
                fs_server: fsServer,
                action: 'get_projects'
            });
        }
    }, [worker, roomId, fsServer]);


    const changeStateFs = (newState: string, reason: string) => {
        socket.emit('change_state_fs', {
            fs_server: fsServer,
            sip_login: sipLogin,
            room_id: roomId,
            worker,
            session_key: sessionKey,
            state: newState,
            reason,
            page: 'online'
        });
    };

    const outProjectClickToCall = (out_extension: string, phone: string, project_name: string ) => {
        socket.emit('get_out_start', {
            fs_server: fsServer,
            room_id: roomId,
            worker,
            session_key: sessionKey,
            call_section: 1,
            project_name: project_name,
            phone: phone,
            out_extension: out_extension,
            special_key: outActivePhone?.special_key
        });
    };

    useEffect(() => {
        const handleGetPhoneToCall = (msg: any) => {
            setOutActivePhone(msg.phone);
            setOutActiveProjectName(msg.project_name);
            setOutActiveStartType(msg.start_type);
            setOutActiveStart(msg.start);
            setOutActiveTakenReason(msg.taken_reason);
            setPrefix(msg.out_extensions[0]?.prefix || '')
            setOutExtensions(msg.out_extensions);
            setAssignedKey(msg.assigned_key);
            setOutPreparation(true);

            if (msg.start_type === 'manual') {
                Swal.fire({
                    title: `Исходящий вызов - ${allProjects[msg.project_name]?.glagol_name || msg.project_name}`,
                    text: `На номер ${msg.phone?.phone || msg.phone}`,
                    showCancelButton: true,
                    confirmButtonText: 'Совершить',
                    cancelButtonText: 'Отказаться',
                    icon: "warning",
                    timer: 20000,
                    timerProgressBar: true,
                }).then((result) => {
                    if (result.isConfirmed) {
                        outProjectClickToCall(msg.out_extensions[0].prefix, msg.phone.phone, msg.project_name);
                        if (projectPoolForCall.length > 0) {
                            socket.emit('outbound_calls', {
                                worker,
                                sip_login: sipLogin,
                                session_key: sessionKey,
                                room_id: roomId,
                                fs_server: fsServer,
                                project_pool: projectPoolForCall,
                                action: 'update_phone_to_call',
                                assigned_key: msg.assigned_key,
                                log_status: 'taken',
                                phone_status: 'taken',
                                special_key: msg.phone?.special_key,
                                project_name: msg.project_name,
                            });
                        }
                    } else {
                        changeStateFs('waiting', 'outbound_reject');
                        setOutPreparation(false);
                        if (projectPoolForCall.length > 0) {
                            socket.emit('outbound_calls', {
                                worker,
                                sip_login: sipLogin,
                                session_key: sessionKey,
                                room_id: roomId,
                                fs_server: fsServer,
                                project_pool: projectPoolForCall,
                                action: 'update_phone_to_call',
                                assigned_key: msg.assigned_key,
                                log_status: 'reject',
                                phone_status: msg.phone?.status,
                                special_key: msg.phone?.special_key,
                                project_name: msg.project_name,
                            });
                        }
                    }
                });
            } else if (msg.start_type === 'auto') {
                Swal.fire({
                    title: `Исходящий вызов - ${allProjects[msg.project_name]?.glagol_name || msg.project_name}`,
                    text: `На номер ${msg.phone?.phone || msg.phone}`,
                    showConfirmButton: false,
                    icon: "warning",
                    timer: 3000,
                    timerProgressBar: true,
                }).then(() => {
                    outProjectClickToCall(msg.out_extensions[0].prefix, msg.phone.phone, msg.project_name);
                    if (projectPoolForCall.length > 0) {
                        socket.emit('outbound_calls', {
                            worker,
                            sip_login: sipLogin,
                            session_key: sessionKey,
                            room_id: roomId,
                            fs_server: fsServer,
                            project_pool: projectPoolForCall,
                            action: 'update_phone_to_call',
                            assigned_key: msg.assigned_key,
                            log_status: 'taken',
                            phone_status: 'taken',
                            special_key: msg.phone?.special_key,
                            project_name: msg.project_name,
                        });
                    }
                });
            }
        };

        const handleClickToCallStart = (msg: any) => {
            if (msg.result === 'ok') {
                Swal.fire({ title: "Звонок запускается", icon: "success", timer: 1000 });
                socket.emit('outbound_calls', {
                    worker,
                    sip_login: sipLogin,
                    session_key: sessionKey,
                    room_id: roomId,
                    fs_server: fsServer,
                    project_pool: projectPoolForCall,
                    action: 'update_phone_to_call',
                    assigned_key: assignedKey,
                    log_status: 'ringing',
                    phone_status: 'ringing',
                    special_key: outActivePhone?.special_key,
                    project_name: outActiveProjectName,
                });
            } else {
                Swal.fire({ title: "Ошибка при старте звонка", icon: "error" });
                socket.emit('outbound_calls', {
                    worker,
                    sip_login: sipLogin,
                    session_key: sessionKey,
                    room_id: roomId,
                    fs_server: fsServer,
                    project_pool: projectPoolForCall,
                    action: 'update_phone_to_call',
                    assigned_key: assignedKey,
                    log_status: 'error',
                    phone_status: 'error',
                    special_key: outActivePhone?.special_key,
                    project_name: outActiveProjectName,
                });
                setActiveProjectName("")
                setOutboundCall(false)
                socket.emit('change_stat_fs', {
                    fs_server: fsServer,
                    sip_login: sipLogin,
                    room_id: roomId,
                    worker: sipLogin,
                    session_key: sessionKey,
                    action: 'available',
                    page: 'online',
                });
            }
        };

        const handleHoldToggle = () => {
            Swal.fire({ title: "Удержание переключено", icon: "success", timer: 1000 });
        };

        const handleUuidBreak = () => {
            Swal.fire({ title: "Вызов завершён", icon: "success", timer: 1000 });
        };

        const handleUuidBridge = () => {
            Swal.fire({ title: "Вызовы объединены", icon: "success", timer: 1000 });
        };

        socket.on('get_phone_to_call', handleGetPhoneToCall);
        socket.on('click_to_call_start', handleClickToCallStart);
        socket.on('hold_toggle', handleHoldToggle);
        socket.on('uuid_break', handleUuidBreak);
        socket.on('uuid_bridge', handleUuidBridge);

        return () => {
            socket.off('get_phone_to_call', handleGetPhoneToCall);
            socket.off('click_to_call_start', handleClickToCallStart);
            socket.off('hold_toggle', handleHoldToggle);
            socket.off('uuid_break', handleUuidBreak);
            socket.off('uuid_bridge', handleUuidBridge);
        };
    }, [allProjects, assignedKey, fsServer, outActivePhone?.special_key, outActiveProjectName, projectPoolForCall, roomId, sessionKey, sipLogin, worker]);

    // Автодозвон (раз в 15 секунд)
    useEffect(() => {
        const interval = setInterval(() => {
            if (
                !hasActiveCall &&
                projectPoolForCall.length > 0 &&
                getRegisteredSofia(fsStatus.sofia_status) &&
                fsStatus.state === "Waiting" &&
                (fsStatus.status === "Available (On Demand)" || fsStatus.status === "Available")
            ) {
                socket.emit('outbound_calls', {
                    worker,
                    sip_login: sipLogin,
                    session_key: sessionKey,
                    room_id: roomId,
                    fs_server: fsServer,
                    project_pool: projectPoolForCall,
                    action: 'get_phone_to_call'
                });
            }
        }, 15000);
        return () => clearInterval(interval);
    }, [hasActiveCall, outPreparation, sipLogin, sessionKey, worker, roomId, fsServer, projectPoolForCall, fsStatus.state, fsStatus.status]);

    useEffect(() => {
        const handleGetOutStart = (msg: any) => {
            setOutboundCall(true)
            // setOutActivePhone(msg.phone);
            setOutActiveProjectName(msg.project_name);
            // setAssignedKey(msg.assigned_key);
            setOutPreparation(false);
             if (!hasActiveCall && !handleOutboundCall) {
                  socket.emit('click_to_call', {
                      worker,
                      sip_login: sipLogin,
                      session_key: sessionKey,
                      room_id: roomId,
                      fs_server: fsServer,
                      phone: msg.phone?.phone || msg.phone,
                      out_extension: msg.out_extension,
                      call_type: 'call',
                      project_name: msg.project_name
                });
            }
        };

        socket.on('get_out_start', handleGetOutStart);
        return () => {
            socket.off('get_out_start', handleGetOutStart);
        };
    }, [sipLogin, sessionKey, roomId, fsServer, worker, hasActiveCall]);
    // --- (B) Обработчик «Вызов по номеру» ---
    const handleCallByNumber = () => {
        setOutExtension('');
        setOutBaseFieldValues({});
        if (!activeCalls[0].application) {
            setHandleOutboundCall(true)
        }
        setOutboundCall(true)
        // outProjectClickToCall()

        let selectedExtension = '';

        if (prefix) {
            selectedExtension = prefix;
        }

        if (hasActiveCall) {
            setCallType('redirect');
        } else {
            setCallType('call');
        }

        // Если в итоге мы ничего не нашли, и это не redirect, показываем ошибку
        if (!selectedExtension && callType !== 'redirect') {
            Swal.fire({
                title: "Вам не назначена линия для исходящих вызовов",
                text: 'Обратитесь к администратору',
                icon: "error",
            });
            return;
        }

        // socket.emit('sofia_operations', {
        //     worker,
        //     sip_login: sipLogin,
        //     session_key: sessionKey,
        //     room_id: roomId,
        //     fs_server: fsServer,
        //     uuid: activeCalls[0].uuid,
        //     action: 'hold_toggle'
        // });
        // if (callType === 'redirect') {
        socket.emit('click_to_call', {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            room_id: roomId,
            fs_server: fsServer,
            phone,
            out_extension: selectedExtension,
            call_type: 'redirect',
            uuid: activeCalls[0].uuid,
        });
        // } else {
        //     socket.emit('click_to_call', {
        //         worker,
        //         sip_login: sipLogin,
        //         session_key: sessionKey,
        //         room_id: roomId,
        //         fs_server: fsServer,
        //         phone,
        //         out_extension: selectedExtension,
        //         call_type: 'call',
        //     });
        // }
    };

    const handlePostStop = () => {
        socket.emit('change_state_fs', {
            fs_server: fsServer,
            sip_login: sipLogin,
            room_id: roomId,
            worker,
            session_key: sessionKey,
            action: 'available',
            state: "waiting",
            reason: "manual_return",
            page: 'online',
        });
        setPostActive(false)
    };

    const handleStartFs = (reason?: string, idle_set?: boolean) => {
        socket.emit('change_stat_fs', {
            fs_server: fsServer,
            sip_login: sipLogin,
            room_id: roomId,
            worker,
            session_key: sessionKey,
            action: 'available',
            reason,
            idle_set,
            page: 'online',
        });
        socket.emit('change_state_fs', {
            fs_server: fsServer,
            sip_login: sipLogin,
            room_id: roomId,
            worker,
            session_key: sessionKey,
            action: 'available',
            state: "waiting",
            reason,
            page: 'online',
        });
    };


    const handlePauseFs = async () => {
        if (fsStatus.status === "On Break") {
            socket.emit('change_stat_fs', {
                fs_server: fsServer,
                sip_login: sipLogin,
                room_id: roomId,
                worker: sipLogin,
                session_key: sessionKey,
                action: 'available',
                page: 'online',
            });
        } else {
            const { value: reason } = await Swal.fire({
                title: 'Укажите причину перерыва',
                input: 'select',
                inputOptions: {
                    break: 'Перерыв',
                    study: 'Обучение',
                    admin: 'Административный',
                    lunch: 'Обед',
                },
                inputPlaceholder: 'Выберите опцию',
                showCancelButton: true,
            });
            if (!reason) return;
            socket.emit('change_stat_fs', {
                fs_server: fsServer,
                sip_login: sipLogin,
                room_id: roomId,
                worker: sipLogin,
                session_key: sessionKey,
                action: 'pause',
                reason,
                page: 'online',
            });
        }
    };

    const handleLogoutFs = () => {
        socket.emit('change_stat_fs', {
            fs_server: fsServer,
            sip_login: sipLogin,
            room_id: roomId,
            worker: sipLogin,
            session_key: sessionKey,
            action: 'logout',
            page: 'online',
        });
    };

    const handleStatusesVis = () => setShowStatuses(prev => !prev);
    const handleScriptLook = async () => {
        if(showScriptPanel) {
            setShowScriptPanel(false)
        } else {
            const { value: scriptName } = await Swal.fire({
                title: 'Введите название скрипта для тестирования',
                input: 'text',
                inputPlaceholder: 'Название скрипта',
                showCancelButton: true,
            });

            if (scriptName) {
                // Эмитим событие "start_script" с дополнительными параметрами, чтобы сервер понял, что это тестовый запуск
                socket.emit('script_operations', {
                    worker,
                    sip_login: sipLogin,
                    session_key: sessionKey,
                    room_id: roomId,
                    fs_server: fsServer,
                    action: 'start_script',
                    init_mode: 'find',
                    direction: 'look',
                    project_name: scriptName,
                });
                setShowScriptPanel(true)
            }
        }
    };

    // Маппинги статусов для отображения
    const statusMapping: { [key: string]: { text: string; color: string } } = {
        'Available': { text: 'На линии', color: '#0BB918' },
        'Available (On Demand)': { text: 'На линии', color: '#0BB918' },
        'Logged Out': { text: 'Выключен', color: '#f33333' },
        'On Break': { text: 'Перерыв', color: '#cba200' },
        'Post': { text: 'Постобработка', color: '#cba200' },
    };
    const sofiaMapping: { [key: string]: { text: string; color: string } } = {
        'Registered': { text: 'Авторизован', color: '#0BB918' },
        'Unregistered': { text: 'Выключен', color: '#f33333' },
    };

    const getSofiaStatus = (status: string) => {
        return status.includes('Unregistered')
            ? sofiaMapping['Unregistered']
            : sofiaMapping['Registered'];
    };

    const currentSofia =
        fsStatus && fsStatus.sofia_status
            ? getSofiaStatus(fsStatus.sofia_status)
            : { text: 'Обновляется', color: '#cba200' };

    const callStatusMapped =
        fsStatus && fsStatus.status
            ? post
                ? statusMapping["Post"]
                : statusMapping[fsStatus.status] || { text: fsStatus.status, color: '#cba200' }
            : { text: 'Обновляется', color: '#cba200' };

    const postColor = statusMapping['Post'].color;

// вычисляем, что показывать и каким цветом
    const displayStatusText = hasActiveCall
        ? `Активный вызов (${callTimer})`
        : (post
                ? statusMapping['Post'].text
                : callStatusMapped.text
        );

    const displayStatusColor = hasActiveCall
        ? postColor
        : callStatusMapped.color;

    const userStatuses      = useSelector((state: RootState) => state.operator.userStatuses);

    const renderColleagueCards = () => {
        const allEntries = Object.entries(monitorUsers);

        // 1. Поиск
        let filtered = allEntries.filter(([login, user]: [string, any]) =>
            login.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase()))
        );

        // 2. Тип
        if (typeFilter === 'operators') {
            filtered = filtered.filter(([_, u]) => u.post_obrabotka !== false);
        } else if (typeFilter === 'robots') {
            filtered = filtered.filter(([_, u]) => u.post_obrabotka === false);
        }

        // 3. Онлайн/оффлайн
        if (statusFilter !== 'all') {
            filtered = filtered.filter(([login, user]) => {
                // берём реальный SIP-ключ
                const sipKey = user.sip_login || login;

                const statusObj = userStatuses.statuses[sipKey] || {};
                // приводим к boolean
                const isOnline = statusObj.sofia_status?.includes('Registered');
                const online = statusFilter === "online" ? isOnline : !isOnline
                return online

            });
        }


        // Разделяем на группы
        const liveOperators = filtered.filter(([_, u]) => u.post_obrabotka !== false);
        const robots        = filtered.filter(([_, u]) => u.post_obrabotka === false);

        const renderGroup = (entries: [string, any][]) =>
            entries.map(([login, user]) => {
                // 1) Получаем статус для этого логина
                const statusObj = userStatuses.statuses[login] || {};
                const { sofia_status, status: fsStatus, state: fsState } = statusObj;
                // 2) Вычисляем Sofía-статус
                const sofiaText  = sofia_status?.includes('Registered') ? 'Авторизован' : 'Выключен';
                const sofiaColor = sofia_status?.includes('Registered') ? '#0BB918' : '#f33333';

                // 3) Вычисляем FS-статус
                let fsText  = fsStatus || 'Обновляется';
                let fsColor = '#cba200';
                if (fsStatus === 'Logged Out') {
                    fsText  = 'Выключен';
                    fsColor = '#f33333';
                } else if (fsState === 'In a queue call' && fsStatus?.includes('Available')) {
                    fsText  = 'Активный вызов';
                    fsColor = '#cba200';
                } else if (fsStatus?.includes('Available') && fsState === 'Idle') {
                    fsText  = 'Постобработка';
                    fsColor = '#cba200';
                } else if (fsStatus?.includes('Available') && fsState === 'Waiting') {
                    fsText  = 'На линии';
                    fsColor = '#0BB918';
                } else if (fsStatus === "On Break") {
                    fsText  = 'Перерыв';
                    fsColor = '#cba200';
                }

                // 4) «Готов», если Available + Idle
                const ready = fsStatus?.includes('Available') && fsState === 'Waiting';

                // 5) Проекты пользователя
                const projectKeys  = monitorCallcenter[login] || [];
                const projectNames = projectKeys.map(key => monitorProjects[key] || key);

                return (
                    <div key={login} className="col-sm-6 col-md-4 col-lg-3 mb-3">
                        <div className="card h-100">
                            <div className="card-body">
                                <h6 className="card-title">{user.name} ({login})</h6>

                                <p className="mb-1" style={{ color: sofiaColor }}>
                                    {sofiaText}
                                </p>

                                {/* FS-статус */}
                                <p className="mb-2" style={{ color: fsColor }}>
                                    {fsText}
                                </p>
                                {ready && (
                                    <span
                                        style={{ color: fsColor }}
                                    >
                                        Готов
                                    </span>
                                )}
                                <div className="d-flex flex-wrap">

                                    {projectNames.length ? (projectNames.map(prj => (
                                        <span
                                            key={prj}
                                            className=" mb-1 mr-1 px-2 py-1 rounded text-primary"
                                            style={{border:"1px  solid"}}
                                        >
                                            {prj}
                                        </span>
                                    ))) : "Проекты не назначены"}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            });

        return (
            <div>
                <div>
                    <h6>Операторы</h6>
                    {liveOperators.length > 0
                        ? <div className="row">{renderGroup(liveOperators)}</div>
                        : <p>Нет операторов</p>
                    }
                </div>
                <hr />
                <div>
                    <h6>Роботы</h6>
                    {robots.length > 0
                        ? <div className="row">{renderGroup(robots)}</div>
                        : <p>Нет роботов</p>
                    }
                </div>
            </div>
        );
    };

    const renderButtons = () => {
        if (!fsStatus || !fsStatus.status) return null;
        const currentStatus = fsStatus.status;
        return (
            <>
                {post && (
                    <button
                        name="online"
                        id="post_stop"
                        className="btn btn-outline-success mx-1 ml-2"
                        onClick={handlePostStop}
                    >
                        Закончить обработку
                    </button>
                )}
                {currentStatus === 'Logged Out' && (
                    <button
                        name="online"
                        id="online"
                        className="btn btn-outline-success mx-1 ml-2"
                        onClick={() => handleStartFs('manual_start')}
                    >
                        Выйти на линию
                    </button>
                )}
                {currentStatus !== 'Logged Out' && (
                    <>
                        <button
                            name="pause_calls"
                            id="pause"
                            className="btn btn-outline-warning mx-1 ml-2"
                            onClick={handlePauseFs}
                        >
                            {fsStatus.status === "On Break" ? "Закончить перерыв" : "Перерыв"}
                        </button>
                        <button
                            name="logout_calls"
                            id="logout"
                            className="btn btn-outline-danger mx-1 ml-2"
                            onClick={handleLogoutFs}
                        >
                            Закончить смену
                        </button>
                    </>
                )}
                <button
                    name="statuses_vis"
                    id="statuses"
                    className="btn btn-outline-light text text-dark mx-1 ml-2"
                    onClick={handleStatusesVis}
                >
                    Кто онлайн?
                </button>
                <button
                    name="script_look"
                    id="script_look"
                    className="btn btn-outline-light text text-dark mx-1 ml-2"
                    onClick={handleScriptLook}
                >
                    Скрипты
                </button>
            </>
        );
    };

    return (
        <div className="row col-12 pr-0" style={{ marginLeft: 0 }}>
            <div className="card col ml-3">
                <div className="card-body" id="glagol_play_text">
                    <div className="row col-12 pr-0" id="status_user">
                        <div className="mt-0 mb-0 mr-3">
                            <div className="row ml-0 pl-0">
                                <p
                                    id="status"
                                    className="font-weight-bold mb-1 text"
                                    style={{ color: displayStatusColor  }}
                                >
                                    {displayStatusText}
                                </p>
                            </div>
                            <p
                                id="sofia_status"
                                className="font-weight-bold mt-0 mb-0 text"
                                style={{ color: currentSofia.color }}
                            >
                                {currentSofia.text}
                            </p>
                        </div>
                        {renderButtons()}
                    </div>
                </div>
            </div>
            <div id="start_section" className="card ml-3 mr-0">
                <div className="card-body pr-0" id="glagol_actions">
                    <div className="row col-12 pr-0" id="start_inner">
                        <input
                            type="text"
                            className="form-control col input mb-0 mr-2"
                            style={{ height: '40px' }}
                            placeholder="Номер для вызова"
                            value={phone}
                            onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                        />
                        <button
                            name="start_calls"
                            id="start_call"
                            className="btn btn-outline-success mx-1 ml-2"
                            title="Вызов по введенному номеру телефона"
                            onClick={handleCallByNumber}
                        >
                            <i className="align-middle mr-1 fas fa-fw fa-address-book"></i>
                            <span className="align-middle" id="vizov_btn">{"Вызов по номеру"}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="card ml-3 mr-0">
                <div className="card-body mt-0">
                    <div className="row col-12 my-0 py-0 mx-0 pr-0 pl-0" id="ver_place">
                        <p className="mt-0 mb-1">Вер. {fsStatus?.version || '1.1.00'}</p>
                    </div>
                    <div className="row col-12 pr-0">
                        <a data-name="sharp_stop" id="exit" className="btn btn-outline-danger mr-3" href="/worker_main/">
                            Назад
                        </a>
                    </div>
                </div>
            </div>

            {showStatuses && (
                <div id="active_sips" className="row col-12 pr-0 py-2">

                    <div className="card col-12 mx-3 pl-0">
                        <div className="card-header mt-0">
                            <h5 style={{ marginRight: '20px', whiteSpace: 'nowrap' }}>Список коллег онлайн</h5>
                            <div className="d-flex align-items-center">
                                <div style={{ width: '220px', marginRight: '15px' }}>
                                    <label style={{ whiteSpace: 'nowrap' }}>Поиск</label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Поиск оператора/робота"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{ width: '220px' }}
                                    />
                                </div>
                                <div style={{ width: '220px', marginRight: '15px' }}>
                                    <label style={{ whiteSpace: 'nowrap' }}>Тип</label>
                                    <select
                                        className="form-control"
                                        value={typeFilter}
                                        onChange={(e) => setTypeFilter(e.target.value as 'all' | 'operators' | 'robots')}
                                        style={{ width: '220px' }}
                                    >
                                        <option value="all">Все</option>
                                        <option value="operators">Операторы</option>
                                        <option value="robots">Роботы</option>
                                    </select>
                                </div>
                                <div style={{ width: '220px' }}>
                                    <label style={{ whiteSpace: 'nowrap' }}>Статус</label>
                                    <select
                                        className="form-control"
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'online' | 'offline')}
                                        style={{ width: '220px' }}
                                    >
                                        <option value="all">Все</option>
                                        <option value="online">Онлайн</option>
                                        <option value="offline">Оффлайн</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="card-body mt-0" style={{ maxHeight: "400px", overflowY: "auto" }}>
                            {renderColleagueCards()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HeaderPanel;
