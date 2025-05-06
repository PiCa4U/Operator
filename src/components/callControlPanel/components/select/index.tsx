import React, {useState} from 'react';
import Select, { StylesConfig, GroupBase, SingleValue } from 'react-select';
import {ReasonItem, ResultItem} from "../../index";
 // подставьте свой путь

// Общий тип для опции
interface Option {
    value: string;
    label: string;
}

interface Props {
    value: string | number;
    onChange: (val: string) => void;
    options: Array<ReasonItem | ResultItem | { id: string | number; name: string; }>;
    placeholder?: string;
    augmentSaved?: boolean;
}

const customStyles: StylesConfig<Option, false, GroupBase<Option>> = {
    container: (base) => ({
        ...base,
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box'
    }),

    control: (base, { isFocused }) => ({
        ...base,
        border: '1px solid #ced4da',
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        height: 'calc(1.8125rem + 2px)',
        minHeight: 'calc(1.8125rem + 2px)',
        padding: 0,
        boxShadow: isFocused
            ? '0 0 0 .2rem rgba(65, 212, 146, .25)'
            : 'none',
        cursor: 'pointer',

        '&:hover': {
            borderColor: '#ced4da',
        },
    }),

    valueContainer: (base) => ({
        ...base,
        padding: '0 .75rem',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
    }),

    placeholder: (base) => ({
        ...base,
        lineHeight: 'calc(1.8125rem + 2px)',
        color: '#495057',
    }),

    singleValue: (base) => ({
        ...base,
        lineHeight: 'calc(1.8125rem + 2px)',
        color: '#495057',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
    }),

    dropdownIndicator: (base) => ({
        ...base,
        padding: 0,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
    }),

    indicatorSeparator: () => ({ display: 'none' }),

    menu: (base) => ({
        ...base,
        width: '100%',
        boxSizing: 'border-box',
        zIndex: 9999,
    }),

    option: (base, { isFocused }) => ({
        ...base,
        backgroundColor: isFocused ? '#f8f9fa' : 'white',
        color: '#212529',
        cursor: 'pointer',
    }),
};


const SearchableSelect: React.FC<Props> = ({
                                               value,
                                               onChange,
                                               options,
                                               placeholder = '— выберите —',
                                               augmentSaved = false,
                                           }) => {
    const stringValue = value != null ? String(value) : '';

    // 1) статические опции
    const staticOpts: Option[] = options.map(o => ({
        value: String(o.id),
        label: o.name,
    }));

    // 2) если нужно «дозаписать» текущее value, и его нет в staticOpts — делаем это
    const finalOpts: Option[] = augmentSaved && stringValue
        ? (
            staticOpts.some(o => o.value === stringValue)
                ? staticOpts
                : [{ value: stringValue, label: stringValue }, ...staticOpts]
        )
        : staticOpts;

    // 3) находим выбранный
    const selected = finalOpts.find(o => o.value === stringValue) || null;

    return (
        <Select<Option, false>
            isSearchable
            options={finalOpts}
            value={selected}
            onChange={opt => onChange((opt as SingleValue<Option>)!.value)}
            styles={customStyles}
            placeholder={placeholder}
            menuPlacement="auto"
        />
    );
};

export default SearchableSelect;
