import React, {useState, useEffect, useRef} from 'react';
import { FieldDefinition } from "../index";
import SearchableSelect from './select';
import DatePicker, {registerLocale, setDefaultLocale} from 'react-datepicker';
import "../../callsDashboard/picker.css"
import {ru} from "date-fns/locale";


interface EditableFieldsProps {
    params: FieldDefinition[];
    initialValues?: { [fieldId: string]: string };
    onChange: (values: { [fieldId: string]: string }) => void;
    augmentSaved?: boolean;
    compact?: boolean;
}
registerLocale('ru', ru);
setDefaultLocale('ru')
const EditableFields: React.FC<EditableFieldsProps> = ({
                                                           params,
                                                           initialValues = {},
                                                           onChange,
                                                           augmentSaved = false,
                                                           compact = false     // <- дефолт
                                                       }) => {
    const [fieldValues, setFieldValues] = useState<{ [fieldId: string]: string }>(initialValues);
    useEffect(() => console.log("fieldValues: ", fieldValues),[fieldValues])
    const visibleParams = params.filter(param => !param.deleted);
    const baseOptionsRef = useRef<string[]>([]);
    const baseLinksRef = useRef<any[]>([]);
    const overrideOptionsRef = useRef(null);
    useEffect(() => {
        setFieldValues(initialValues);
    }, [initialValues]);

    const handleChange = (fieldId: string, newValue: string) => {
        const newValues = { ...fieldValues, [fieldId]: newValue };
        setFieldValues(newValues);
        onChange?.(newValues);
    };

    return (
        <div
            style={
                compact
                    ? {
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '16px'
                    }
                    : {}
            }
        >
            {visibleParams.map(param => {
                const currentValue = fieldValues[param.field_id] || '';

                const commonProps = {
                    className: "form-control",
                    value: currentValue,
                    onChange: (e: React.ChangeEvent<any>) =>
                        handleChange(param.field_id, e.target.value),
                    readOnly: !param.editable,
                };

                return (
                    <div
                        key={param.id}
                        className="form-group"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '1rem',
                            ...(compact
                                ? { flex: '1 1 calc(50% - 12px)', minWidth: 0 }
                                : {})
                        }}
                    >
                        <label
                            style={{
                                whiteSpace: 'nowrap',
                                fontWeight: 400,
                                fontSize: '16px',
                                marginRight: '8px'
                            }}
                        >
                            {param.field_name}
                            {param.must_have && <span style={{ color: 'red' }}> *</span>}:
                        </label>
                        {param.field_type === 'regular' && (
                            param.editable ? (
                                <input
                                    type="text"
                                    {...commonProps}
                                />
                            ) : (
                                <span
                                    style={{
                                        whiteSpace: 'pre-wrap',
                                        display: 'block',
                                        padding: '0.375rem 0.75rem',
                                        border: '1px solid transparent',
                                        borderRadius: '0.25rem',
                                        backgroundColor: '#e9ecef'
                                    }}
                                >
                                    {currentValue}
                                </span>
                            )
                        )}
                        {param.field_type === 'number'  && <input type="number" {...commonProps} />}
                        {param.field_type === 'date'    && <input type="date" {...commonProps} />}
                        {param.field_type === 'time'    && <input type="time" {...commonProps} />}
                        {/* Textarea */}
                        {param.field_type === 'textarea' && (
                            param.editable ? (
                                <textarea
                                    {...commonProps}
                                />
                            ) : (
                                <span
                                    style={{
                                        whiteSpace: 'pre-wrap',
                                        display: 'block',
                                        padding: '0.375rem 0.75rem',
                                        border: '1px solid transparent',
                                        borderRadius: '0.25rem',
                                        backgroundColor: '#e9ecef'
                                    }}
                                >
                                    {currentValue}
                                </span>
                            )
                        )}
                        {param.field_type === 'select' && (() => {
                            // 1) Парсим дефолтные опции из param.field_vals
                            const rawVals = param.field_vals || "";
                            const splitVals = rawVals.includes("|_|_|")
                                ? rawVals.split("|_|_|")
                                : rawVals.split(",");
                            let opts
                            if (!baseOptionsRef.current.length) {
                                opts = splitVals.map(s => s.trim()).filter(Boolean);
                            } else {
                                opts = baseOptionsRef.current
                            }

                            // 2) Проверяем, что в fieldValues лежит JSON-объект
                            const rawField = fieldValues[param.field_id] || "";
                            const trimmed = rawField.trim();
                            let defaultValue = rawField;

                            if (
                                (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                                (trimmed.startsWith("[") && trimmed.endsWith("]"))
                            ) {
                                try {
                                    const parsed = JSON.parse(trimmed);
                                    // если в объекте есть options — перезаписываем список
                                    if (Array.isArray(parsed.options) && parsed.options.length > 0) {
                                        opts = parsed.options;
                                        baseOptionsRef.current = opts
                                    }
                                    // если в объекте есть select — это наше выбранное значение
                                    if (parsed.select != null) {
                                        defaultValue = Array.isArray(parsed.select)
                                            ? parsed.select.join(",")
                                            : String(parsed.select) || "";
                                        onChange({[param.field_id]: defaultValue})
                                    }
                                } catch {
                                    // невалидный JSON — игнорируем
                                }
                            }
                            console.log("opts: ", opts)
                            // 3) Формируем final options и рендерим SearchableSelect
                            const options = [{ id: "", name: "" }, ...opts.map((o: any) => ({ id: o, name: o }))];

                            return (
                                <SearchableSelect
                                    value={defaultValue}
                                    onChange={val => handleChange(param.field_id, val)}
                                    options={options}
                                    placeholder="Выберите..."
                                    augmentSaved={augmentSaved}
                                />
                            );
                        })()}

                        {param.field_type === 'checkbox' && (
                            <div className="form-check" style={{ marginLeft: '8px' }}>
                                <input
                                    type="checkbox"
                                    className="form-check-input"
                                    id={`checkbox_${param.id}`}
                                    checked={currentValue === 'true'}
                                    disabled={!param.editable}
                                    onChange={e =>
                                        handleChange(param.field_id, e.target.checked ? 'true' : 'false')
                                    }
                                />
                                <label className="form-check-label" htmlFor={`checkbox_${param.id}`}>
                                    {param.field_vals || 'Выбрать'}
                                </label>
                            </div>
                        )}

                        {param.field_type === 'radio' && (
                            <>
                                {param.field_vals?.split(',').map((opt, idx) => (
                                    <div
                                        className="form-check"
                                        key={idx}
                                        style={{ marginRight: '10px', marginLeft: '8px' }}
                                    >
                                        <input
                                            type="radio"
                                            className="form-check-input"
                                            id={`radio_${param.id}_${idx}`}
                                            name={param.field_id}
                                            value={opt}
                                            checked={currentValue === opt}
                                            disabled={!param.editable}
                                            onChange={e => handleChange(param.field_id, e.target.value)}
                                        />
                                        <label
                                            className="form-check-label"
                                            htmlFor={`radio_${param.id}_${idx}`}
                                        >
                                            {opt}
                                        </label>
                                    </div>
                                ))}
                            </>
                        )}

                        {param.field_type === 'many' && (() => {
                            // 1) Сначала дефолтные варианты из param.field_vals
                            const rawVals = param.field_vals || "";
                            const baseOpts = rawVals.split(",").map(s => s.trim()).filter(Boolean);

                            // 2) Попробуем распарсить JSON из fieldValues
                            const rawField = fieldValues[param.field_id] || "";
                            const trimmed = rawField.trim();
                            let opts
                            if (!baseOptionsRef.current.length) {
                                opts = baseOpts
                            } else {
                                opts = baseOptionsRef.current
                            }
                            let selectedArr: string[] = rawField
                                .split(",")
                                .map(v => v.trim())
                                .filter(Boolean);

                            if (
                                (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                                (trimmed.startsWith("[") && trimmed.endsWith("]"))
                            ) {
                                try {
                                    const parsed = JSON.parse(trimmed);
                                    // если есть options — используем их
                                    if (Array.isArray(parsed.options) && parsed.options.length) {
                                        opts = parsed.options;
                                        baseOptionsRef.current = opts
                                    }
                                    // если есть select — берём массив
                                    if (parsed.select) {
                                        selectedArr = Array.isArray(parsed.select)
                                            ? parsed.select.map((v: any) => String(v))
                                            : [String(parsed.select)];

                                        onChange({[param.field_id]: selectedArr.join(",")})
                                    }
                                } catch {
                                    // не JSON — игнор
                                }
                            }

                            return (
                                <div style={{ marginLeft: "8px" }}>
                                    {opts.map((opt: any, idx: any) => {
                                        const isChecked = selectedArr.includes(opt);
                                        return (
                                            <div className="form-check" key={idx} style={{ marginRight: "10px" }}>
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    id={`many_${param.id}_${idx}`}
                                                    value={opt}
                                                    checked={isChecked}
                                                    disabled={!param.editable}
                                                    onChange={e => {
                                                        const next = e.target.checked
                                                            ? [...selectedArr, opt]
                                                            : selectedArr.filter(v => v !== opt);
                                                        handleChange(param.field_id, next.join(","));
                                                    }}
                                                />
                                                <label className="form-check-label" htmlFor={`many_${param.id}_${idx}`}>
                                                    {opt}
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}

                        {param.field_type === 'href' && (() => {
                            const rawField = fieldValues[param.field_id] || "";
                            const trimmed = rawField.trim();
                            let links: Array<{ text: string; url: string }> = [];

                            // 1) попытка распарсить JSON из values (модуль мог туда положить JSON.stringify([...]))
                            if (baseLinksRef.current.length) {
                                links = baseLinksRef.current

                            }
                            if (
                                (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                                (trimmed.startsWith("[") && trimmed.endsWith("]"))
                            ) {
                                try {
                                    const parsed = JSON.parse(trimmed);
                                    if (Array.isArray(parsed)) {
                                        links = parsed;
                                        baseLinksRef.current = links
                                        onChange({[param.field_id]: ""})
                                    }

                                } catch {
                                    // невалидный JSON — игнорируем
                                }
                            }

                            // 2) если из values не получилось, берём из param.field_vals
                            if (!links.length) {
                                if (Array.isArray(param.field_vals)) {
                                    links = param.field_vals as any;
                                } else if (typeof param.field_vals === "string") {
                                    try {
                                        const parsed = JSON.parse(param.field_vals);
                                        if (Array.isArray(parsed)) links = parsed;
                                        onChange({[param.field_id]: ""})
                                    } catch {
                                        // если и здесь не JSON — ничего не показываем
                                        links = [];
                                    }
                                }
                            }

                            return (
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    {links.map((link, i) => (
                                        <a
                                            key={i}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="form-control"
                                            style={{
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {link.text}
                                        </a>
                                    ))}
                                </div>
                            );
                        })()}


                        {param.field_type === 'dates_available' && (() => {
                            // 1) default из param.field_vals (строка JSON или CSV)
                            let dates: string[] = [] ;
                            if(!baseOptionsRef.current.length) {
                                if (Array.isArray(param.field_vals)) {
                                    dates = param.field_vals;
                                } else if (typeof param.field_vals === 'string') {
                                    try {
                                        dates = JSON.parse(param.field_vals);
                                        if (!Array.isArray(dates)) dates = [];
                                    } catch {
                                        // fallback: comma-separated
                                        dates = param.field_vals.split(',').map(s => s.trim()).filter(Boolean);
                                    }
                                }
                            } else {
                                dates = baseOptionsRef.current
                            }


                            // 2) проверка JSON в fieldValues
                            const rawField = fieldValues[param.field_id] || '';
                            const trimmed = rawField.trim();
                            let selectDateStr: string | null = null;
                            if (
                                (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                                (trimmed.startsWith('[') && trimmed.endsWith(']'))
                            ) {
                                try {
                                    const parsed = JSON.parse(trimmed);
                                    // если есть options — заменяем
                                    if (Array.isArray(parsed.options) && parsed.options.length > 0) {
                                        dates = parsed.options;
                                        console.log("333dates: ", dates)
                                        baseOptionsRef.current = dates
                                    }
                                    // если есть select — запоминаем
                                    if (parsed.select != null) {
                                        // 1) Получаем "сырую" дату из parsed.select
                                        const raw = Array.isArray(parsed.select)
                                            ? String(parsed.select[0])
                                            : String(parsed.select);

                                        if (raw) {
                                            const [day, month, year] = raw.split('.');

                                            // 3) Собираем ISO-строку "ГГГГ-ММ-ДД"
                                            selectDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

                                            console.log("selectDateStr (ISO):", selectDateStr);

                                            // 4) Передаем в родительский onChange уже в нужном формате
                                            onChange({ [param.field_id]: selectDateStr });
                                        } else {
                                            onChange({ [param.field_id]: "" });
                                        }
                                    }
                                } catch {
                                    // не JSON — игнорируем
                                }
                            }


                            const allowedDates = dates
                                .map(d => {
                                    // разбиваем строку "06.07.2025" на [ "06", "07", "2025" ]
                                    const [dayStr, monthStr, yearStr] = d.split('.');
                                    const day   = parseInt(dayStr,   10);
                                    const month = parseInt(monthStr, 10) - 1; // месяцы в JS — от 0 до 11
                                    const year  = parseInt(yearStr,  10);

                                    const dt = new Date(year, month, day);
                                    return isNaN(dt.getTime()) ? null : dt;
                                })
                                .filter((dt): dt is Date => dt !== null);

                            // 4) выбранная дата: из selectDateStr или из currentValue
                            const baseValue = selectDateStr ?? (fieldValues[param.field_id] || '');
                            const selectedDate = (() => {
                                const dt = new Date(baseValue);
                                return isNaN(dt.getTime()) ? null : dt;
                            })();

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <DatePicker
                                        selected={selectedDate}
                                        onChange={date => {
                                            if (!(date instanceof Date)) return;
                                            const day   = String(date.getDate()).padStart(2,'0');
                                            const month = String(date.getMonth()+1).padStart(2,'0');
                                            const year  = date.getFullYear();
                                            const iso   = `${year}-${month}-${day}`;
                                            handleChange(param.field_id, iso);
                                        }}
                                        includeDates={allowedDates}
                                        dateFormat="dd.MM.yyyy"
                                        locale="ru"
                                        placeholderText="Выберите дату..."
                                        className="form-control"
                                        readOnly={!param.editable}
                                    />
                                </div>
                            );
                        })()}

                        {param.field_type === 'non_editable' && (
                            <input
                                type="text"
                                className="form-control"
                                value={currentValue}
                                readOnly
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default EditableFields;
