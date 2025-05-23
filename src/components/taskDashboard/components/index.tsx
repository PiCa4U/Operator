import React, {useState, useEffect, useMemo} from 'react';
import Swal from 'sweetalert2';
import { socket } from '../../../socket';
import {store} from "../../../redux/store";
import {getCookies} from "../../../utils";
import styles from "./checkbox.module.css";
import {useSelector} from "react-redux";
import {makeSelectFullProjectPool} from "../../../redux/operatorSlice";

interface Action {
    action_name: string;
    action_type: string;
    code_filename: string;
}

interface Preset {
    id: number;
    preset_name: string;
    group_table: string;
    group_by: string[];       // ключи группировки, например ["group_factor_1","group_factor_2",...]
}

interface RawRow {
    id: number;
    phone: string;
    status: string;
    [key: string]: any;       // сюда попадут и group_factor_1, group_factor_2 и т.д.
}

interface Props {
    isOpen: boolean;
    onClose(): void;
    preset: Preset | null;
    action: Action;
    ids: number[];            // row.id_list из родителя
    glagolParent: string;
    role: string;
    onConfirm(selectedIds: number[], selectedFilters: Record<string,string[]>): void;
}

const GroupActionModal: React.FC<Props> = ({
                                               isOpen, onClose, preset, action, ids, glagolParent, role, onConfirm
                                           }) => {
    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;

    const [rawRows, setRawRows] = useState<RawRow[]>([]);
    const [loading, setLoading] = useState(false);

    // Какие контакты выбраны
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    // Какие значения групп-факторов выбраны
    const [selectedFilters, setSelectedFilters] = useState<Record<string,Set<string>>>({});

    const projectPool = useSelector(useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]));
    const projectNames = useMemo(() => projectPool.map(p => p.project_name), [projectPool]);

    const { sessionKey } = store.getState().operator

    useEffect(() => {
        if (!isOpen || !preset) return;
        setLoading(true);

        const body = {
            glagol_parent: 'fs.at.glagol.ai',
            group_by:      preset.group_by,
            filter_by:     { project: ['IN', projectNames] },
            group_table:   preset.group_table,
            role,
        };

        fetch('/api/v1/get_grouped_phones', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        })
            .then(async res => {
                if (!res.ok) throw new Error(res.statusText);

                // 1) Типизируем вложенный ответ
                type NestedResponse = Record<
                    string,
                    Record<
                        string,
                        Record<
                            string,
                            RawRow[]
                        >
                    >
                >;

                const nested = (await res.json()) as NestedResponse;

                // 2) Сплющиваем всё в один массив RawRow[]
                const allRows: RawRow[] = [];
                for (const level2Obj of Object.values(nested)) {
                    for (const level3Obj of Object.values(level2Obj)) {
                        for (const arr of Object.values(level3Obj)) {
                            allRows.push(...arr);
                        }
                    }
                }

                // 3) Фильтруем по тем id, что передали в props.ids
                const filtered = allRows.filter(r => ids.includes(r.id));

                // 4) Обновляем стейты
                setRawRows(filtered);
                setSelectedIds(new Set(filtered.map(r => r.id)));

                const init: Record<string, Set<string>> = {};
                preset.group_by.forEach(key => {
                    init[key] = new Set();
                });
                setSelectedFilters(init);
            })
            .catch(err => {
                console.error(err);
                Swal.fire('Ошибка', 'Не удалось загрузить данные', 'error');
            })
            .finally(() => setLoading(false));
    }, [isOpen, preset, projectNames, role, ids]);

    if (!isOpen) return null;
    if (loading) return <div className="modal">Загрузка...</div>;


    // собрать уникальные значения для каждого фактора
    const uniqueValues: Record<string,string[]> = {};
    preset?.group_by.forEach(key => {
        uniqueValues[key] = Array.from(new Set(rawRows.map(r => r[key])));
    });

    // хелперы для чекбоксов
    const toggleFilter = (key: string, val: string) => {
        setSelectedFilters(prev => {
            const nxt = { ...prev };
            if (nxt[key].has(val)) nxt[key].delete(val);
            else nxt[key].add(val);
            return nxt;
        });
    };
    const toggleRow = (id: number) => {
        setSelectedIds(prev => {
            const nxt = new Set(prev);
            if (nxt.has(id)) nxt.delete(id);
            else nxt.add(id);
            return nxt;
        });
    };

    return (
        <div className="modal">
            <div className="modal-content">
                <h2>Группа: «{action.action_name}»</h2>
                <p>Кол-во контактов: {rawRows.length}</p>

                {/* ФИЛЬТРЫ ПО ГРУПП-ФАКТОРАМ */}
                <div className="filters mb-4">
                    {preset?.group_by.map(key => (
                        <fieldset key={key} className="mb-2">
                            <legend><b>{key}</b></legend>
                            {uniqueValues[key].map(val => (
                                <label key={val} style={{ marginRight: 8 }}>
                                    <input
                                        type="checkbox"
                                        className={styles.customCheckbox}
                                        checked={selectedFilters[key].has(val)}
                                        onChange={() => toggleFilter(key, val)}
                                    />{' '}
                                    {val}
                                </label>
                            ))}
                        </fieldset>
                    ))}
                </div>

                {/* ТАБЛИЦА КОНТАКТОВ */}
                <table className="mb-4 border-collapse w-full">
                    <thead>
                    <tr>
                        <th className="border p-1 text-center">✓</th>
                        <th className="border p-1">phone</th>
                        {preset?.group_by.map(key => (
                            <th key={key} className="border p-1">{key}</th>
                        ))}
                        <th className="border p-1">status</th>
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
                                    onChange={() => toggleRow(r.id)}
                                />
                            </td>
                            <td className="border p-1">{r.phone}</td>
                            {preset?.group_by.map(key => (
                                <td key={key} className="border p-1">{r[key]}</td>
                            ))}
                            <td className="border p-1">{r.status}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>

                {/* КНОПКИ */}
                <div className="flex justify-end space-x-2">
                    <button onClick={onClose} className="px-3 py-1 border rounded">Отмена</button>
                    <button
                        onClick={() =>
                            onConfirm(
                                Array.from(selectedIds),
                                Object.fromEntries(
                                    Object.entries(selectedFilters).map(([k, set]) => [k, Array.from(set)])
                                )
                            )
                        }
                        className="px-3 py-1 bg-blue-600 text-white rounded"
                    >
                        Подтвердить
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GroupActionModal;
