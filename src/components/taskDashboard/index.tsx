import React, { useState, useEffect, useMemo } from 'react';
import Select, { SingleValue } from 'react-select';
import SearchableSelect from '../callControlPanel/components/select/index';
import styles from "./components/checkbox.module.css"
import { makeSelectFullProjectPool } from "../../redux/operatorSlice";
import { useSelector } from "react-redux";
import GroupActionModal from "./components/index";
import { getCookies } from "../../utils";
import Swal from "sweetalert2";
import {socket} from "../../socket";
import {store} from "../../redux/store";

// --- Типы данных ---
interface ColumnCell {
    name: string;
    value: any[];
}
interface ApiRow {
    id_list: number[];
    [columnKey: string]: ColumnCell | number[];
}
interface Action {
    action_name: string;
    action_type: string;
    code_filename: string;
}
interface Preset {
    id: number;
    preset_name: string;
    group_table: string;
    structure: Record<string, { name: string; default: string; render_template: string }>;
    actions: Action[];
    group_by: string[];
}
interface OptionType {
    value: number;
    label: string;
    preset: Preset;
}
// Опции для селекта действий
interface ActionOption {
    value: string;
    label: string;
    action: Action;
}

const ROWS_PER_PAGE = 5;

const PresetSelectorTable: React.FC = () => {
    // --- стейты ---
    const [presets, setPresets] = useState<OptionType[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<OptionType | null>(null);
    const [selectedActionOption, setSelectedActionOption] = useState<ActionOption | null>(null);
    const [tableData, setTableData] = useState<ApiRow[]>([]);
    const [loading, setLoading] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc'|'desc' }|null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    const [modalOpen, setModalOpen] = useState(false);
    const [modalIds, setModalIds] = useState<number[]>([]);
    const [modalAction, setModalAction] = useState<Action | null>(null);

    // --- глобальные зависимости для запросов ---
    const glagolParent = "fs.at.glagol.ai";
    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;
    const role = "admin";
    const projectPool = useSelector(useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]));
    const projectNames = useMemo(() => projectPool.map(p => p.project_name), [projectPool]);

    const { sessionKey } = store.getState().operator

    console.log("projectNames: ", projectNames)
    useEffect(()=> console.log("selectedRows: ", selectedRows))
    // 1) загрузка пресетов
    useEffect(() => {
        (async () => {
            const resp = await fetch('/api/v1/get_preset_list', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ glagol_parent: glagolParent, worker, projects: projectNames, role })
            });
            if (!resp.ok) throw new Error(resp.statusText);
            const data: Preset[] = await resp.json();
            setPresets(data.map(p => ({ value: p.id, label: p.preset_name, preset: p })));
        })();
    }, [glagolParent, worker, role, projectNames]);

    // 2) загрузка строк при выборе пресета
    useEffect(() => {
        if (!selectedPreset) {
            setTableData([]);
            setSelectedActionOption(null);
            return;
        }
        setLoading(true);
        (async () => {
            try {
                const { preset } = selectedPreset;
                const resp = await fetch('/api/v1/get_grouped_phones', {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({
                        glagol_parent: glagolParent,
                        group_table: preset.group_table,
                        filter_by: {
                            project: [
                                "IN",
                                projectNames
                            ]
                        },
                        preset_id: preset.id,
                        role
                    })
                });
                if (!resp.ok) throw new Error(resp.statusText);
                const rows: ApiRow[] = await resp.json();
                setTableData(rows);
                setSelectedActionOption(null);
                setCurrentPage(1);
                setSearchTerm('');
                setSortConfig(null);
                setSelectedRows(new Set());
            } finally {
                setLoading(false);
            }
        })();
    }, [selectedPreset]);

    // Опции для выпадающего списка действий в шапке
    const actionOptions: ActionOption[] = useMemo(() => {
        if (!selectedPreset) return [];
        return selectedPreset.preset.actions.map(act => ({
            value: act.action_name,
            label: act.action_name,
            action: act
        }));
    }, [selectedPreset]);

    // Внутри PresetSelectorTable:
    const handleBulkProcess = () => {
        if (!selectedActionOption) {
            Swal.fire('Ошибка', 'Выберите действие в шапке', 'error');
            return;
        }

        // Собираем отмеченные строки
        const keys = Array.from(selectedRows);
        const rows = processedRows.filter(r => keys.includes(r.id_list.join(',')));

        if (rows.length === 0) {
            Swal.fire('Нечего обрабатывать', 'Отметьте хотя бы одну строку', 'info');
            return;
        }

        // Если выбрана ровно 1 строка — передаём её в handleProcess
        if (rows.length === 1) {
            handleProcess(rows[0]);
            return;
        }

        // Если больше одной строки — групповой режим
        const allIds = rows.flatMap(r => r.id_list);
        setModalIds(allIds);
        setModalAction(selectedActionOption.action);
        setModalOpen(true);
    };

    // обработка нажатия кнопки «Обработать»

    // --- 3) поиск + сортировка + пагинация вычисляются мемоизированно ---
    const processedRows = useMemo(() => {
        if (!selectedPreset) return [];

        // 3.1 фильтрация
        let result = tableData.filter(row => {
            const term = searchTerm.toLowerCase();
            return Object.keys(selectedPreset.preset.structure).some(colKey => {
                const cell = row[colKey] as ColumnCell;
                return cell.value.join(' ').toLowerCase().includes(term);
            });
        });

        // 3.2 сортировка
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                const aCell = (a[sortConfig.key] as ColumnCell).value.join(' ');
                const bCell = (b[sortConfig.key] as ColumnCell).value.join(' ');
                if (aCell < bCell) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aCell > bCell) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [tableData, searchTerm, sortConfig, selectedPreset]);

    // 3.3 разбиваем на страницы
    const totalPages = Math.max(1, Math.ceil(processedRows.length / ROWS_PER_PAGE));
    const paginatedRows = processedRows.slice(
        (currentPage-1)*ROWS_PER_PAGE,
        currentPage*ROWS_PER_PAGE
    );

    // --- обработчики ---
    const toggleSort = (colKey: string) => {
        setSortConfig(prev => {
            if (!prev || prev.key !== colKey) return { key: colKey, direction: 'asc' };
            // если тот же столбец, инвертируем
            return { key: colKey, direction: prev.direction==='asc' ? 'desc' : 'asc' };
        });
    };
    const handleProcess = (row: ApiRow) => {
        if (!selectedActionOption) {
            Swal.fire('Ошибка', 'Выберите действие в шапке', 'error');
            return;
        }
        const act = selectedActionOption.action;

        // Находим колонку «ID заказа»
        const orderColumnKey = Object
            .entries(selectedPreset!.preset.structure)
            .find(([_, cfg]) => cfg.name === 'ID заказа')?.[0];

        // Достаём текст заказа (первый элемент массива)
        let orderIdText = row.id_list[0] + ''; // fallback на первый из id_list
        if (orderColumnKey) {
            const cell = row[orderColumnKey] as ColumnCell;
            orderIdText = cell.value[0] ?? orderIdText;
        }
        // socket.emit("get_modules", {
        //     project_name: "akc24",
        //     session_key: sessionKey,
        //     worker
        // })
        // Всегда показываем одно-строчный диалог (даже если в row.id_list > 1)
        Swal.fire({
            title: `Применить «${act.action_name}» к заказу ${orderIdText}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Выполнить',
        }).then(result => {
            if (result.isConfirmed) {
                // Ваша логика для 1 строки (row.id_list может содержать несколько внутренних ID)
                console.log('Обработка строки с заказом:', orderIdText);
            }
        });
    };

    const toggleSelectAll = () => {
        const allKeys = paginatedRows.map(r => r.id_list.join(','));
        const newSet = new Set(selectedRows);
        const allSelected = allKeys.every(k => newSet.has(k));
        if (allSelected) {
            // снять всё на этой странице
            allKeys.forEach(k => newSet.delete(k));
        } else {
            // отметить всё
            allKeys.forEach(k => newSet.add(k));
        }
        setSelectedRows(newSet);
    };

    const toggleRow = (rowKey: string) => {
        const newSet = new Set(selectedRows);
        if (newSet.has(rowKey)) newSet.delete(rowKey);
        else newSet.add(rowKey);
        setSelectedRows(newSet);
    };

    useEffect(()=> console.log("selectedPreset: ", selectedPreset),[selectedPreset])
    return (
        <div className="card p-4 ml-4">
            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                {/* Пресеты */}
                <div style={{ width: 250 }}>
                    <SearchableSelect
                        value={selectedPreset ? selectedPreset.preset.id : ''}
                        isSearchable
                        onChange={val => {
                            const p = presets.find(x => String(x.preset.id) === val);
                            setSelectedPreset(p || null);
                        }}
                        options={presets.map(p => ({
                            id:   p.value,
                            name: p.label,
                        }))}
                        placeholder="Выберите пресет..."
                    />
                </div>

                {selectedPreset && (
                    <>
                        {/* Поиск */}
                        <div style={{ width: 250 }}>
                            <input
                                type="text"
                                placeholder="Поиск..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="form-control"
                            />
                        </div>

                        {/* Действия */}
                        <div style={{ width: 250 }}>
                            <SearchableSelect
                                value={selectedActionOption ? selectedActionOption.value : ''}
                                onChange={(val: string) => {
                                    const found = actionOptions.find(opt => opt.value === val) ?? null;
                                    setSelectedActionOption(found);
                                }}
                                isSearchable={false}
                                options={actionOptions.map(a => ({
                                    id:   a.value,
                                    name: a.label
                                }))}
                                placeholder="Выберите действие..."
                            />
                        </div>

                        <button
                            className="btn btn-outline-light text text-dark mx-1 ml-2"
                            onClick={handleBulkProcess}
                        >
                            Обработать
                        </button>
                    </>
                )}
            </div>

            {loading && <div>Загрузка данных...</div>}

            {selectedPreset && !loading && (
                <div >
                <div className="d-flex  overflow-y-auto" style={{height: "70vh"}}>
                    {/*<div className="overflow-y-auto" style={{height: "60vh"}}>*/}
                        <table className="w-100 table-auto border-collapse">
                            <thead>
                            <tr>
                                <th className="border p-2 text-center">
                                    <input
                                        type="checkbox"
                                        className={styles.customCheckbox}
                                        checked={
                                            paginatedRows.length > 0 &&
                                            paginatedRows.every(r => selectedRows.has(r.id_list.join(',')))
                                        }
                                        style={{cursor: "pointer"}}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                {Object.entries(selectedPreset.preset.structure)
                                    .sort(([a], [b]) => Number(a) - Number(b))
                                    .map(([colKey, cfg]) => (
                                        <th
                                            key={colKey}
                                            className="border p-2 cursor-pointer select-none"
                                            onClick={() => toggleSort(colKey)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {cfg.name}
                                            {sortConfig?.key === colKey && (
                                                <span className="material-icons ml-1" style={{ fontSize: '18px' }}>
                                                    {sortConfig.direction === 'asc'
                                                        ? 'keyboard_arrow_up'
                                                        : 'keyboard_arrow_down'}
                                                </span>
                                            )}
                                        </th>
                                    ))}
                                <th className="border p-2">Действия</th>
                            </tr>
                            </thead>
                            <tbody>
                            {paginatedRows.map(row => {
                                const key = row.id_list.join(',');
                                return (
                                    <tr key={key}>
                                        <td className="border p-2 text-center">
                                            <input
                                                type="checkbox"
                                                className={styles.customCheckbox}
                                                checked={selectedRows.has(key)}
                                                onChange={() => toggleRow(key)}
                                                style={{cursor: "pointer"}}
                                            />
                                        </td>
                                        {Object.keys(selectedPreset.preset.structure)
                                            .sort((a, b) => Number(a) - Number(b))
                                            .map(colKey => {
                                                const cell = row[colKey] as ColumnCell;
                                                const def = selectedPreset.preset.structure[colKey].default;
                                                return (
                                                    <td key={colKey} className="border p-2 align-top">
                                                        {Array.isArray(cell.value) && cell.value.length > 0 ? (
                                                            cell.value.map((item, idx) => (
                                                                <div key={idx}>{item}</div>
                                                            ))
                                                        ) : (
                                                            def
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        <td className="border p-2 space-x-2">
                                            <button
                                                className="btn btn-outline-light text text-dark mx-1 ml-2"
                                                onClick={() => {
                                                    /* здесь можно открыть деталь row */
                                                    console.log('Открываем', row);
                                                }}
                                            >
                                                Открыть
                                            </button>
                                            {/*<button*/}
                                            {/*    className="btn btn-outline-light text text-dark mx-1 ml-2"*/}
                                            {/*    onClick={() => handleProcess(row)}*/}
                                            {/*>*/}
                                            {/*    Обработать*/}
                                            {/*</button>*/}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    {/*</div>*/}
                </div>
            {/* Пагинация */}
                <div className="mt-4 flex justify-center items-center space-x-2 my-2" style={{position:"absolute", right:"48%", bottom: -50}}>
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="btn btn-outline-light text text-dark mx-1 ml-2"
                        style={{padding: 0}}
                    >
                        <span className="material-icons text-base text-gray-600">keyboard_arrow_left</span>
                    </button>
                    <span className="text-sm text-gray-700 font-weight-bold" style={{fontSize: 16}}>
                        {currentPage} / {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="btn btn-outline-light text text-dark mx-1 "
                        style={{padding: 0}}
                    >
                        <span className="material-icons text-base text-gray-600">keyboard_arrow_right</span>
                    </button>
                </div>
                </div>
            )}

            {!selectedPreset && !loading && <div>Пожалуйста, выберите пресет.</div>}
            {selectedPreset && !loading && processedRows.length === 0 && (
                <div>Нет данных для выбранного пресета.</div>
            )}
            <GroupActionModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                preset={selectedPreset?.preset ?? null}
                action={modalAction!}
                ids={modalIds}
                glagolParent={glagolParent}
                role={role}
                onConfirm={(selectedIds, selectedFilters) => {
                    setModalOpen(false);
                    console.log("confirmed", modalAction, selectedIds, selectedFilters);
                }}
            />
        </div>
    );
};

export default PresetSelectorTable;
