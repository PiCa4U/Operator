import React, {useState, useEffect, useMemo} from 'react';
import { useSelector } from 'react-redux';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import "./picker.css"
import {RootState, store} from '../../redux/store';
import { socket } from '../../socket';
import { getCookies } from '../../utils';
import {CallData} from "../callControlPanel";
import {makeSelectFullProjectPool} from "../../redux/operatorSlice";

function getDisplayNumber(call: any): string {
    if (call.total_direction === 'outbound') {
        return call.b_line_num || call.caller_id || '—';
    } else {
        return call.a_line_num || call.destination_id || call.caller_id || '—';
    }
}

function formatLenTime(lenTime: number): string {
    if (!lenTime || isNaN(lenTime)) return '0 сек.';
    const minutes = Math.floor(lenTime / 60);
    const seconds = Math.round(lenTime - minutes * 60);
    let result = '';
    if (minutes > 0) {
        result += `${minutes} мин. `;
    }
    result += `${seconds} сек.`;
    return result;
}

type CallsDashboardProps = {
    setSelectedCall: (call: CallData) => void
    selectedCall: CallData | null
    currentPage: number
    setCurrentPage: (currentPage: number) => void
    isLoading: boolean
    setIsLoading: (isLoading: boolean) => void
}
const CallsDashboard: React.FC<CallsDashboardProps> = ({isLoading, setIsLoading, setSelectedCall, currentPage, setCurrentPage}) => {
    const { sessionKey } = store.getState().operator

    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;

    const roomId   = useSelector((state: RootState) => state.room.roomId) || 'default_room';
    const [fsReport, setFsReport] = useState<any[]>([])
    // const fsReport = useSelector((state: RootState) => state.operator.fsReport);
    // Значения для инпутов
    const [startDate, setStartDate] = useState<Date | null >(null);
    const [endDate,   setEndDate]   = useState<Date | null>(null);
    const [phoneSearch, setPhoneSearch] = useState('');

    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    const projectPool = useSelector(selectFullProjectPool) || [];

    // Пагинация
    // const [currentPage, setCurrentPage] = useState(1);
    const [totalPages,  setTotalPages]  = useState(1);

    const [callsToFill,  setCallsToFill]  = useState<any[]>([]);
    const [callsFilled,  setCallsFilled]  = useState<any[]>([]);

    const [searchParams, setSearchParams] = useState({
        start: startDate,
        end: endDate,
        phone: phoneSearch,
    });

    // useEffect(() => {
    //     if (!isLoading && !selectedCall) {
    //         const allCalls = [...callsToFill, ...callsFilled];
    //         if (allCalls.length > 0) {
    //             setSelectedCall(allCalls[0]);
    //         }
    //     }
    // }, [isLoading, callsToFill, callsFilled, selectedCall, setSelectedCall]);

    useEffect(()=> {
        const getFsReport = (msg: any) => {
            setFsReport(msg)
        }
        socket.on('fs_report', getFsReport)
        return () => {
            socket.off('fs_report', getFsReport);
        };
    },[])

    useEffect(() => {
        function handleFsCount(msg: { count: number }) {
            setTotalPages(Math.ceil(msg.count / 10));
        }
        socket.on('fs_count', handleFsCount);
        return () => {
            socket.off('fs_count', handleFsCount);
        };
    }, []);

    useEffect(() => {
        let dateRangeString = '';
        if (searchParams.start) {
            const startStr = searchParams.start.toLocaleDateString('ru-RU');
            if (searchParams.end) {
                const endStr = searchParams.end.toLocaleDateString('ru-RU');
                dateRangeString = `${startStr} - ${endStr}`;
            } else {
                dateRangeString = startStr;
            }
        }
        setIsLoading(true);
        socket.emit('get_fs_report', {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            level: (currentPage - 1) * 10,
            date_range: dateRangeString,
            phone_search: searchParams.phone,
        });
    }, [searchParams, currentPage, worker, sessionKey, sipLogin, roomId]);

    useEffect(() => {
        if (!fsReport || !Array.isArray(fsReport)) return;
        const toFill = fsReport.filter(call => !call.call_reason && !call.call_result);
        const filled = fsReport.filter(call => call.call_reason || call.call_result);
        setCallsToFill(toFill);
        setCallsFilled(filled);
        setIsLoading(false);
    }, [fsReport]);

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        setCurrentPage(newPage);
    };

    const handleShowAll = () => {
        const newStart = null
        setPhoneSearch('');
        setStartDate(newStart);
        setEndDate(null);
        setCurrentPage(1);
        setSearchParams({
            start: newStart,
            end: null,
            phone: '',
        });
    };

    const handleSearchClick = () => {
        setSearchParams({
            start: startDate,
            end: endDate,
            phone: phoneSearch,
        });
        setCurrentPage(1);
    };

    const showCallEdit = (callId: number, isFilled: boolean) => {
        const allCalls: CallData[] = [...callsToFill, ...callsFilled];
        const call = allCalls.find(c => c.id === callId);
        if (!call) return;

        let adjustedCall = { ...call };

        if (adjustedCall.total_direction === 'outbound' && typeof adjustedCall.project_name === 'string') {
            const baseName = adjustedCall.project_name.replace(/\s*\(.*\)$/, '');
            const fullName = `${baseName}`;
            const proj = projectPool.find(p => p.project_name === fullName);
            if (proj) {
                adjustedCall.project_name = proj.project_name;
            }
        }

        setSelectedCall(adjustedCall);
    };

    const handleDateChange = (dates: [Date | null, Date | null]) => {
        const [start, end] = dates;
        setStartDate(start);
        setEndDate(end);
    };

    return (
        <div className="container-fluid" style={{ marginLeft: 0 }}>
            {/* Блок с поиском (дата + телефон) и кнопками */}
            <div className="row ml-1 mb-3 align-items-center">
                <div className="col-auto">
                    <DatePicker
                        selected={startDate}
                        onChange={handleDateChange}
                        startDate={startDate}
                        endDate={endDate}
                        selectsRange
                        placeholderText="Выберите период"
                        className="form-control"
                    />
                </div>
                <div className="col-auto">
                    <input
                        id="phone_search"
                        className="form-control"
                        style={{ minWidth: '180px' }}
                        placeholder="Номер для поиска"
                        value={phoneSearch}
                        onChange={(e) => setPhoneSearch(e.target.value)}
                    />
                </div>
                <div className="col-auto">
                    <button
                        id="search_click"
                        className="btn btn-outline-success"
                        onClick={handleSearchClick}
                    >
                        Найти
                    </button>
                </div>
                <div className="col-auto">
                    <button
                        id="cancel_click"
                        className="btn btn-outline-warning text-dark"
                        onClick={handleShowAll}
                    >
                        Показать все
                    </button>
                </div>
                <div className="col" />
            </div>

            <div className="row mb-2">
                <div className="col d-flex justify-content-center align-items-center">
                    <button
                        className="btn btn-light mr-3"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={isLoading || currentPage <= 1}
                    >
                        &lt;
                    </button>
                    <span style={{ minWidth: '90px', textAlign: 'center' }}>
                        {currentPage} из {totalPages}
                    </span>
                    <button
                        className="btn btn-light ml-3"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={isLoading || currentPage >= totalPages}
                    >
                        &gt;
                    </button>
                </div>
            </div>
            <div
                id="calls_to_fill_card"
                className="card col-12 ml-3 mr-4 pt-2 pb-2 mb-2"
            >
                <h5>Незаполненные вызовы</h5>
                <div id="calls_to_fill" className="row col-12 pb-4 pt-2">
                    {isLoading ? (
                        <div className="text-center w-100">
                            <strong>Загрузка...</strong>
                        </div>
                    ) : callsToFill.length === 0 ? (
                        <p>У вас пока нет вызовов в незаполненном статусе.</p>
                    ) : (
                        callsToFill.map((call) => {
                            const phoneNumber = getDisplayNumber(call);
                            const callDuration = formatLenTime(call.len_time);
                            return (
                                <div
                                    key={call.id}
                                    className="row col-12 border border-danger rounded my-1 ml-2 align-items-center"
                                    style={{ height: '55px', cursor: 'pointer' }}
                                    onClick={() => showCallEdit(call.id, false)}
                                >
                                    {call.total_direction === "outbound" ? (
                                        <span className="material-icons" style={{color: "#f26666"}}>
                                            logout
                                        </span>
                                    ) : (
                                        <span className="material-icons" style={{color: "#7cd420"}}>
                                            login
                                        </span>
                                    )}
                                    <p
                                        className="font-weight-bold mb-2 mt-2 ml-2 align-items-center"
                                        style={{ fontSize: '13px' }}
                                    >
                                        {phoneNumber} | {call.datetime_start} | {callDuration}
                                    </p>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            <div
                id="calls_filled_card"
                className="card col-12 ml-3 mr-4 pt-2 pb-2 mb-2"
            >
                <h5>Заполненные вызовы</h5>
                <div id="calls_filled" className="row col-12 pb-4 pt-2">
                    {isLoading ? (
                        <div className="text-center w-100">
                            <strong>Загрузка...</strong>
                        </div>
                    ) : callsFilled.length === 0 ? (
                        <p>У вас пока нет вызовов в заполненном статусе.</p>
                    ) : (
                        callsFilled.map((call) => {
                            const phoneNumber = getDisplayNumber(call);
                            const callDuration = formatLenTime(call.len_time);
                            return (
                                <div
                                    key={call.id}
                                    className="row col-12 border border-info rounded my-1 ml-2 align-items-center"
                                    style={{ height: '55px', cursor: 'pointer' }}
                                    onClick={() => showCallEdit(call.id, true)}
                                >
                                    {call.total_direction === "outbound" ? (
                                        <span className="material-icons" style={{color: "#f26666"}}>
                                            logout
                                        </span>
                                    ) : (
                                        <span className="material-icons" style={{color: "#7cd420"}}>
                                            login
                                        </span>
                                    )}
                                    <p
                                        className="font-weight-bold mb-2 mt-2 ml-2"
                                        style={{ fontSize: '13px' }}
                                    >
                                        {phoneNumber} | {call.datetime_start} | {callDuration}
                                    </p>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            <div id="filler" className="row col" style={{ height: '100%' }}></div>
        </div>
    );
};

export default CallsDashboard;
