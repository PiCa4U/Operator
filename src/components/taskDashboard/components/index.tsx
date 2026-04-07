import React, {useState, useEffect, useMemo, useRef} from 'react';
import Swal from 'sweetalert2';
import { socket } from '../../../socket';
import {store} from "../../../redux/store";
import {useSelector} from "react-redux";
import {selectAccessibleProjectNames, selectOperatorAccess} from "../../../redux/operatorSlice";
import styles from "./checkbox.module.css";
import stylesModal from "./modal.module.css";
import {ModuleType} from "../index";
import axios from "axios";

type Step = { type: string; code_filename?: string };

function extractActionSteps(act?: { [k: string]: any }): Step[] {
    const steps: Step[] = [];
    if (!act) return steps;

    if (act.action_type) {
        steps.push({ type: String(act.action_type), code_filename: act.code_filename });
    }

    const idxs = Array.from(
        new Set(
            Object.keys(act)
                .map(k => (/_\d+$/.test(k) ? Number(k.split('_').pop()) : null))
                .filter((n): n is number => n !== null)
        )
    ).sort((a, b) => a - b);

    for (const n of idxs) {
        const t = act[`action_type_${n}`];
        if (!t) continue;
        steps.push({
            type: String(t),
            code_filename: act[`code_filename_${n}`],
        });
    }

    return steps;
}

