import React from 'react';
import Select, {
    StylesConfig,
    GroupBase,
    SingleValue,
    ClearIndicatorProps,
} from 'react-select';
import { ReasonItem, ResultItem } from '../../index';

interface Option {
    value: string;
    label: string;
}

interface Props {
    value: string | number;
    onChange: (val: string) => void;
    options: Array<
        ReasonItem | ResultItem | { id: string | number; name: string }
    >;
    placeholder?: string;
    augmentSaved?: boolean;
}

const customStyles: StylesConfig<Option, false, GroupBase<Option>> = {
    container: base => ({
        ...base,
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        fontWeight: 500,
        fontSize: 18
    }),
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
    placeholder: base => ({
        ...base,
        lineHeight: 'calc(1.8125rem + 2px)',
        color: '#495057',
    }),
    singleValue: base => ({
        ...base,
        lineHeight: 'calc(1.8125rem + 2px)',
        color: '#495057',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
    }),
    dropdownIndicator: base => ({
        ...base,
        padding: 0,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    clearIndicator: base => ({
        ...base,
        padding: '0 8px',
        cursor: 'pointer',
        color: '#999',
        '&:hover': { color: '#333' },
    }),
    menu: base => ({
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
        fontWeight: 500,
        fontSize: 20
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

    // 2) «дозапись» текущего value, если отсутствует
    const finalOpts: Option[] =
        augmentSaved && stringValue
            ? staticOpts.some(o => o.value === stringValue)
                ? staticOpts
                : [{ value: stringValue, label: stringValue }, ...staticOpts]
            : staticOpts;

    // 3) выбранный объект
    const selected: Option | null =
        finalOpts.find(o => o.value === stringValue) ?? null;

    return (
        <Select<Option, false>
            isSearchable
            isClearable
            options={finalOpts}
            value={selected}
            onChange={opt =>
                // opt может быть null при очистке
                onChange((opt as SingleValue<Option>)?.value ?? '')
            }
            styles={customStyles}
            placeholder={placeholder}
            menuPlacement="auto"
        />
    );
};

export default SearchableSelect;
