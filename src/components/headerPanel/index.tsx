import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import { RootState } from '../../redux/store';
import { socket } from '../../socket';
import {getCookies, parseMonitorData} from '../../utils';
import {selectMyProjects, selectProjectPool, setMonitorData} from "../../redux/operatorSlice";

interface HeaderPanelProps {
    onScriptToggle: () => void
}
const HeaderPanel: React.FC<HeaderPanelProps> = ({onScriptToggle}) => {
    const sessionKey = getCookies('session_key') || '';
    const sipLogin = getCookies('sip_login') || '';
    const fsServer = getCookies('fs_server') || '';
    const worker = getCookies('worker') || '';
    const roomId = useSelector((state: RootState) => state.room.roomId) || 'default_room';

    const dispatch = useDispatch();
    const {
        monitorUsers,
        monitorProjects,
        allProjects,
        monitorCallcenter,
    } = useSelector((state: RootState) => state.operator.monitorData);

    const myCallCenter = monitorCallcenter[sipLogin]?.[0];
    console.log("myCallCenter: ", myCallCenter)
    const projectPool = useSelector((state: RootState) => selectProjectPool(state, sipLogin));
    console.log("projectPool: ", projectPool)


    const fsStatus = useSelector((state: RootState) => state.operator.fsStatus);
    const operatorName = useSelector((state: RootState) => state.operator.name) || 'Имя оператора';

    const [showStatuses, setShowStatuses] = useState(false);
    const [phone, setPhone] = useState('');
    // Выбранная линия для вызова (prefix)
    const [outExtension, setOutExtension] = useState('');
    // Дополнительные данные для вызова (base fields)
    const [outBaseFields, setOutBaseFields] = useState<any>({});
    // Флаг, что оператор уже участвует в вызове (для определения режима вызова)
    const [callActive, setCallActive] = useState<boolean>(false);
    // Тип вызова: 'call' (обычный) или 'redirect' (если оператор уже в вызове)
    const [callType, setCallType] = useState<'call' | 'redirect'>('call');
    // Уникальный идентификатор активного вызова (если есть)
    const [activeCallUuid, setActiveCallUuid] = useState<string>('');
    // Текущее время для блока time_place
    const [currentTime, setCurrentTime] = useState(new Date());


    const [outActivePhone, setOutActivePhone] = useState(null);
    const [outActiveProjectName, setOutActiveProjectName] = useState('');
    const [outActiveStartType, setOutActiveStartType] = useState('');
    const [outActiveStart, setOutActiveStart] = useState('');
    const [outActiveTakenReason, setOutActiveTakenReason] = useState('');
    const [outExtensions, setOutExtensions] = useState<any[]>([]);
    const [assignedKey, setAssignedKey] = useState('');
    const [outPreparation, setOutPreparation] = useState(false);

    useEffect(() => {
        console.log("outExtensions: ", outExtensions)
    },[outExtensions])
    const outProjectClickToCall = () => {
        console.log("outProjectClickToCall вызвана");
    };

    const changeStateFs = (state:any, reason:any) => {
        console.log("changeStateFs", state, reason);
    };

    const statusMapping: { [key: string]: { text: string, color: string } } = {
        'Available': { text: 'На линии', color: '#0BB918' },
        'Available (On Demand)': { text: 'На линии', color: '#0BB918' },
        'Logged Out': { text: 'Выключен', color: '#f33333' },
        'On Break': { text: 'Перерыв', color: '#cba200' },
        'Post': { text: 'Постобработка', color: '#cba200' },
    };
    const sofiaMapping: { [key: string]: { text: string, color: string } } = {
        'Registered': { text: 'Авторизован', color: '#0BB918' },
        'Unregistered': { text: 'Выключен', color: '#f33333' },
    };

    const getSofiaStatus = (status: string) => {
        return status.includes('Unregistered')
            ? sofiaMapping['Unregistered']
            : sofiaMapping['Registered'];
    };

// Если fsStatus.sofia_status приходит с доп. информацией, передаем её напрямую:
    const currentSofia =
        fsStatus && fsStatus.sofia_status
            ? getSofiaStatus(fsStatus.sofia_status)
            : { text: 'Обновляется', color: '#cba200' };
    // Определяем текст и цвет для статуса вызов-центра и SIP‑регистрации
    const callStatus = fsStatus && fsStatus.status ? (statusMapping[fsStatus.status] || { text: fsStatus.status, color: '#cba200' }) : { text: 'Обновляется', color: '#cba200' };
    useEffect(() => {
        const handleGetPhoneToCall = (msg:any) => {
            // Сохраняем полученные данные в стейт
            setOutActivePhone(msg.phone);
            setOutActiveProjectName(msg.project_name);
            setOutActiveStartType(msg.start_type);
            setOutActiveStart(msg.start);
            setOutActiveTakenReason(msg.taken_reason);
            setOutExtensions(msg.out_extensions);
            setAssignedKey(msg.assigned_key);
            setOutPreparation(true);

            if (msg.start_type === 'manual') {
                // Если вызов назначен вручную – показываем модальное окно с подтверждением
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
                        outProjectClickToCall();
                        socket.emit('outbound_calls', {
                            worker: worker,
                            sip_login: sipLogin,
                            session_key: sessionKey,
                            room_id: roomId,
                            fs_server: fsServer,
                            project_pool: projectPool,
                            action: 'update_phone_to_call',
                            assigned_key: msg.assigned_key,
                            log_status: 'taken',
                            phone_status: 'taken',
                            special_key: msg.phone?.special_key,
                            project_name: msg.project_name,
                        });
                    } else {
                        changeStateFs('waiting', 'outbound_reject');
                        setOutPreparation(false);
                        socket.emit('outbound_calls', {
                            worker: worker,
                            sip_login: sipLogin,
                            session_key: sessionKey,
                            room_id: roomId,
                            fs_server: fsServer,
                            project_pool: projectPool,
                            action: 'update_phone_to_call',
                            assigned_key: msg.assigned_key,
                            log_status: 'reject',
                            phone_status: msg.phone?.status,
                            special_key: msg.phone?.special_key,
                            project_name: msg.project_name,
                        });
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
                    outProjectClickToCall();
                    socket.emit('outbound_calls', {
                        worker: worker,
                        sip_login: sipLogin,
                        session_key: sessionKey,
                        room_id: roomId,
                        fs_server: fsServer,
                        project_pool: projectPool,
                        action: 'update_phone_to_call',
                        assigned_key: msg.assigned_key,
                        log_status: 'taken',
                        phone_status: 'taken',
                        special_key: msg.phone?.special_key,
                        project_name: msg.project_name,
                    });
                });
            }
        };

        socket.on('get_phone_to_call', handleGetPhoneToCall);
        return () => {
            socket.off('get_phone_to_call', handleGetPhoneToCall);
        };
    }, [
        allProjects,
        worker,
        sipLogin,
        sessionKey,
        roomId,
        fsServer,
        projectPool,
    ]);
    useEffect(() => {
        take()
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        socket.on('fs_status', (data: any) => {
            console.log('Получили fs_status:', data);
        });

        socket.on('monitor_projects', (data: any) => {
            console.log('Получены данные monitor_projects:', data);
            const parsedData = parseMonitorData(data);
            console.log("parsedData: ", parsedData)
            dispatch(setMonitorData(parsedData));
        });
        return () => {
            socket.off('monitor_projects')
            // socket.off('fs_status');
            socket.off('assigned_out_extensions');
        };

    }, [dispatch]);

    const s_dot = worker.indexOf('.')
    const s_login = worker.slice(s_dot+1)

    const take = () => {
        socket.emit('monitor_fs', {'login': s_login, 'room_id': roomId, 'fs_server': fsServer, 'action': 'get_projects'});
    }
    // Обработчик для вызова по номеру
    const handleCallByNumber = () => {
        console.log('outExtensions:', outExtensions);
        // Сброс значений перед началом
        setOutExtension('');
        setOutBaseFields({});

        // Если есть назначенные линии – выбираем первую
        let selectedExtension = '';
        if (myCallCenter) {
            selectedExtension = myCallCenter;
            setOutExtension(selectedExtension);
        }

        // Если оператор уже в вызове, переключаем тип на 'redirect'
        if (callActive) {
            setCallType('redirect');
            console.log('Режим вызова: redirect');
        } else {
            setCallType('call');
        }

        // Если линия назначена или режим redirect – отправляем запрос
        if ((selectedExtension && selectedExtension !== '') || callType === 'redirect') {
            if (callType === 'redirect') {
                socket.emit('click_to_call', {
                    worker,
                    sip_login: sipLogin,
                    session_key: sessionKey,
                    room_id: roomId,
                    fs_server: fsServer,
                    phone: phone,
                    out_extension: selectedExtension,
                    call_type: callType,
                    uuid: activeCallUuid,
                });
            } else {
                socket.emit('click_to_call', {
                    worker,
                    sip_login: sipLogin,
                    session_key: sessionKey,
                    room_id: roomId,
                    fs_server: fsServer,
                    phone: phone,
                    out_extension: selectedExtension,
                    call_type: callType,
                });
            }
        } else {
            Swal.fire({
                title: "Вам не назначена линия для исходящих вызовов",
                text: 'Обратитесь к администратору',
                icon: "error",
            });
        }
    };

    const handlePostStop = () => {
        console.log('Нажали "Закончить обработку"');
        socket.emit('change_stat_fs', {
            fs_server: fsServer,
            sip_login: sipLogin,
            room_id: roomId,
            worker,
            session_key: sessionKey,
            action: 'post_stop',
            page: 'online',
        });
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
            state: "waiting",
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
        // socket_click.emit('change_state_fs', {
        //     'fs_server':fs_server,
        //     'sip_login':sip_login,
        //     'room_id':room_id,
        //     'worker':login,
        //     'session_key':session_key,
        //     'state':state,
        //     'reason':reason,
        //     'page':'online'})

        // socket_click.emit('change_stat_fs', {
        //     'fs_server':fs_server,
        //     'sip_login':sip_login,
        //     'room_id':room_id,
        //     'worker':login,
        //     'session_key':session_key,
        //     'action':'available',
        //     'page':'online',
        //     'reason':reason_fs,
        //     'idle_set':idle_set
        // })

    };

    // const start = (state: string, reason: string) => {
    //     console.log('Нажали "Выйти на линию"');
    //     socket.emit('change_stat_fs', {
    //         fs_server: fsServer,
    //         sip_login: sipLogin,
    //         room_id: roomId,
    //         worker,
    //         session_key: sessionKey,
    //         action: 'available',
    //         state,
    //         reason,
    //         page: 'online',
    //     });
    // }
    const handlePauseFs = async () => {
        console.log('Нажали "Перерыв"');
        const { value:  reason } = await Swal.fire({
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
    };

    const handleLogoutFs = () => {
        console.log('Нажали "Закончить смену"');
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

    const handleStatusesVis = () => {
        console.log('Нажали "Кто онлайн?"');
        setShowStatuses(prev => !prev);
    };

    const handleScriptLook = () => {
        onScriptToggle()
    };

    const renderButtons = () => {
        if (!fsStatus || !fsStatus.status) return null;
        const currentStatus = fsStatus.status;
        return (
            <>
                {(currentStatus === 'Post' || currentStatus.includes('Available')) && (
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
                            Перерыв
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
                                <p id="status" className={`font-weight-bold mb-1 text`} style={{color: `${callStatus.color}`}}>
                                    {callStatus.text}
                                </p>
                            </div>
                            <p id="sofia_status" className={`font-weight-bold mt-0 mb-0 text`} style={{color: `${currentSofia.color}`}}>
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
                            <span className="align-middle" id="vizov_btn">Вызов по номеру</span>
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
                <div id="active_sips" className="row col-12 pr-0 py-2" style={{ marginLeft: 0 }}>
                    <div className="card col-12 ml-3 pl-0">
                        <div className="card-header mt-0">
                            <h5>Список коллег онлайн</h5>
                        </div>
                        <div className="card-body mt-0">
                            {/* Здесь можно отрисовать компонент StatusPanel */}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HeaderPanel;
