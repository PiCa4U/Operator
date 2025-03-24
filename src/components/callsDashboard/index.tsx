import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import "./picker.css"
import { RootState } from '../../redux/store';
import { socket } from '../../socket';
import { getCookies } from '../../utils';

function useDebounce<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}

function getDisplayNumber(call: any): string {
    if (call.direction === 'outbound') {
        return call.destination_id || call.caller_id || '—';
    } else {
        return call.caller_id || call.destination_id || '—';
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

const CallsDashboard: React.FC = () => {
    const sessionKey = getCookies('session_key') || '';
    const sipLogin   = getCookies('sip_login')   || '';
    const fsServer   = getCookies('fs_server')   || '';
    const worker     = getCookies('worker')      || '';

    const roomId   = useSelector((state: RootState) => state.room.roomId) || 'default_room';
    const fsReport = useSelector((state: RootState) => state.operator.fsReport);

    // Значения для инпутов
    const [startDate, setStartDate] = useState<Date | null>(new Date());
    const [endDate,   setEndDate]   = useState<Date | null>(null);
    const [phoneSearch, setPhoneSearch] = useState('');

    // Пагинация
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages,  setTotalPages]  = useState(1);

    const [callsToFill,  setCallsToFill]  = useState<any[]>([]);
    const [callsFilled,  setCallsFilled]  = useState<any[]>([]);
    const [isLoading,    setIsLoading]    = useState(false);

    // Новый стейт для хранения параметров поиска, обновляемых по нажатию "Найти"
    const [searchParams, setSearchParams] = useState({
        start: startDate,
        end: endDate,
        phone: phoneSearch,
    });

    useEffect(() => {
        function handleFsCount(msg: { count: number }) {
            setTotalPages(Math.ceil(msg.count / 10));
        }
        socket.on('fs_count', handleFsCount);
        return () => {
            socket.off('fs_count', handleFsCount);
        };
    }, []);

    // Эффект срабатывает только при изменении параметров поиска или текущей страницы
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
            room_id: roomId,
            fs_server: fsServer,
            level: (currentPage - 1) * 10,
            date_range: dateRangeString,
            phone_search: searchParams.phone,
        });
    }, [searchParams, currentPage, worker, sessionKey, sipLogin, roomId, fsServer]);

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
        const newStart = new Date();
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

    // При клике на вызов
    const showCallEdit = (callId: number, isFilled: boolean) => {
        console.log('Показать форму для вызова', callId, 'Заполнен?', isFilled);
        // Открыть модалку/панель
    };

    // Обработчик изменения диапазона дат в react-datepicker
    const handleDateChange = (dates: [Date | null, Date | null]) => {
        const [start, end] = dates;
        setStartDate(start);
        setEndDate(end);
    };

    return (
        <div
            id="report_place"
            className="row  pl-0 pr-3 mr-2 py-1"
            style={{ marginLeft: 0, justifyContent: 'start' }}
        >
            <div id="search_row" className="row col-12 mb-3">
                <div className="ml-3" style={{ width: '250px' }}>
                    <DatePicker
                        selected={startDate}
                        className="my-date-picker-input"
                        onChange={handleDateChange}
                        startDate={startDate}
                        endDate={endDate}
                        selectsRange
                    />
                </div>
                <input
                    id="phone_search"
                    style={{ width: '250px' }}
                    className="form-control ml-3"
                    placeholder="Номер для поиска"
                    value={phoneSearch}
                    onChange={(e) => setPhoneSearch(e.target.value)}
                />
                <button
                    id="search_click"
                    className="btn btn-outline-success ml-3"
                    style={{ height: '40px' }}
                    onClick={handleSearchClick}
                >
                    Найти
                </button>
                <button
                    id="cancel_click"
                    className="btn btn-outline-warning ml-3 text text-dark"
                    style={{ height: '40px' }}
                    onClick={handleShowAll}
                >
                    Показать все
                </button>
                <div className="col" />
            </div>
            <div id="pg_row" className="row col-12">
                <div className="col"></div>
                <div id="paginator" className="row">
                    <button
                        className="btn btn-light mr-2"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                    >
                        &lt;
                    </button>
                    <p style={{ marginTop: '5px' }}>
                        {currentPage} из {totalPages}
                    </p>
                    <button
                        className="btn btn-light ml-2"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                    >
                        &gt;
                    </button>
                </div>
                <div className="col"></div>
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
                                    className="row col-12 border border-danger rounded my-1 ml-2"
                                    style={{ height: '55px', cursor: 'pointer' }}
                                    onClick={() => showCallEdit(call.id, false)}
                                >
                                    <p
                                        className="font-weight-bold mb-2 mt-3 ml-2"
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
                                    className="row col-12 border border-info rounded my-1 ml-2"
                                    style={{ height: '55px', cursor: 'pointer' }}
                                    onClick={() => showCallEdit(call.id, true)}
                                >
                                    <p
                                        className="font-weight-bold mb-2 mt-3 ml-2"
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
