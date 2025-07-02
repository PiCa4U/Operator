import React from 'react';
import Select, {
    StylesConfig,
    GroupBase,
    SingleValue,
    ClearIndicatorProps,
} from 'react-select';

// Опция: value = "11111111115|group_project_1", label = "11111111115 (Группа 1)"
interface Option {
    value: string;
    label: string;
}

interface Props {
    value: string;
    onChange: (val: string) => void;
    options: Array<{ id: string; name: string }>;
    placeholder?: string;
    isSearchable?: boolean;
}

const customStyles: StylesConfig<Option, false, GroupBase<Option>> = {
    container: base => ({ ...base, minWidth: '150px', boxSizing: 'border-box', marginBottom:6}),
    control: (base, { isFocused }) => ({
        ...base,
        border: '1px solid #ced4da',
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        height: 'calc(1.8125rem + 2px)',
        minHeight: 'calc(1.8125rem + 2px)',
        padding: 0,
        boxShadow: isFocused ? '0 0 0 .2rem rgba(65, 212, 146, .25)' : 'none',
        cursor: 'pointer',
        '&:hover': { borderColor: '#ced4da' },
    }),
    valueContainer: base => ({
        ...base,
        padding: '0 .75rem',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
    }),
    placeholder: base => ({ ...base, lineHeight: 'calc(1.8125rem + 2px)', color: '#495057' }),
    singleValue: base => ({
        ...base,
        lineHeight: 'calc(1.8125rem + 2px)',
        color: '#495057',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
    }),
    dropdownIndicator: base => ({ ...base, padding: 0, height: '100%', display: 'flex', alignItems: 'center' }),
    indicatorSeparator: () => ({ display: 'none' }),
    clearIndicator: base => ({
        ...base,
        padding: '0 8px',
        cursor: 'pointer',
        color: '#999',
        '&:hover': { color: '#333' },
    }),
    menu: base => ({ ...base, width: '100%', boxSizing: 'border-box', zIndex: 9999 }),
    option: (base, { isFocused }) => ({
        ...base,
        backgroundColor: isFocused ? '#f8f9fa' : 'white',
        color: '#212529',
        cursor: 'pointer',
    }),
};

const PhoneProjectSelect: React.FC<Props> = ({ value, onChange, options, placeholder = '— выберите —', isSearchable = false }) => {
    // Формируем список опций
    const opts: Option[] = options.map(o => ({ value: o.id, label: o.name }));
    const selected = opts.find(o => o.value === value) || null;

    return (
        <Select<Option, false>
            options={opts}
            isSearchable={isSearchable}
            isClearable
            styles={customStyles}
            value={selected}
            onChange={opt => onChange((opt as SingleValue<Option>)?.value || '')}
            placeholder={placeholder}
            menuPlacement="auto"
        />
    );
};

export default PhoneProjectSelect;
