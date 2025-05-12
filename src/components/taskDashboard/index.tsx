import React, { useEffect, useState } from 'react';

// Интерфейсы для пресета и записи группировки
interface Preset { id: number; preset_name: string; }
interface GroupRecord { id_list: number[]; [key: string]: any; }

// Моковые пресеты
const mockPresets: Preset[] = [
    { id: 1, preset_name: 'Пресет 1' },
    { id: 2, preset_name: 'Пресет 2' },
];

// Моковые данные для каждого пресета
const mockDataMap: Record<number, GroupRecord[]> = {
    1: [
        {
            id_list: [123, 321, 441],
            "2": { name: 'ФИО клиента', value: ['Иван Иванов'] },
            "3": { name: 'Список задач', value: [
                    'Согласовать дату – согласовано',
                    'Перенести сборку – to_call'
                ] },
            phones: ['79324543344', '79001234567'],
            "4": { name: 'История вызовов', value: [
                    '79324543344 – 2025-03-07 15:50:16',
                    '79324543344 – 2025-03-07 11:57:16'
                ] },
            "5": { name: 'Комментарии', value: [
                    'Клиент попросил перезвонить после 10:00',
                    'Уточнил дату сборки'
                ] }
        }
    ],
    2: [
        {
            id_list: [1002],
            "2": { name: 'ФИО клиента', value: ['Пётр Петров'] },
            "3": { name: 'Список задач', value: [
                    'Исключить товар – согласовано'
                ] },
            phones: ['79234543211'],
            "4": { name: 'История вызовов', value: [
                    '79234543211 – 2025-03-08 09:15:00'
                ] },
            "5": { name: 'Комментарии', value: [
                    'Просил перезвонить завтра вечером'
                ] }
        }
    ]
};

const TasksDashboard: React.FC = () => {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [selected, setSelected] = useState<number>(mockPresets[0].id);
    const [data, setData] = useState<GroupRecord[]>([]);

    // Инициализация пресетов
    useEffect(() => {
        setPresets(mockPresets);
        setSelected(mockPresets[0].id);
    }, []);

    // Обновляем данные при смене пресета
    useEffect(() => {
        setData(mockDataMap[selected] || []);
    }, [selected]);

    return (
        <div className="container py-3">
            {/* Карточка-обёртка */}
            <div className="card shadow-sm mb-4">
                <div className="card-body">
                    {/* Панель управления */}
                    <div className="d-flex align-items-center gap-2 mb-3">
                        <label className="mb-0">Пресет:</label>
                        <select
                            className="form-select form-select-sm w-auto"
                            value={selected}
                            onChange={e => setSelected(Number(e.target.value))}
                        >
                            {presets.map(p => (
                                <option key={p.id} value={p.id}>{p.preset_name}</option>
                            ))}
                        </select>
                        <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => setData(mockDataMap[selected] || [])}
                        >Обновить</button>
                        <button className="btn btn-sm btn-outline-secondary" disabled>Массовые операции</button>
                    </div>

                    {/* Таблица внутри карточки */}
                    <div className="table-responsive">
                        <table className="table table-striped table-bordered mb-0">
                            <thead className="table-light">
                            <tr>
                                <th style={{ width: '1rem' }}><input type="checkbox" /></th>
                                <th>Список ID</th>
                                <th>ФИО клиента</th>
                                <th>Список задач</th>
                                <th>Телефоны</th>
                                <th>История вызовов</th>
                                <th>Комментарии</th>
                                <th>Действия</th>
                            </tr>
                            </thead>
                            <tbody>
                            {data.map((row, idx) => (
                                <tr key={idx}>
                                    <td><input type="checkbox" /></td>
                                    <td>{row.id_list.join(', ')}</td>
                                    <td>{Array.isArray(row['2'].value) ? row['2'].value.join(', ') : row['2'].value}</td>
                                    <td>{Array.isArray(row['3'].value) ? row['3'].value.join('; ') : row['3'].value}</td>
                                    <td>{row.phones.join(', ')}</td>
                                    <td>{Array.isArray(row['4'].value) ? row['4'].value.join('; ') : row['4'].value}</td>
                                    <td>{Array.isArray(row['5'].value) ? row['5'].value.join('; ') : row['5'].value}</td>
                                    <td>
                                        <button className="btn btn-sm btn-primary">Открыть</button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TasksDashboard;
