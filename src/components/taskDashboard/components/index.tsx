import React, {useState, useEffect, useMemo, useRef} from 'react';
import Swal from 'sweetalert2';
import { socket } from '../../../socket';
import {store} from "../../../redux/store";
import {useSelector} from "react-redux";
import {makeSelectFullProjectPool} from "../../../redux/operatorSlice";
import styles from "./checkbox.module.css";
import stylesModal from "./modal.module.css";
import {ModuleType} from "../index";
import axios from "axios";

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

    const [modulesInFlight, setModulesInFlight] = useState(0);
    const modulesCompletedRef = useRef(0);
    const moduleStartModalRef = useRef(false);


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
        console.log("COMPLETEMODALOPENTRUE")
        const handleComplete = () => {
            console.log("modulesCompletedRef.current: ", modulesCompletedRef.current)
            modulesCompletedRef.current += 1;
            if (modulesCompletedRef.current >= modulesInFlight) {
                Swal.fire("Готово", "Все модули завершены", "success");
                onAfterAction?.();
                moduleStartModalRef.current = false
                setModulesInFlight(0)
                modulesCompletedRef.current = 0
                onClose();
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
                socket.emit('delete_phone', {
                    worker,
                    session_key: sessionKey,
                    project_name,
                    ids,
                });
            });
            if (onAfterAction) {
                Swal.fire("Готово", "Контакты удалены успешно", "success");
                onAfterAction()
            }
        } else if (action?.action_type === 'code') {
                const targetName = action.code_filename.replace(/\.py$/, '');
                const foundModule = modules?.find(m => m.filename.replace(/\.py$/, '') === targetName);
                if (!foundModule) {
                    return Swal.fire('Ошибка', `Модуль "${action.code_filename}" не найден.`, 'error');
                }

                type KwargDef = { source: string; default?: string };
                const argDefs = Object.values(foundModule.kwargs || {}) as KwargDef[];
                let pendingCount = 0;

                Object.entries(groups).forEach(([project_name, ids]) => {
                    const idToContact = ids.map(id => {
                        const contact = rawRows.find(r => r.id === id);
                        return {
                            id,
                            contactInfo: contact?.contact_info ?? {},
                            project: contact?.project ?? project_name,
                        };
                    });

                    const groupedByContactInfo = new Map<string, { ids: number[]; contactInfo: any; project: string }>();

                    idToContact.forEach(({ id, contactInfo, project }) => {
                        // 👉 строим подмножество contactInfo только по используемым source
                        const usedFields = argDefs.reduce<Record<string, string>>((acc, { source, default: def }) => {
                            if (!source) return acc;

                            const value = contactInfo[source];
                            acc[source] = (value !== undefined && value !== null && value !== '') ? value : (def ?? '');
                            return acc;
                        }, {});

                        const hashKey = JSON.stringify(usedFields);

                        if (!groupedByContactInfo.has(hashKey)) {
                            groupedByContactInfo.set(hashKey, {
                                ids: [],
                                contactInfo: usedFields,
                                project,
                            });
                        }
                        groupedByContactInfo.get(hashKey)!.ids.push(id);
                    });

                    groupedByContactInfo.forEach(({ ids: groupedIds, contactInfo, project }) => {
                        const kwargs: Record<string, string> = {};
                        argDefs.forEach(({ source, default: def }) => {
                            if (!source) return;
                            kwargs[source] = contactInfo[source] ?? def ?? '';
                        });
                        pendingCount += 1;

                        socket.emit('run_module', {
                            uuid: "",
                            b_uuid: "",
                            worker,
                            session_key: sessionKey,
                            projects: { [project]: kwargs },
                            filename: foundModule.filename.replace(/\.py$/, ''),
                            common_code: foundModule.common_code,
                        });

                        console.log(`[modal/run_module] project=${project}, ids=[${groupedIds.join(', ')}], kwargs=`, kwargs);
                    });
                });
            if (pendingCount > 0) {
                moduleStartModalRef.current = true
                setModulesInFlight(pendingCount);
                modulesCompletedRef.current = 0;
            }

            // if (onAfterAction) {
            //     onAfterAction()
            // }
        } else {
            Swal.fire('Ошибка', 'Неподдерживаемый тип действия', 'error');
        }
        if (action?.action_type !== 'code') {
            onClose();
        }
    };


    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        (async () => {
            try {
                type Nested = Record<string, Record<string, Record<string, RawRow[]>>>;
                const response = await axios.post<Nested>('/api/v1/get_grouped_phones', {
                    glagol_parent: glagolParent,
                    group_by: preset?.group_by,
                    filter_by: { project: ['IN', projectNames], },
                    group_table: preset?.group_table,
                    role,
                });
                const raw = response.data;
                const allRows: RawRow[] = flattenRows(raw);
                const filtered = allRows.filter(r => ids.includes(r.id));
                setRawRows(filtered);
                setSelectedIds(() => {
                    if (phoneID && filtered.some(r => r.id === phoneID)) {
                        return new Set([phoneID]);
                    }
                    return new Set(filtered.map(r => r.id));
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
    }, [isOpen, preset, role, ids, glagolParent]);


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
