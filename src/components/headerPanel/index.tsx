import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import { RootState } from '../../redux/store';
import { socket } from '../../socket';
import {getCookies, parseMonitorData} from '../../utils';
import {selectMyProjects, selectProjectPool, setMonitorData} from "../../redux/operatorSlice";

const HeaderPanel: React.FC = () => {
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
    const myProjects = useSelector((state: RootState) => selectMyProjects(state, sipLogin));
    const projectPool = useSelector((state: RootState) => selectProjectPool(state, sipLogin));


    // socket.emit('outbound_calls', {
    //     worker: worker,
    //     sip_login: sipLogin,
    //     session_key: sessionKey,
    //     room_id: roomId,
    //     fs_server: fsServer,
    //     project_pool: projectPool,
    //     action: 'get_phone_to_call'
    // });

    // Получаем статус оператора и имя из Redux
    const fsStatus = useSelector((state: RootState) => state.operator.fsStatus);
    const operatorName = useSelector((state: RootState) => state.operator.name) || 'Имя оператора';

    // Получаем нужные куки и roomId


    // Локальный стейт
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
        // В этой функции реализуйте логику перехода в режим исходящего вызова
        console.log("outProjectClickToCall вызвана");
    };

    const changeStateFs = (state:any, reason:any) => {
        // Здесь можно, например, диспатчить экшен или вызывать socket.emit('change_state_fs', ...)
        console.log("changeStateFs", state, reason);
    };


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
                // Если вызов назначен автоматически – показываем уведомление на 3 секунды
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
    // Обновляем текущее время каждую секунду
    useEffect(() => {
        take()
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Подписка на события сокета для обновления статуса (и, возможно, для получения информации о назначенных линиях)
    useEffect(() => {
        socket.on('fs_status', (data: any) => {
            console.log('Получили fs_status:', data);
            // Здесь можно обновлять Redux или локальный стейт
            // Например: dispatch(setFsStatus(data));
        });
        // Пример получения назначенных линий для исходящих вызовов:

        socket.on('monitor_projects', (data: any) => {
            console.log('Получены данные monitor_projects:', data);
            const parsedData = parseMonitorData(data);
            console.log("parsedData: ", parsedData)
            dispatch(setMonitorData(parsedData));
        });
        return () => {
            socket.off('monitor_projects')
            socket.off('fs_status');
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

    // Обработчики для кнопок в хедере
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

    const handleStartFs = () => {
        console.log('Нажали "Выйти на линию"');
        socket.emit('change_stat_fs', {
            fs_server: fsServer,
            sip_login: sipLogin,
            room_id: roomId,
            worker: sipLogin,
            session_key: sessionKey,
            action: 'available',
            page: 'online',
        });
    };

    const handlePauseFs = async () => {
        console.log('Нажали "Перерыв"');
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
        console.log('Нажали "Скрипты"');
        take()
    };

    // Функция для отрисовки кнопок в зависимости от fsStatus
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
                        onClick={handleStartFs}
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
            {/* Панель статусов */}
            <div className="card col ml-3">
                <div className="card-body" id="glagol_play_text">
                    <div className="row col-12 pr-0" id="status_user">
                        <div className="mt-0 mb-0 mr-3">
                            <div className="row ml-0 pl-0">
                                <p id="status" className="font-weight-bold mb-1">
                                    {fsStatus?.sofia_status || 'Обновляется'}
                                </p>
                                {/* Блок с текущим временем (аналог time_place) */}
                                <div className="row ml-1" style={{ width: '140px' }}>
                                    <p className="font-weight-bold mb-1">
                                        {currentTime.toLocaleTimeString()}
                                    </p>
                                </div>
                            </div>
                            <p id="sofia_status" className="font-weight-bold mt-0 mb-0">
                                {fsStatus?.status || 'Обновляется'}
                            </p>
                        </div>
                        {renderButtons()}
                    </div>
                </div>
            </div>

            {/* Блок ввода номера и кнопка вызова */}
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

            {/* Блок с версией и кнопкой "Назад" */}
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

            {/* Панель со статусами коллег (условный рендер) */}
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
