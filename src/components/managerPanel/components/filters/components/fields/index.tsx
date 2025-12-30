import {AdaptiveFields} from "./components/adaptiveFields";
import {FC, useEffect, useMemo, useState} from "react";
import {makeSelectFullProjectPool} from "../../../../../../redux/operatorSlice";
import {useSelector} from "react-redux";
import {store} from "../../../../../../redux/store";
import SearchableSelect from "../../../../../callControlPanel/components/select";
import {FilterItem} from "../filterRow";
import {FilterRow} from "../filterRow"


export const FILTER_FIELDS = [
    { id: 'project', name: 'Проект' },
    { id: 'operator', name: 'Оператор' },
    { id: 'date', name: 'Дата' },
    { id: 'comment', name: 'Комментарий' },
    { id: 'phoneNumber', name: 'Номер телефона' },
    { id: 'dialogDuration', name: 'Продолжительность диалога' },
    { id: 'callDirection', name: 'Направление вызова' }
];

interface Props {
    activeFilters: FilterItem[];
    setActiveFilters: React.Dispatch<React.SetStateAction<FilterItem[]>>;
}

export const FilterFields: FC<Props> = ({
                                            activeFilters,
                                            setActiveFilters
                                        }) => {

    const handleAddField = (selected: any) => {
        if (!selected) return;
        if (activeFilters.find(f => f.fieldId === selected.id)) return;
        const name = FILTER_FIELDS.find(row => row.id === selected)?.name
        setActiveFilters(prev => [
            ...prev,
            {
                id: String(Date.now()),
                fieldId: selected,
                value: null,
            },
        ]);
    };

    const handleUpdate = (index: number, updated: FilterItem) => {
        const copy = [...activeFilters];
        copy[index] = updated;
        setActiveFilters(copy);
    };

    const handleRemove = (index: number) => {
        setActiveFilters(prev => prev.filter((_, i) => i !== index));
    };

    const fieldOptions = FILTER_FIELDS.map(f => ({
        name: f.name,
        id: f.id,
    }));

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {activeFilters.map((filter, idx) => (
                <FilterRow
                    key={filter.id}
                    filter={filter}
                    onUpdate={(updated) => handleUpdate(idx, updated)}
                    onRemove={() => handleRemove(idx)}
                />
            ))}

            <div style={{width: 250}}>
                <SearchableSelect
                    value={""}
                    onChange={handleAddField}
                    options={fieldOptions}
                    placeholder="Выберите критерий"
                />
            </div>
        </div>
    );
};
