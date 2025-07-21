import React from 'react';
import Select, {
    StylesConfig,
    GroupBase,
    MultiValue,
    ClearIndicatorProps,
} from 'react-select';
import { ReasonItem, ResultItem } from '../../index';

interface Option {
    value: string;
    label: string;
}

interface Props {
    value: (string | number)[];
    onChange: (val: string[]) => void;
    options: Array<ReasonItem | ResultItem | { id: string | number; name: string; }>;
    placeholder?: string;
    augmentSaved?: boolean;
    isSearchable?: boolean;
}

const customStyles: StylesConfig<Option, true, GroupBase<Option>> = {
    container: (base) => ({
        ...base,
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
    }),

    control: (base, { isFocused }) => ({
        ...base,
        border: '1px solid #ced4da',
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        minHeight: 'calc(1.5em + .75rem + 2px)',
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
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
    }),

    placeholder: (base) => ({
        ...base,
        color: '#495057',
    }),

    multiValue: (base) => ({
        ...base,
        backgroundColor: '#e9ecef',
        borderRadius: '0.5rem',
        padding: '0 4px',
    }),

    multiValueLabel: (base) => ({
        ...base,
        color: '#495057',
        fontSize: 12,
    }),

    multiValueRemove: (base) => ({
        ...base,
        color: '#6c757d',
        ':hover': {
            backgroundColor: '#ced4da',
            color: '#212529',
        },
    }),

    dropdownIndicator: (base) => ({
        ...base,
        padding: 4,
    }),

    indicatorSeparator: () => ({ display: 'none' }),

    clearIndicator: base => ({
        ...base,
        padding: 4,
        cursor: 'pointer',
        color: '#999',
        '&:hover': { color: '#333' },
    }),

    menu: base => ({
        ...base,
        zIndex: 9999,
    }),

    option: (base, { isFocused }) => ({
        ...base,
        backgroundColor: isFocused ? '#f8f9fa' : 'white',
        color: '#212529',
        cursor: 'pointer',
    }),
};

const MultiSelect: React.FC<Props> = ({
                                          value = [],
                                          onChange,
                                          options,
                                          placeholder = 'Выберите...',
                                          augmentSaved = false,
                                          isSearchable = true
                                      }) => {
    const stringValues = Array.isArray(value) ? value.map(v => String(v)) : []

    const staticOpts: Option[] = options.map(o => ({
        value: String(o.id),
        label: o.name,
    }));

    const finalOpts: Option[] = augmentSaved
        ? [
            ...stringValues
                .filter(v => !staticOpts.some(o => o.value === v))
                .map(v => ({ value: v, label: v })),
            ...staticOpts,
        ]
        : staticOpts;

    const selected: Option[] = finalOpts.filter(o => stringValues.includes(o.value));

    return (
        <Select<Option, true>
            isMulti
            isSearchable={isSearchable}
            options={finalOpts}
            value={selected}
            onChange={(selectedOptions: MultiValue<Option>) =>
                onChange(selectedOptions.map(opt => opt.value))
            }
            styles={customStyles}
            placeholder={placeholder}
            menuPlacement="auto"
            closeMenuOnSelect={false}
        />
    );
};

export default MultiSelect;
