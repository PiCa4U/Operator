import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { DateRange } from 'react-date-range';
import { addDays } from 'date-fns'; // date-fns, если нужно что-то форматировать дополнительно
import 'react-date-range/dist/styles.css'; // основной стиль
import 'react-date-range/dist/theme/default.css'; // тема

import { RootState } from '../../redux/store';
import { socket } from '../../socket';
import { getCookies } from '../../utils';

// Хук для дебаунса (необязательно, если вы уже его где-то используете)
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
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
    // Пример получения данных из cookies
    const sessionKey = getCookies('session_key') || '';
    const sipLogin = getCookies('sip_login') || '';
    const fsServer = getCookies('fs_server') || '';
    const worker = getCookies('worker') || '';

    // Redux: roomId, fsReport
    const roomId = useSelector((state: RootState) => state.room.roomId) || 'default_room';
    const fsReport = useSelector((state: RootState) => state.operator.fsReport);

    // Состояния
    const [phoneSearch, setPhoneSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Храним диапазон дат в формате, который требует react-date-range:
    // массив из одного объекта с полями startDate, endDate, key
    const [dateRange, setDateRange] = useState([
        {
            startDate: new Date(),         // Начальная дата (по умолчанию — сегодня)
            endDate: addDays(new Date(), 7), // Конечная дата (по умолчанию — +7 дней)
            key: 'selection',             // ключ обязательно "selection"
        },
    ]);

    // Пагинация
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Разделённые списки вызовов
    const [callsToFill, setCallsToFill] = useState<any[]>([]);
    const [callsFilled, setCallsFilled] = useState<any[]>([]);

    // Дебаунсим ввод телефона и сам dateRange
    const debouncedPhone = useDebounce(phoneSearch, 500);
    const debouncedDateRange = useDebounce(dateRange, 500);

    // Подписка на fs_count (для totalPages)
    useEffect(() => {
        const handleFsCount = (msg: { count: number }) => {
            setTotalPages(Math.ceil(msg.count / 10));
        };
        socket.on('fs_count', handleFsCount);

        return () => {
            socket.off('fs_count', handleFsCount);
        };
    }, []);

    // Эффект запроса данных, когда меняются фильтры (dateRange, phone) или страница
    useEffect(() => {
        // Сформируем строку для диапазона дат "DD.MM.YYYY - DD.MM.YYYY"
        const start = debouncedDateRange[0].startDate;
        const end = debouncedDateRange[0].endDate;
        const dateRangeString = `${start.toLocaleDateString('ru-RU')} - ${end.toLocaleDateString('ru-RU')}`;

        setIsLoading(true);

        socket.emit('get_fs_report', {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            room_id: roomId,
            fs_server: fsServer,
            level: (currentPage - 1) * 10,
            date_range: dateRangeString,
            phone_search: debouncedPhone,
        });
    }, [debouncedDateRange, debouncedPhone, currentPage]);

    // Когда fsReport обновляется в Redux, раскладываем данные по спискам
    useEffect(() => {
        if (!fsReport || !Array.isArray(fsReport)) return;
        const toFill = fsReport.filter((call) => !call.call_reason && !call.call_result);
        const filled = fsReport.filter((call) => call.call_reason || call.call_result);
        setCallsToFill(toFill);
        setCallsFilled(filled);
        setIsLoading(false);
    }, [fsReport]);

    // Пагинация
    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        setCurrentPage(newPage);
    };

    // Сброс фильтров
    const handleShowAll = () => {
        setPhoneSearch('');
        // сбрасываем дату на «сегодня - сегодня»
        setDateRange([
            {
                startDate: new Date(),
                endDate: new Date(),
                key: 'selection',
            },
        ]);
        setCurrentPage(1);
    };

    // Нажатие кнопки "Найти" (просто сбрасываем страницу)
    const handleSearchClick = () => {
        setCurrentPage(1);
    };

    // Пример показа формы
    const showCallEdit = (callId: number, isFilled: boolean) => {
        console.log('Показать форму для вызова', callId, 'Заполнен?', isFilled);
    };

    return (
        <div
            id="report_place"
            className="row col-12 pl-0 pr-3 mr-2 py-1"
            style={{ marginLeft: 0, justifyContent: 'start' }}
        >
            {/* Фильтры */}
            <div id="search_row" className="row col-12 mb-3">
                <div className="ml-3" style={{ width: '250px' }}>
                    {/* Компонент выбора диапазона дат */}
                    <DateRange
                        ranges={dateRange}
                        onChange={(item: any) => {
                            // react-date-range при изменении вернёт { selection: { startDate, endDate, key } }
                            // нам нужно обновить dateRange
                            if (item.selection) {
                                setDateRange([item.selection]);
                            }
                        }}
                        moveRangeOnFirstSelection={false}
                        rangeColors={['#3ecf8e']} // цвет выделения (по желанию)
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

            {/* Пагинация */}
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

            {/* Незаполненные вызовы */}
            <div
                id="calls_to_fill_card"
                className="card col-12 ml-3 mr-4 pt-2 pb-2 mb-2"
            >
                <h5>Незаполненные вызовы</h5>
                <div id="calls_to_fill" className="row col-12 pb-0 pt-2">
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

            {/* Заполненные вызовы */}
            <div
                id="calls_filled_card"
                className="card col-12 ml-3 mr-4 pt-2 pb-2 mb-2"
            >
                <h5>Заполненные вызовы</h5>
                <div id="calls_filled" className="row col-12 pb-0 pt-2">
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