interface Action {
    action_name: string;
    action_type?: string;
    code_filename?: string;
    [key: string]: any;
}
interface Preset {
    id: number;
    preset_name: string;
    group_table: string;
    group_by: string[];
    projects?: string[];
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
    phoneID?: number | null
    onAfterAction?: () => void;
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
                                               handleGroupSave,
                                               phoneID,
                                               onAfterAction
                                           }) => {
    const { worker = '' } = store.getState().credentials;
    const [rawRows, setRawRows] = useState<RawRow[]>([]);
    const [loading, setLoading] = useState(false);
    const idsUniq = useMemo(() => Array.from(new Set(ids || [])), [ids]);

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

    const [modulesInFlight, setModulesInFlight] = useState(0);
    const modulesCompletedRef = useRef(0);
    const moduleStartModalRef = useRef(false);
    const afterModulesCallbackRef = useRef<null | (() => void)>(null);

    useEffect(() => {
        onSelectionChange?.(Array.from(selectedIds));
    }, [selectedIds, onSelectionChange]);

    const operatorAccess = useSelector(selectOperatorAccess);
    const accessibleProjectNames = useSelector(selectAccessibleProjectNames);
    const projectNames = useMemo(() => {
        const source = operatorAccess.loaded ? accessibleProjectNames : (preset?.projects ?? []);

        return Array.from(new Set(source.map(String).map((value) => value.trim()).filter(Boolean)));
    }, [accessibleProjectNames, operatorAccess.loaded, preset?.projects]);

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

    const wasInitialized = useRef(false);

    // пересчёт подходящих под фильтры ID
    const matchingIds = useMemo(() => {
        const anyGroup1 = selectedFilters.group1.size > 0;
        const anyGroup2 = selectedFilters.group2.size > 0;
        const anyGroup3 = selectedFilters.group3.size > 0;
        const anyStatus = selectedFilters.status.size > 0;

        const noFilters = !anyGroup1 && !anyGroup2 && !anyGroup3 && !anyStatus;

        if (noFilters) {
            if (phoneID && rawRows.some(r => r.id === phoneID)) {
                return [phoneID];
            }
            return rawRows.map(r => r.id);
        }

        return rawRows
            .filter(r =>
                (anyGroup1 && selectedFilters.group1.has(r[f1Key])) ||
                (anyGroup2 && selectedFilters.group2.has(r[f2Key])) ||
                (anyGroup3 && selectedFilters.group3.has(r[f3Key])) ||
                (anyStatus && selectedFilters.status.has(r.status))
            )
            .map(r => r.id);
    }, [rawRows, selectedFilters, f1Key, f2Key, f3Key, phoneID]);

    // при любом изменении matchingIds — помечаем их галочками
    useEffect(() => {
        if (!wasInitialized.current) {
            wasInitialized.current = true;
            if (phoneID && rawRows.some(r => r.id === phoneID)) {
                setSelectedIds(new Set([phoneID]));
                return;
            }
            setSelectedIds(new Set(rawRows.map(r => r.id)));
            return;
        }

        setSelectedIds(new Set(matchingIds));
    }, [matchingIds, rawRows, phoneID]);

    useEffect(() => {
        if (modulesInFlight === 0 || !moduleStartModalRef.current ) return
        const handleComplete = () => {
            modulesCompletedRef.current += 1;
            if (modulesCompletedRef.current >= modulesInFlight) {
                Swal.fire("Готово", "Все модули завершены", "success");
                moduleStartModalRef.current = false;
                setModulesInFlight(0);
                modulesCompletedRef.current = 0;

                const cb = afterModulesCallbackRef.current;
                afterModulesCallbackRef.current = null;
                if (cb) {
                    cb();
                } else {
                    onAfterAction?.();
                    onClose();
                }
            }
        };

        const onRunModule = (data: any) => {
            if (data?.worker || data?.session_key) return;

            handleComplete();
        };

        const onRunModuleError = (data: any) => {
            handleComplete();
        };

        socket.on("run_module", onRunModule);
        socket.on("error", onRunModuleError);

        return () => {
            socket.off("run_module", onRunModule);
            socket.off("error", onRunModuleError);
        };
    }, [modulesInFlight]);

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
        if (!action) {
            handleGroupSave?.();
            onClose();
            return;
        }

        const steps = extractActionSteps(action);
        if (!steps.length) { onClose(); return; }

        const groups = Array.from(selectedIds).reduce<Record<string, number[]>>((acc, id) => {
            const proj = idToProject[id];
            if (!proj) return acc;
            (acc[proj] ||= []).push(id);
            return acc;
        }, {});

        const runStep = (i: number) => {
            if (i >= steps.length) {
                onAfterAction?.();
                onClose();
                return;
            }
            const step = steps[i];

            switch (step.type) {
                case "delete": {
                    Object.entries(groups).forEach(([project_name, ids]) => {
                        socket.emit('delete_phone', { worker, session_key: sessionKey, project_name, ids });
                    });
                    runStep(i + 1);
                    break;
                }

                case "code": {
                    const target = String(step.code_filename || '').replace(/\.py$/, '');
                    const found = modules?.find(m => m.filename.replace(/\.py$/, '') === target);
                    if (!found) {
                        Swal.fire('Ошибка', `Модуль "${step.code_filename}" не найден.`, 'error');
                        return;
                    }

                    type KwargDef = { source: string; default?: string };
                    const argDefs = Object.values(found.kwargs || {}) as KwargDef[];

                    let pending = 0;
                    Object.entries(groups).forEach(([project_name, ids]) => {
                        const byArgs = new Map<string, { ids: number[]; kwargs: Record<string, string> }>();

                        ids.forEach(id => {
                            const row = rawRows.find(r => r.id === id);
                            const ci = row?.contact_info ?? {};
                            const kwargs: Record<string, string> = {};
                            argDefs.forEach(({ source, default: def }) => {
                                if (!source) return;
                                const v = ci[source];
                                kwargs[source] = (v ?? def ?? '') as string;
                            });
                            const key = JSON.stringify(kwargs);
                            if (!byArgs.has(key)) byArgs.set(key, { ids: [], kwargs });
                            byArgs.get(key)!.ids.push(id);
                        });

                        byArgs.forEach(({ kwargs }) => {
                            pending += 1;
                            socket.emit('run_module', {
                                uuid: "", b_uuid: "", worker, session_key: sessionKey,
                                projects: { [project_name]: kwargs },
                                filename: target,
                                common_code: found.common_code,
                            });
                        });
                    });

                    if (pending > 0) {
                        moduleStartModalRef.current = true;
                        setModulesInFlight(pending);
                        modulesCompletedRef.current = 0;
                        afterModulesCallbackRef.current = () => runStep(i + 1);
                    } else {
                        runStep(i + 1);
                    }
                    break;
                }

                // модалка не выбирает оператора — шаг assign в ней пропускаем
                case "assign":
                // иные «служебные» шаги (activate и т.п.) в модалке обычно не нужны — пропускаем
                case "activate":
                default:
                    runStep(i + 1);
            }
        };

        runStep(0);
    };


    useEffect(() => {
        if (!isOpen) return;

        // если id нет — ничего не грузим
        if (!idsUniq.length) {
            setRawRows([]);
            setSelectedIds(new Set());
            setSelectedFilters({
                group1: new Set(),
                group2: new Set(),
                group3: new Set(),
                status: new Set(),
            });
            return;
        }

        setLoading(true);
        (async () => {
            try {
                if (operatorAccess.loaded && projectNames.length === 0) {
                    setRawRows([]);
                    setSelectedIds(new Set());
                    setSelectedFilters({
                        group1: new Set(),
                        group2: new Set(),
                        group3: new Set(),
                        status: new Set(),
                    });
                    return;
                }

                type Nested = Record<string, Record<string, Record<string, RawRow[]>>>;

                // собираем фильтры запроса: проект + ИДшники
                const filterBy: Record<string, any> = {
                    id: ['IN', idsUniq], // <-- ключ "id" соответствует RawRow.id
                };
                if (projectNames.length) {
                    filterBy.project = ['IN', projectNames];
                }

                const response = await axios.post<Nested>('/api/v1/grouped_contacts', {
                    glagol_parent: glagolParent,
                    group_by: preset?.group_by,
                    group_table: preset?.group_table,
                    role,
                    filter_by: filterBy,
                });

                const raw = response.data;
                const allRows: RawRow[] = flattenRows(raw);

                setRawRows(allRows);

                setSelectedIds(() => {
                    if (phoneID && allRows.some(r => r.id === phoneID)) {
                        return new Set([phoneID]);
                    }
                    return new Set(allRows.map(r => r.id));
                });

                setSelectedFilters({
                    group1: new Set(),
                    group2: new Set(),
                    group3: new Set(),
                    status: new Set(),
                });
            } catch (e) {
                Swal.fire('Ошибка', 'Не удалось загрузить данные', 'error');
            } finally {
                setLoading(false);
            }
        })();
        // добавил projectNames и idsUniq в зависимости
    }, [glagolParent, idsUniq, isOpen, operatorAccess.loaded, phoneID, preset, projectNames, role]);

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
                    <h2>Совершить действие: «{action?.action_name ?? "сохранить"}»</h2>
                    <h4>Кол-во контактов: {rawRows.length}</h4>
                </div>

                {/* ─── РЯДЫ ФИЛЬТРОВ ────────────────────────────────── */}
                <div className={stylesModal.filters}>
                    <fieldset className={stylesModal.filtersFieldset}>
                        <div className={stylesModal.noWrap}><b>Групповой фактор 1</b></div>
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
                        <div className={stylesModal.noWrap}><b>Групповой фактор 2</b></div>
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
                        <div className={stylesModal.noWrap}><b>Групповой фактор 3</b></div>
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
                        <div><b>Статус</b></div>
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
