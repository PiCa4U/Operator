import React, {useState, useEffect, useRef} from 'react';
import { FieldDefinition } from "../index";
import SearchableSelect from './select';
import DatePicker, {registerLocale, setDefaultLocale} from 'react-datepicker';
import "../../callsDashboard/picker.css"
import {ru} from "date-fns/locale";
import MapField, {MapFieldMapping} from "./mapField";

// сверху рядом с компонентом
type MapDefaults = Partial<{
    lat:string|number; lon:string|number; q:string;
    country:string; state:string; city:string; city_district:string;
    road:string; house_number:string; postcode:string;
}>;
function parseMapConfig(raw: unknown): { mapping: MapFieldMapping; defaults: MapDefaults } {
    let mapping: MapFieldMapping = {};
    let defaults: MapDefaults = {};
    if (typeof raw === "string" && raw.trim()) {
        try {
            const p = JSON.parse(raw);
            if (p && typeof p === "object" && ("mapping" in p || "defaults" in p)) {
                if (p.mapping && typeof p.mapping === "object") mapping = p.mapping as MapFieldMapping;
                if (p.defaults && typeof p.defaults === "object") defaults = p.defaults as MapDefaults;
            } else if (p && typeof p === "object") {
                defaults = p as MapDefaults;       // простой объект дефолтов
            }
        } catch {}
    }
    return { mapping, defaults };
}


