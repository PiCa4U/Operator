// src/components/statusPanel/index.tsx
import React, { useEffect, useState } from 'react';
import { socket } from '../../socket';

interface UserStatus {
    login: string;
    name: string;
    status: string;      // например: "На линии", "Перерыв", "Выключен" и т.д.
    sofia_status: string; // например: "Registered", "Unregistered"
    // Добавьте и другие поля, если необходимо (например, проекты и т.п.)
}

const StatusPanel: React.FC = () => {
    // Локальное состояние для хранения статусов коллег.
    const [statuses, setStatuses] = useState<Record<string, UserStatus>>({});
    const [searchTerm, setSearchTerm] = useState('');

    // Подписываемся на событие получения данных о статусах (например, 'other_users')
    useEffect(() => {
        const handleOtherUsers = (data: { statuses: Record<string, UserStatus> }) => {
            setStatuses(data.statuses);
        };

        socket.on('other_users', handleOtherUsers);

        return () => {
            socket.off('other_users', handleOtherUsers);
        };
    }, []);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value.toLowerCase());
    };

    // Фильтруем пользователей по введённому значению
    const filteredStatuses = Object.values(statuses).filter((user) => {
        return (
            user.name.toLowerCase().includes(searchTerm) ||
            user.login.toLowerCase().includes(searchTerm)
        );
    });

    return (
        <div id="active_sips" className="row col-12 pr-0 py-2" style={{ marginLeft: 0 }}>
            <div className="card col-12 ml-3 pl-0">
                <div className="card-header mt-0">
                    <div className="row col-12">
                        <div id="monitor_group" className="input-group input-group col-11 ml2 my-3 pb-0">
                            <div
                                className="input-group-prepend ml-0 pt-0 pb-0"
                                style={{ height: '36px' }}
                            >
                                <span className="input-group-text mb-0">
                                  <i className="align-middle fas fa-fw fa-search"></i>
                                </span>
                            </div>
                            <input
                                type="text"
                                className="form-control col-5 input mb-0"
                                style={{ height: '36px' }}
                                placeholder="НАЙТИ ПОЛЬЗОВАТЕЛЕЙ"
                                id="search_param"
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                        </div>
                    </div>
                </div>
                <div className="card-body mt-0">
                    <div id="connection_lines" className="row col-12 pr-0 py-2">
                        {filteredStatuses.length === 0 ? (
                            <p>Нет пользователей</p>
                        ) : (
                            filteredStatuses.map((user) => (
                                <div
                                    key={user.login}
                                    id={`status_row_${user.login}`}
                                    className="row border rounded my-1 ml-2 mr-2 px-2 py-1"
                                >
                                    <div
                                        id={`sip_place_${user.login}`}
                                        className="row border-right mr-2 pr-2 pl-1 my-1"
                                    >
                                        <p
                                            className="font-weight-bold mb-2"
                                            style={{ marginTop: '5px' }}
                                        >
                                            {user.name} ({user.login})
                                        </p>
                                    </div>
                                    <div
                                        id={`sofia_status_place_${user.login}`}
                                        className="row border-right mr-2 pr-2 pl-1 my-1"
                                    >
                                        <p
                                            className="ml-2 mb-2"
                                            style={{ marginTop: '5px' }}
                                        >
                                            {user.sofia_status}
                                        </p>
                                    </div>
                                    <div
                                        id={`status_place_${user.login}`}
                                        className="row border-right mr-2 pr-2 pl-1 my-1"
                                    >
                                        <p
                                            className="ml-2 mb-2"
                                            style={{ marginTop: '5px' }}
                                        >
                                            {user.status}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatusPanel;
