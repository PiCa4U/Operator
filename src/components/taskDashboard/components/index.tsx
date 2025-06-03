import React, {useState, useEffect, useMemo} from 'react';
import Swal from 'sweetalert2';
import { socket } from '../../../socket';
import {store} from "../../../redux/store";
import {useSelector} from "react-redux";
import {makeSelectFullProjectPool} from "../../../redux/operatorSlice";
import styles from "./checkbox.module.css";
import stylesModal from "./modal.module.css";
import {ModuleType} from "../index";

interface Action { action_name: string; action_type: string; code_filename: string; }
interface Preset {
    id: number;
    preset_name: string;
    group_table: string;
    group_by: string[];
}
interface RawRow {
    id: number;
    phone: string;
    status: string;
    [key: string]: any;
}
interface Props {
    isOpen: boolean;
    onClose(): void;
    preset: Preset | null;
    action?: Action;
    ids: number[];
    glagolParent: string;
    role: string;
    // onConfirm(selectedIds: number[], selectedFilters: Record<string,string[]>): void;
    idProjectMap: { id: number; project_name: string }[]
    modules?: ModuleType[]
    onSelectionChange?: (ids: number[]) => void
    handleGroupSave?: () => void
}

const GroupActionModal: React.FC<Props> = ({
                                               isOpen,
                                               onClose,
                                               preset,
                                               action,
                                               ids,
                                               glagolParent,
                                               role,
                                               // onConfirm,
                                               idProjectMap,
                                               modules,
                                               onSelectionChange,
                                               handleGroupSave
                                           }) => {
    const { sipLogin = '', worker = '' } = store.getState().credentials;
    const [rawRows, setRawRows] = useState<RawRow[]>([]);
    const [loading, setLoading] = useState(false);

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [selectedFilters, setSelectedFilters] = useState<{
        group1: Set<string>,
        group2: Set<string>,
        group3: Set<string>,
        status: Set<string>,
    }>({
        group1: new Set(),
        group2: new Set(),
        group3: new Set(),
        status: new Set(),
    });

    useEffect(() => {
        onSelectionChange?.(Array.from(selectedIds));
    }, [selectedIds, onSelectionChange]);

    const projectPool = useSelector(useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]));
    const projectNames = useMemo(() => projectPool.map(p => p.project_name), [projectPool]);
    // const projectNames = ["group_project_1", "group_project_2"]

    const { sessionKey } = store.getState().operator

    const idToProject = useMemo(() => {
        const map: Record<number,string> = {};
        idProjectMap.forEach(({id, project_name}) => { map[id] = project_name });
        return map;
    }, [idProjectMap]);

    // названия полей группировки из пресета или дефолт
    const factorKeys = ['group_factor_1','group_factor_2','group_factor_3'] as const;
    const [f1Key, f2Key, f3Key] = factorKeys;

    // уникальные значения для каждой группы и статусов
    const unique1 = useMemo(() => Array.from(new Set(rawRows.map(r => r[f1Key]).filter(Boolean))), [rawRows, f1Key]);
    const unique2 = useMemo(() => Array.from(new Set(rawRows.map(r => r[f2Key]).filter(Boolean))), [rawRows, f2Key]);
    const unique3 = useMemo(() => Array.from(new Set(rawRows.map(r => r[f3Key]).filter(Boolean))), [rawRows, f3Key]);
    const uniqueStatus = useMemo(() => Array.from(new Set(rawRows.map(r => r.status))), [rawRows]);

    // пересчёт подходящих под фильтры ID
    const matchingIds = useMemo(() => {
        // флаги — выбран ли хоть один фильтр
        const anyGroup1 = selectedFilters.group1.size > 0;
        const anyGroup2 = selectedFilters.group2.size > 0;
        const anyGroup3 = selectedFilters.group3.size > 0;
        const anyStatus = selectedFilters.status.size > 0;

        // если ни одного фильтра не выбрано — считаем, что подходят все
        const noFilters = !anyGroup1 && !anyGroup2 && !anyGroup3 && !anyStatus;

        return rawRows
            .filter(r => {
                if (noFilters) return true;
                // попадает ли строка хотя бы под один из выбранных фильтров?
                return (
                    (anyGroup1 && selectedFilters.group1.has(r[f1Key])) ||
                    (anyGroup2 && selectedFilters.group2.has(r[f2Key])) ||
                    (anyGroup3 && selectedFilters.group3.has(r[f3Key])) ||
                    (anyStatus && selectedFilters.status.has(r.status))
                );
            })
            .map(r => r.id);
    }, [rawRows, selectedFilters, f1Key, f2Key, f3Key]);

    // при любом изменении matchingIds — помечаем их галочками
    useEffect(() => {
        setSelectedIds(new Set(matchingIds));
    }, [matchingIds]);

    const allSelected = rawRows.length > 0 && rawRows.every(r => selectedIds.has(r.id));
    const toggleSelectAll = () =>
        setSelectedIds(prev => allSelected ? new Set() : new Set(rawRows.map(r => r.id)));

    function flattenRows(input: any): RawRow[] {
        if (Array.isArray(input)) {
            return input as RawRow[];
        }
        if (input && typeof input === 'object') {
            return Object.values(input).flatMap(flattenRows);
        }
        return [];
    }

    const handleConfirm = () => {
        // 1) Группируем выделенные ID по проектам
        const groups = Array.from(selectedIds).reduce<Record<string, number[]>>((acc, id) => {
            const proj = idToProject[id];
            if (!proj) return acc;
            if (!acc[proj]) acc[proj] = [];
            acc[proj].push(id);
            return acc;
        }, {});
        if (!action) {
            handleGroupSave?.()
            return;
        }
        // 2) В зависимости от типа действия шлём нужные ивенты
        if (action?.action_type === 'delete') {
            Object.entries(groups).forEach(([project_name, ids]) => {
                console.log("args: ", {
                    worker,
                    session_key: sessionKey,
                    project_name,
                    ids,
                })
                // socket.emit('delete_phone', {
                //     worker,
                //     session_key: sessionKey,
                //     project_name,
                //     ids,
                // });
            });
            Swal.fire('Готово', 'Запросы на удаление отправлены', 'success');

        } else if (action?.action_type === 'code') {
                const targetName = action.code_filename.replace(/\.py$/, '');
                const foundModule = modules?.find(m => m.filename.replace(/\.py$/, '') === targetName);
                if (!foundModule) {
                    return Swal.fire('Ошибка', `Модуль "${action.code_filename}" не найден.`, 'error');
                }

                type KwargDef = { source: string; default?: string };
                const argDefs = Object.values(foundModule.kwargs || {}) as KwargDef[];

                Object.entries(groups).forEach(([project_name, ids]) => {
                    ids.forEach(id => {
                        const contact = rawRows.find((p: any) => p.id === id);
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
                            kwargs,
                        });
                    });
                });

            } else {
            Swal.fire('Ошибка', 'Неподдерживаемый тип действия', 'error');
        }

        onClose();
    };

    // загрузка данных при открытии
    useEffect(() => {
        if (!isOpen || !preset) return;
        setLoading(true);
        fetch('/api/v1/get_grouped_phones', {
            method: 'POST',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify({
                glagol_parent: glagolParent,
                group_by: preset.group_by,
                filter_by: { project: ['IN', projectNames] },
                group_table: preset.group_table,
                role
            })
        })
            .then(async res => {
                if (!res.ok) throw new Error(res.statusText);
                type Nested = Record<string, Record<string, Record<string,RawRow[]>>>;
                const raw = await res.json();
                const allRows: RawRow[] = flattenRows(raw);
                const filtered = allRows.filter(r => ids.includes(r.id));
                setRawRows(filtered);
                setSelectedIds(new Set(filtered.map(r => r.id)));
                setSelectedFilters({ group1:new Set(), group2:new Set(), group3:new Set(), status:new Set() });
            })
            .catch(e => Swal.fire('Ошибка','Не удалось загрузить данные','error'))
            .finally(() => setLoading(false));
    }, [isOpen, preset, role, ids, glagolParent]);

    useEffect(()=> {
        console.log("777isOpen: ", isOpen)
    },[isOpen])
    useEffect(()=> {
        console.log("777preset: ", preset)
    },[preset])
    useEffect(()=> {
        console.log("777role: ", role)
    },[role])
    useEffect(()=> {
        console.log("777ids: ", ids)
    },[ids])
    useEffect(()=> {
        console.log("777glagolParent: ", glagolParent)
    },[glagolParent])


    if (!isOpen) return null;
    if (loading) return <div className={stylesModal.modal}><div className={stylesModal.modalContent}>Загрузка...</div></div>;

    // переключатели фильтров
    const toggleFilter = (which: keyof typeof selectedFilters, val: string) => {
        setSelectedFilters(prev => {
            const nxt = {...prev};
            nxt[which].has(val) ? nxt[which].delete(val) : nxt[which].add(val);
            return nxt;
        });
    };

    return (
        <div
            className={stylesModal.modal}
            onClick={onClose}
        >
            <div
                className={stylesModal.modalContent}
                onClick={e => e.stopPropagation()}
            >
                <div className={stylesModal.header}>
                    <h2>Совершить действие: «{action?.action_name}»</h2>
                    <h4>Кол-во контактов: {rawRows.length}</h4>
                </div>

                {/* ─── РЯДЫ ФИЛЬТРОВ ────────────────────────────────── */}
                <div className={stylesModal.filters}>
                    <fieldset className={stylesModal.filtersFieldset}>
                        <h3 className={stylesModal.noWrap}><b>Групповой фактор 1</b></h3>
                        <div className={stylesModal.filterOptions}>
                        {unique1.map(val => (
                            <label key={val} style={{display:"inline-flex", gap:"4px"}}>
                                <input
                                    type="checkbox"
                                    className={styles.customCheckbox}
                                    checked={selectedFilters.group1.has(val)}
                                    onChange={() => toggleFilter('group1', val)}
                                />{' '}{val}
                            </label>
                        ))}
                        </div>
                    </fieldset>

                    <fieldset className={stylesModal.filtersFieldset}>
                        <h3 className={stylesModal.noWrap}><b>Групповой фактор 2</b></h3>
                        <div className={stylesModal.filterOptions}>
                            {unique2.map(val => (
                                <label key={val} style={{display:"inline-flex", gap:"4px"}}>
                                    <input
                                         type="checkbox"
                                         className={styles.customCheckbox}
                                         checked={selectedFilters.group2.has(val)}
                                         onChange={() => toggleFilter('group2', val)}
                                    />
                                    {val}
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className={stylesModal.filtersFieldset}>
                        <h3 className={stylesModal.noWrap}><b>Групповой фактор 3</b></h3>
                        <div className={stylesModal.filterOptions}>
                        {unique3.map(val => (
                            <label key={val} style={{display:"inline-flex", gap:"4px"}}>
                                <input
                                    type="checkbox"
                                    className={styles.customCheckbox}
                                    checked={selectedFilters.group3.has(val)}
                                    onChange={() => toggleFilter('group3', val)}
                                />{' '}{val}
                            </label>
                        ))}
                        </div>
                    </fieldset>

                    <fieldset className={stylesModal.filtersFieldset}>
                        <h3><b>Статус</b></h3>
                        <div className={stylesModal.filterOptions}>
                        {uniqueStatus.map(val => (
                            <label key={val} style={{display:"inline-flex", gap:"4px"}}>
                                <input
                                    type="checkbox"
                                    className={styles.customCheckbox}
                                    checked={selectedFilters.status.has(val)}
                                    onChange={() => toggleFilter('status', val)}
                                />{' '}{val}
                            </label>
                        ))}
                        </div>
                    </fieldset>
                </div>

                {/* ─── ТАБЛИЦА ───────────────────────────────────────── */}
                <table className={stylesModal.table}>
                    <thead>
                    <tr>
                        <th className="border p-1 text-center">
                            <input
                                type="checkbox"
                                className={styles.customCheckbox}
                                checked={allSelected}
                                onChange={toggleSelectAll}
                            />
                        </th>
                        <th className="border p-1">Телефон</th>
                        <th className="border p-1">Групповой фактор 1</th>
                        <th className="border p-1">Групповой фактор 2</th>
                        <th className="border p-1">Групповой фактор 3</th>
                        <th className="border p-1">Статус</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rawRows.map(r => (
                        <tr key={r.id}>
                            <td className="border p-1 text-center">
                                <input
                                    type="checkbox"
                                    className={styles.customCheckbox}
                                    checked={selectedIds.has(r.id)}
                                    onChange={() => setSelectedIds(s => {
                                        const nxt = new Set(s);
                                        nxt.has(r.id) ? nxt.delete(r.id) : nxt.add(r.id);
                                        return nxt;
                                    })}
                                />
                            </td>
                            <td className="border p-1">{r.phone}</td>
                            <td className="border p-1">{r[f1Key] ?? '—'}</td>
                            <td className="border p-1">{r[f2Key] ?? '—'}</td>
                            <td className="border p-1">{r[f3Key] ?? '—'}</td>
                            <td className="border p-1">{r.status}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>

                {/* ─── КНОПКИ ───────────────────────────────────────── */}
                <div className={stylesModal.buttonRow}>
                    <button onClick={onClose} className="px-3 py-1 btn btn-outline-danger mr-2 ">Отмена</button>
                    <button
                        onClick={handleConfirm}
                        className="btn btn-outline-success"
                    >
                        Подтвердить
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GroupActionModal;