interface EditableFieldsProps {
    params: FieldDefinition[];
    initialValues?: { [fieldId: string]: string };
    onChange: (values: { [fieldId: string]: string }) => void;
    augmentSaved?: boolean;
    compact?: boolean;
}
registerLocale('ru', ru);
setDefaultLocale('ru')
function linkifyParts(text: string): React.ReactNode[] {
    if (!text) return [text];
    const re =
        /(https?:\/\/[^\s]+|www\.[^\s]+|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        if (m.index > last) parts.push(text.slice(last, m.index));
        const raw = m[0];
        const isEmail = raw.includes("@") && !raw.startsWith("http") && !raw.startsWith("www.");
        const href = isEmail ? `mailto:${raw}` : raw.startsWith("http") ? raw : `http://${raw}`;
        parts.push(
            <a key={`${m.index}-${raw}`} href={href} target="_blank" rel="noopener noreferrer">
                {raw}
            </a>
        );
        last = m.index + raw.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

const EditableFields: React.FC<EditableFieldsProps> = ({
                                                           params,
                                                           initialValues = {},
                                                           onChange,
                                                           augmentSaved = false,
                                                           compact = false     // <- дефолт
                                                       }) => {
    const [fieldValues, setFieldValues] = useState<{ [fieldId: string]: string }>(initialValues);

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


    function toIsoDate(raw: string): string {
        // если уже в формате YYYY-MM-DD — возвращаем как есть
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            return raw;
        }
        // пытаемся распарсить dd.MM.yyyy
        const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (m) {
            const [, dd, mm, yyyy] = m;
            return `${yyyy}-${mm}-${dd}`;
        }
        // иначе — пустая строка (или raw, если нужно)
        return "";
    }

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
                            alignItems: param.field_type === 'href' ? 'flex-start' : 'center',
                            marginBottom: '1rem',
                            ...(compact ? { flex: '1 1 calc(50% - 12px)', minWidth: 0 } : {}),
                           }}
                     >
                        {param.field_type !== 'map' && <label
                            style={{
                                whiteSpace: 'nowrap',
                                fontWeight: 400,
                                marginTop: 6,
                                marginRight: '8px'
                            }}
                        >
                            {param.field_name}
                            {param.must_have && <span style={{color: 'red'}}> *</span>}:
                        </label>}
                        {param.field_type === 'regular' && (
                            param.editable ? (
                                <input type="text" {...commonProps} />
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
                                    {linkifyParts(currentValue)}
                                </span>
                            )
                        )}
                        {param.field_type === 'number'  && <input type="number" {...commonProps} />}
                        {param.field_type === 'date'    && <input type="date" className="form-control" value={toIsoDate(currentValue)} onChange={e => handleChange(param.field_id, e.target.value)} />}
                        {param.field_type === 'time'    && <input type="time" {...commonProps} />}

                        {param.field_type === 'map' && (() => {
                            const storeFieldId = param.field_id;
                            const { mapping, defaults } = parseMapConfig(param.field_vals);

                            const isDefaultsOnly = !mapping || Object.keys(mapping).length === 0;
                            const virtualMapping: MapFieldMapping = {
                                lat: "__lat__", lon: "__lon__", q: "__q__",
                                country: "__country__", state: "__state__", city: "__city__",
                                city_district: "__city_district__", road: "__road__",
                                house_number: "__house_number__", postcode: "__postcode__",
                            };
                            const mappingForChild: MapFieldMapping = isDefaultsOnly ? virtualMapping : mapping;

                            let savedObj: Record<string, string> = {};
                            if (isDefaultsOnly) {
                                const raw = (fieldValues[storeFieldId] || "").trim();
                                if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
                                    try { savedObj = JSON.parse(raw) || {}; } catch {}
                                }
                            }

                            const initial: Record<string, string> = {};
                            Object.entries(mappingForChild).forEach(([key, fid]) => {
                                if (!fid) return;
                                const fromForm = fieldValues[fid];                   // явные поля (если mapping задан)
                                const fromSaved = isDefaultsOnly ? String(savedObj[key] ?? "") : ""; // из JSON
                                const fromDef  = (defaults as any)?.[key];
                                initial[fid] = (fromForm ?? fromSaved ?? fromDef ?? "") as string;
                            });

                            const keyByFid: Record<string, string> = Object.fromEntries(
                                Object.entries(mappingForChild).map(([k, fid]) => [String(fid), k])
                            );

                            return (
                                <div style={{ width:"100%" }}>
                                    <label style={{ fontWeight:400, marginBottom:6, display:"inline-block" }}>
                                        {param.field_name}{param.must_have && <span style={{color:'red'}}> *</span>}:
                                    </label>

                                    <MapField
                                        mapping={mappingForChild}
                                        initialValues={initial}
                                        readOnly={!param.editable}
                                        compact={compact}
                                        onPatch={(patch) => {
                                            if (isDefaultsOnly) {
                                                // собираем JSON {lat,lon,q,...} и сохраняем ЕГО в текущее поле карты
                                                const result: Record<string,string> = {};
                                                for (const [fid, v] of Object.entries(patch)) {
                                                    const k = keyByFid[fid];
                                                    if (k) result[k] = String(v ?? "");
                                                }
                                                const json = JSON.stringify(result);

                                                const nextAll = { ...fieldValues, [storeFieldId]: json };
                                                setFieldValues(nextAll);
                                                onChange?.(nextAll);                     // <-- ВСЕ значения, не патч
                                            } else {
                                                // режим явного mapping — разносим по целевым полям
                                                const nextAll = { ...fieldValues, ...patch };
                                                setFieldValues(nextAll);
                                                onChange?.(nextAll);                     // <-- ВСЕ значения, не патч
                                            }
                                        }}
                                    />
                                </div>
                            );
                        })()}

                        {param.field_type === 'textarea' && (
                            param.editable ? (
                                <textarea {...commonProps} />
                            ) : (
                                <span
                                    style={{
                                        whiteSpace: 'normal',
                                        padding: '0.375rem 0.75rem',
                                        backgroundColor: '#e9ecef'
                                    }}
                                >
                                    {/* пункт 4 — см. ниже про разделители строк */}
                                    {currentValue.split(/\r?\n/).map((line, idx) => (
                                        <div key={idx} style={{ padding: '6px 0' }}>
                                            {idx > 0 && <div style={{ borderTop: '1px solid #9ca3af', marginBottom: 6 }} />}
                                            <div style={{ lineHeight: 1.35 }}>{linkifyParts(line || '\u00a0')}</div>
                                        </div>
                                    ))}
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

                                }
                            }

                            if (!links.length) {
                                if (Array.isArray(param.field_vals)) {
                                    links = param.field_vals as any;
                                } else if (typeof param.field_vals === "string") {
                                    try {
                                        const parsed = JSON.parse(param.field_vals);
                                        if (Array.isArray(parsed)) links = parsed;
                                        onChange({[param.field_id]: ""})
                                    } catch {
                                        links = [];
                                    }
                                }
                            }

                            return (

                                        <div style={{
                                                 display: "flex",
                                                 flexDirection: "column",
                                                 gap: "4px",
                                                 flex: 1,
                                                 minWidth: 0,
                                               }}>
                                    {links.map((link, i) => (
                                        <a
                                            key={i}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="form-control"
                                            style={{
                                                display: 'block',
                                                width: '100%',
                                                height:'100%',
                                                whiteSpace: 'normal',
                                                overflowWrap: 'anywhere',
                                                wordBreak: 'break-word',
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
                                    } else {
                                        onChange({ [param.field_id]: "" });
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
