import React from 'react';
import Select, {
    StylesConfig,
    GroupBase,
    SingleValue,
} from 'react-select';
import { ReasonItem, ResultItem } from '../../index';

// Общий тип для опции
interface Option {
    value: string;
    label: string;
}

interface Props {
    value: string | number;
    onChange: (val: string) => void;
    options: Array<ReasonItem | ResultItem | { id: string | number; name: string }>;
    placeholder?: string;
    augmentSaved?: boolean;
    isSearchable?: boolean;
    zIndexMenu?: number;          // <- опционально: можно переопределить z-index меню
}

const customStyles: StylesConfig<Option, false, GroupBase<Option>> = {
    container: (base) => ({
        ...base,
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        height: 'calc(1.5em + .75rem + 2px)',
    }),
    control: (base, { isFocused }) => ({
        ...base,
        border: '1px solid #ced4da',
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        height: 'calc(1.5em + .75rem + 2px)',
        minHeight: 'calc(1.5em + .75rem + 2px)',
        padding: 0,
        boxShadow: isFocused ? '0 0 0 .2rem rgba(65, 212, 146, .25)' : 'none',
        cursor: 'pointer',
        '&:hover': { borderColor: '#ced4da' },
    }),
    valueContainer: (base) => ({
        ...base,
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        padding: '0 .75rem',
        height: 'calc(1.5em + .75rem + 2px)',
        overflow: 'hidden',
        flex: 1,
        minWidth: 0,
    }),
    placeholder: (base) => ({
        ...base,
        lineHeight: 'calc(1.5em + .75rem + 2px)',
        color: '#495057',
    }),
    input: (base) => ({
        ...base,
        flexShrink: 0,
        flexGrow: 0,
        width: 'auto',
        minWidth: 2,
    }),
    singleValue: (base) => ({
        ...base,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flexShrink: 1,
        flexGrow: 1,
        minWidth: 0,
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
    clearIndicator: (base) => ({
        ...base,
        padding: '0 8px',
        cursor: 'pointer',
        color: '#999',
        '&:hover': { color: '#333' },
    }),
    // главное: меню и портал
    menuPortal: (base) => ({
        ...base,
        zIndex: 9999,               // поднимаем над любыми карточками/листами
    }),
    menu: (base) => ({
        ...base,
        zIndex: 9999,
        maxWidth: 250,
        width: '100%',
    }),
    option: (base, { isFocused, isSelected }) => ({
        ...base,
        backgroundColor: isSelected ? '#e9ecef' : isFocused ? '#f8f9fa' : 'white',
        color: '#212529',
        cursor: 'pointer',
    }),
};

const SearchableSelect: React.FC<Props> = ({
                                               value,
                                               onChange,
                                               options,
                                               placeholder = 'выберите...',
                                               augmentSaved = false,
                                               isSearchable = true,
                                               zIndexMenu, // если захочешь переопределить
                                           }) => {
    const stringValue = value != null ? String(value) : '';

    // 1) статические опции
    const staticOpts: Option[] = options.map((o) => ({
        value: String(o.id),
        label: o.name,
    }));

    // 2) дозаписываем сохранённое значение, если его нет в списке
    const finalOpts: Option[] =
        augmentSaved && stringValue
            ? staticOpts.some((o) => o.value === stringValue)
                ? staticOpts
                : [{ value: stringValue, label: stringValue }, ...staticOpts]
            : staticOpts;

    // 3) выбранный
    const selected: Option | null = finalOpts.find((o) => o.value === stringValue) ?? null;

    // SSR-guard для portal target
    const portalTarget: HTMLElement | undefined =
        typeof document !== 'undefined' ? document.body : undefined;

    return (
        <Select<Option, false>
            isSearchable={isSearchable}
            isClearable
            options={finalOpts}
            value={selected}
            onChange={(opt: SingleValue<Option>) => onChange(opt?.value ?? '')}
            styles={
                zIndexMenu
                    ? {
                        ...customStyles,
                        menuPortal: (base) => ({ ...base, zIndex: zIndexMenu }),
                        menu: (base) => ({ ...base, zIndex: zIndexMenu, maxWidth: 250, width: '100%' }),
                    }
                    : customStyles
            }
            placeholder={placeholder}
            menuPlacement="auto"
            menuPortalTarget={portalTarget}
            menuPosition="fixed"           // важное: фиксированное позиционирование
            menuShouldBlockScroll={true}   // тело не скроллится при открытом меню
            menuShouldScrollIntoView={false}
        />
    );
};

export default SearchableSelect;
