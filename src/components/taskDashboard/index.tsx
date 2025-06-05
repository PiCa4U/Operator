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
export interface ApiRow {
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
    projects: string[];
}
export interface OptionType {
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

export interface ModuleType {
    id:            number;
    project:       string;
    filename:      string;
    common_code:   boolean;
    created_dt:    string;
    [key: string]: any;
}

type Props = {
    openedGroup: any[]
    setOpenedGroup: (openedGroup: any[]) => void
    phonesData: any
    setPhonesData: (phonesData: any) => void
    setGroupIDs: (groupIDs: any[]) => void
    selectedPreset: OptionType | null
    setSelectedPreset: (selectedPreset: OptionType | null) => void
}
const ROWS_PER_PAGE = 10;

const PresetSelectorTable: React.FC<Props> = ({
                                                  openedGroup,
                                                  setOpenedGroup,
                                                  setPhonesData,
                                                  phonesData,
                                                  setGroupIDs,
                                                  selectedPreset,
                                                  setSelectedPreset
                                              }) => {
    const [presets, setPresets] = useState<OptionType[]>([]);
    const [selectedActionOption, setSelectedActionOption] = useState<ActionOption | null>(null);
    const [tableData, setTableData] = useState<ApiRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [idProjectMap, setIdProjectMap] = useState<{ id: number; project_name: string }[]>([]);
    useEffect(()=> console.log("tableData: ", tableData),[tableData])
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc'|'desc' }|null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    const [modalOpen, setModalOpen] = useState(false);
    const [modalIds, setModalIds] = useState<number[]>([]);
    const [modalAction, setModalAction] = useState<Action | null>(null);

    const [modules, setModules] = useState<ModuleType[]>([]);
    useEffect(() => console.log("presetModules: ", modules),[modules])
    // --- глобальные зависимости для запросов ---
    const glagolParent = "fs.at.glagol.ai";
    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;
    const role = "admin";
    const projectPool = useSelector(useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]));
    const projectNames = useMemo(() => projectPool.map(p => p.project_name), [projectPool]);
    // const projectNames = ["group_project_1", "group_project_2"]

    const { sessionKey } = store.getState().operator
    useEffect(() => {
        const list = tableData.map( group => group.id_list )
        setGroupIDs(list)
    },[tableData])
    useEffect(() => {
        const handler = (payload: Record<string, ModuleType[]>) => {
            // Собираем модули в flat-массив
            const allModules = Object.values(payload).flat();

            // Уникализируем по filename (можно по id, если гарантированно одинаков)
            const uniqueMap = new Map<string, ModuleType>();
            allModules.forEach(mod => {
                if (!uniqueMap.has(mod.filename)) {
                    uniqueMap.set(mod.filename, mod);
                }
            });

            setModules(Array.from(uniqueMap.values()));
        };

        socket.on('get_modules', handler);

        socket.emit('get_modules', {
            projects: projectNames,
            session_key: sessionKey,
            worker,
        });

        return () => {
            socket.off('get_modules', handler);
        };
    }, [sessionKey, worker]);

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
    }, [glagolParent, worker, role]);

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
                                preset.projects
                            ]
                        },
                        preset_id: preset.id,
                        role
                    })
                });
                if (!resp.ok) throw new Error(resp.statusText);
                // второй запрос, который отдаёт данные по проектам
                const respProjectIds = await fetch('/api/v1/get_grouped_phones', {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({
                        glagol_parent: glagolParent,
                        group_by: ["project"],
                        filter_by: { project: ['IN', preset.projects] },
                        group_table: preset.group_table,
                        role
                    })
                });
                if (!respProjectIds.ok) throw new Error(respProjectIds.statusText);
                // распарсим JSON вида { akc24: [{id:13,…},…], test_2: [{id:23,…},…] }
                const projectIdData: Record<string, { id: number }[]> = await respProjectIds.json();
                const flatPhones = Object.values(projectIdData).flat();
                setPhonesData(flatPhones);
                console.log("projectIdData: ", projectIdData)
                const flat: { id: number; project_name: string }[] = Object
                    .entries(projectIdData)
                    .flatMap(([project_name, list]) =>
                            list.map(item => ({ id: item.id, project_name }))
                    );
                setIdProjectMap(flat);

                console.log("flat: ", flat)
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
            return Swal.fire('Ошибка', 'Выберите действие в шапке', 'error');
        }

        const keys = Array.from(selectedRows);
        const rows = processedRows.filter(r => keys.includes(r.id_list.join(',')));

        if (rows.length === 0) {
            return Swal.fire('Нечего обрабатывать', 'Отметьте хотя бы одну строку', 'info');
        }

        if (rows.length === 1) {
            // Показываем модалку — поведение как раньше
            setModalIds(rows[0].id_list);
            setModalAction(selectedActionOption.action);
            setModalOpen(true);
            return;
        }

        // Множественная обработка — auto-run
        handleProcessBulk(rows)

        // Swal.fire('Готово', 'Операции отправлены на сервер', 'success');
    };


    const handleProcessBulk = (rows: ApiRow[]) => {
        if (!selectedActionOption) {
            return Swal.fire('Ошибка', 'Выберите действие в шапке', 'error');
        }
        const act = selectedActionOption.action;

        const allIds = rows.flatMap(r => r.id_list);

        const idToProject = idProjectMap.reduce<Record<number, string>>((acc, { id, project_name }) => {
            acc[id] = project_name;
            return acc;
        }, {});
        const groups = allIds.reduce<Record<string, number[]>>((acc, id) => {
            const proj = idToProject[id] || 'unknown';
            if (!acc[proj]) acc[proj] = [];
            acc[proj].push(id);
            return acc;
        }, {});

        if (act.action_type === 'code') {
            const targetName = act.code_filename.replace(/\.py$/, '');
            const foundModule = modules.find(m => m.filename.replace(/\.py$/, '') === targetName);
            if (!foundModule) {
                return Swal.fire('Ошибка', `Модуль "${act.code_filename}" не найден.`, 'error');
            }

            // Явно указываем структуру аргументов
            type KwargDef = { source: string; default?: string };
            const argDefs = Object.values(foundModule.kwargs || {}) as KwargDef[];

            Object.entries(groups).forEach(([project_name, ids]) => {
                ids.forEach(id => {
                    const contact = phonesData.find((p: any) => p.id === id);
                    const contactInfo = contact?.contact_info ?? {};

                    const kwargs: Record<string, string> = {};
                    argDefs.forEach(({ source, default: def }) => {
                        if (!source) return;
                        kwargs[source] = contactInfo[source] ?? def ?? '';
                    });

                    socket.emit('run_module', {
                        uuid:        "",
                        b_uuid:      "",
                        worker,
                        session_key: sessionKey,
                        project_name,
                        filename:    foundModule.filename.replace(/\.py$/, ''),
                        common_code: foundModule.common_code,
                        kwargs:      kwargs,
                    });
                });
            });
        } else if (act.action_type === 'delete') {
            Object.entries(groups).forEach(([project_name, ids]) => {
                console.log('args:', {
                    worker,
                    session_key: sessionKey,
                    project_name,
                    ids,
                });
            });
        }

        Swal.fire('Готово', 'Операции отправлены на сервер', 'success');
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
    useEffect(() => console.log("selected: ", selectedPreset),[selectedPreset])
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
            return Swal.fire('Ошибка', 'Выберите действие в шапке', 'error');
        }
        const act = selectedActionOption.action;

        // 1) Построим словарь id → project_name
        const idToProject = idProjectMap.reduce<Record<number, string>>((acc, { id, project_name }) => {
            acc[id] = project_name;
            return acc;
        }, {});

        const orderColumnKey = Object
            .entries(selectedPreset!.preset.structure)
            .find(([_, cfg]) => cfg.name === 'ID заказа')?.[0];
        console.log("row.id_list: ", row.id_list)
        // Достаём текст заказа (первый элемент массива)
        let orderIdText = row.id_list[0] + ''; // fallback на первый из id_list
        if (orderColumnKey) {
            const cell = row[orderColumnKey] as ColumnCell;
            orderIdText = cell.value[0] ?? orderIdText;
        }
        // 2) Сгруппируем id_list по проектам
        const groups = row.id_list.reduce<Record<string, number[]>>((acc, id) => {
            const proj = idToProject[id] || 'unknown';
            if (!acc[proj]) acc[proj] = [];
            acc[proj].push(id);
            return acc;
        }, {});

        // 3) Проверим, что для code-actions есть модуль
        let missingModule = false;
        let foundModule: ModuleType | undefined;
        if (act.action_type === 'code') {
            foundModule = modules.find(m => m.filename === act.code_filename);
            if (!foundModule) {
                missingModule = true;
            }
        }

        Swal.fire({
            title: `Применить «${act.action_name}» к заказу ${orderIdText}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Выполнить',
        }).then(result => {
            if (!result.isConfirmed) return;

            if (act.action_type === 'code') {
                if (missingModule) {
                    return Swal.fire(
                        'Ошибка',
                        `Модуль "${act.code_filename}" не найден в загруженных модулях.`,
                        'error'
                    );
                }

            }
            else if (act.action_type === 'delete') {
                // для каждого проекта отправляем delete_phone
                Object.entries(groups).forEach(([project_name, ids]) => {
                    console.log("args: ",{
                        worker,
                        session_key:  sessionKey,
                        project_name,
                        ids,
                    })
                    // socket.emit('delete_phone', {
                    //     worker,
                    //     session_key:  sessionKey,
                    //     project_name,
                    //     ids,
                    // });
                });
            }
            else {
                // остальные типы action_type…
            }

            Swal.fire('Готово', 'Операция отправлена на сервер', 'success');
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
                            setTableData([])
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
                <div style={{ height: '70vh', overflowY: 'auto' }}>
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
                                                onClick={() => setOpenedGroup(row.id_list)}
                                            >
                                                Открыть
                                            </button>
                                            <button
                                                className="btn btn-outline-light text text-dark mx-1 ml-2"
                                                onClick={() => {
                                                    setModalIds(row.id_list);
                                                    setModalAction(selectedActionOption?.action ?? null);
                                                    setModalOpen(true);
                                                }}
                                                disabled={!selectedActionOption} // disable if no action is selected
                                            >
                                                Обработать
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    {/*</div>*/}
                </div>
            {/* Пагинация */}
                <div className="mt-4 flex justify-center items-center space-x-2 my-2" style={{position:"absolute", right:"48%", bottom: -50, zIndex: 10}}>
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
                idProjectMap={idProjectMap}
                glagolParent={glagolParent}
                role={role}
                modules={modules}
            />
        </div>
    );
};

export default PresetSelectorTable;
