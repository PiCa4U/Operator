import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { socket } from '../../../socket';
import {store} from "../../../redux/store";
import {getCookies} from "../../../utils";

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
    const [rawRows, setRawRows] = useState<RawRow[]>([]);
    const [loading, setLoading] = useState(false);

    // Какие контакты выбраны
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    // Какие значения групп-факторов выбраны
    const [selectedFilters, setSelectedFilters] = useState<Record<string,Set<string>>>({});

    const { sessionKey } = store.getState().operator
    const sipLogin = getCookies('sip_login') || '';
    const worker = getCookies('worker') || '';

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);

        const handleGetOutStart = (data: RawRow[]) => {
            setRawRows(data);
            setSelectedIds(new Set(data.map(r => r.id)));
            // init filters
            const init: Record<string,Set<string>> = {};
            preset?.group_by.forEach(key => init[key] = new Set());
            setSelectedFilters(init);
            setLoading(false);
        };

        socket.on('get_out_start', handleGetOutStart);

        socket.emit('get_phone_line', {
            MessageID: 'get_phone_lineRequest',
            ids,
            project_name: "akc24",
            session_key: sessionKey,
            worker,
        });

        return () => {
            socket.off('get_out_start', handleGetOutStart);
        };
    }, [isOpen, ids, sessionKey, worker, preset?.group_by]);

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
