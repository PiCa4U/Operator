import React, {useState, useEffect, useRef, useLayoutEffect} from 'react';
import { FieldDefinition } from "../index";
import SearchableSelect from './select';
import DatePicker, {registerLocale, setDefaultLocale} from 'react-datepicker';
import "../../callsDashboard/picker.css"
import {ru} from "date-fns/locale";
import MapField, {MapFieldMapping} from "./mapField";

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
                defaults = p as MapDefaults;
            }
        } catch {}
    }
    return { mapping, defaults };
}

const TEXTAREA_MAX_HEIGHT = 360;

const MAP_KEYS = [
    "lat",
    "lon",
    "country",
    "state",
    "city",
    "city_district",
    "road",
    "house_number",
    "postcode",
    "q",
] as const;

type MapKey = typeof MAP_KEYS[number];

function autosizeTextarea(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";

    const next = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT);
    el.style.height = `${next}px`;

    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
}
type AutoTextareaProps = {
    value: string;
    onChange: (v: string) => void;
    readOnly?: boolean;
    className?: string;
};

function AutoTextarea({ value, onChange, readOnly, className }: AutoTextareaProps) {
    const ref = useRef<HTMLTextAreaElement | null>(null);

    useLayoutEffect(() => {
        autosizeTextarea(ref.current);
    }, [value]);

    return (
        <textarea
            ref={ref}
            className={className}
            value={value}
            readOnly={readOnly}
            rows={1}
            onChange={(e) => {
                onChange(e.target.value);
                autosizeTextarea(e.currentTarget);
            }}
            style={{
                resize: "none",
                minHeight: 38,
            }}
        />
    );
}

const TEXTAREA_DIVIDER = "\n——\n";

function normalizeNewlines(s: string) {
    return (s ?? "").replace(/\r\n/g, "\n");
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
                                                           compact = false
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
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            return raw;
        }
        const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (m) {
            const [, dd, mm, yyyy] = m;
            return `${yyyy}-${mm}-${dd}`;
        }
        return "";
    }

    const DATE_INPUT_STYLE: React.CSSProperties = {
        width: 170,
        flex: "0 0 auto",
    };

    const TIME_INPUT_STYLE: React.CSSProperties = {
        width: 120,
        flex: "0 0 auto",
    };

    useEffect(() => {
        let changed = false;
        const next = { ...fieldValues };

        for (const param of visibleParams) {
            if (param.field_type !== "map") continue;

            const { mapping, defaults } = parseMapConfig(param.field_vals);
            const isDefaultsOnly = !mapping || Object.keys(mapping).length === 0;
            if (!isDefaultsOnly) continue;

            const storeFieldId = param.field_id;

            let prevObj: Record<string, string> = {};
            const rawPrev = String(next[storeFieldId] || "").trim();
            if (
                (rawPrev.startsWith("{") && rawPrev.endsWith("}")) ||
                (rawPrev.startsWith("[") && rawPrev.endsWith("]"))
            ) {
                try {
                    const p = JSON.parse(rawPrev);
                    if (p && typeof p === "object") prevObj = p as any;
                } catch {}
            }

            const full: Record<string, string> = {};
            for (const k of MAP_KEYS) {
                full[k] = String((prevObj as any)[k] ?? (defaults as any)?.[k] ?? "");
            }

            const json = JSON.stringify(full);

            // не перетираем пустотой, если вообще ничего нет
            const hasAny = Object.values(full).some(v => String(v).trim() !== "");
            if (hasAny && json !== rawPrev) {
                next[storeFieldId] = json;
                changed = true;
            }
        }

        if (changed) {
            setFieldValues(next);
            onChange?.(next);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleParams]);

    function ReadonlyTextareaView({ value }: { value: string }) {
        const v = normalizeNewlines(value);
        const parts = v.split(TEXTAREA_DIVIDER);

        const boxStyle: React.CSSProperties = {
            whiteSpace: "pre-wrap",
            padding: "0.375rem 0.75rem",
            backgroundColor: "#e9ecef",
            border: "1px solid transparent",
            borderRadius: "0.25rem",

            width: "100%",
            maxHeight: TEXTAREA_MAX_HEIGHT,
            overflowY: "auto",

            overflowWrap: "anywhere",
            wordBreak: "break-word",
        };

        // если делимитера нет — просто выводим как есть (НО с linkify)
        if (parts.length <= 1) {
            return <div style={boxStyle}>{linkifyParts(v)}</div>;
        }

        // делим по "\n——\n" и рисуем разделитель только между частями
        return (
            <div style={boxStyle}>
                {parts.map((p, idx) => (
                    <div key={idx} style={{ padding: "6px 0" }}>
                        {idx > 0 && (
                            <div style={{ borderTop: "1px solid #9ca3af", marginBottom: 6 }} />
                        )}
                        <div style={{ lineHeight: 1.35 }}>
                            {linkifyParts(p || "\u00a0")}
                        </div>
                    </div>
                ))}
            </div>
        );
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
                        {param.field_type === "date" && (
                            <input
                                type="date"
                                className="form-control"
                                style={DATE_INPUT_STYLE}
                                value={toIsoDate(currentValue)}
                                onChange={(e) => handleChange(param.field_id, e.target.value)}
                                readOnly={!param.editable}
                            />
                        )}

                        {param.field_type === "time" && (
                            <input
                                type="time"
                                {...commonProps}
                                style={TIME_INPUT_STYLE}
                            />
                        )}
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
                                const fromForm = fieldValues[fid];
                                const fromSaved = isDefaultsOnly ? String(savedObj[key] ?? "") : "";
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
                                                // 1) читаем уже сохранённый объект из storeFieldId (если был)
                                                let prevObj: Record<string, string> = {};
                                                const rawPrev = String(fieldValues[storeFieldId] || "").trim();
                                                if (
                                                    (rawPrev.startsWith("{") && rawPrev.endsWith("}")) ||
                                                    (rawPrev.startsWith("[") && rawPrev.endsWith("]"))
                                                ) {
                                                    try {
                                                        const p = JSON.parse(rawPrev);
                                                        if (p && typeof p === "object") prevObj = p as any;
                                                    } catch {}
                                                }

                                                // 2) собираем ПОЛНЫЙ объект со всеми ключами (пустые строки + defaults)
                                                const full: Record<string, string> = {};
                                                for (const k of MAP_KEYS) {
                                                    full[k] = String((prevObj as any)[k] ?? (defaults as any)?.[k] ?? "");
                                                }

                                                // 3) накатываем patch (обычно он частичный — lat/lon и т.п.)
                                                for (const [fid, v] of Object.entries(patch)) {
                                                    const k = keyByFid[fid] as MapKey | undefined;
                                                    if (k) full[k] = String(v ?? "");
                                                }

                                                const json = JSON.stringify(full);

                                                const nextAll = { ...fieldValues, [storeFieldId]: json };
                                                setFieldValues(nextAll);
                                                onChange?.(nextAll);
                                            } else {
                                                const nextAll = { ...fieldValues, ...patch };
                                                setFieldValues(nextAll);
                                                onChange?.(nextAll);
                                            }
                                        }}
                                    />
                                </div>
                            );
                        })()}
                        {param.field_type === 'textarea' && (
                            param.editable ? (
                                <AutoTextarea
                                    className="form-control"
                                    value={currentValue}
                                    readOnly={!param.editable}
                                    onChange={(v) => handleChange(param.field_id, v)}
                                />
                            ) : (
                                <ReadonlyTextareaView value={String(currentValue ?? "")} />
                            )
                        )}
                        {/*{param.field_type === 'textarea' && (*/}
                        {/*    param.editable ? (*/}
                        {/*        <textarea {...commonProps} />*/}
                        {/*    ) : (*/}
                        {/*        <span*/}
                        {/*            style={{*/}
                        {/*                whiteSpace: 'normal',*/}
                        {/*                padding: '0.375rem 0.75rem',*/}
                        {/*                backgroundColor: '#e9ecef'*/}
                        {/*            }}*/}
                        {/*        >*/}
                        {/*            {currentValue.split(/\r?\n/).map((line, idx) => (*/}
                        {/*                <div key={idx} style={{ padding: '6px 0' }}>*/}
                        {/*                    {idx > 0 && <div style={{ borderTop: '1px solid #9ca3af', marginBottom: 6 }} />}*/}
                        {/*                    <div style={{ lineHeight: 1.35 }}>{linkifyParts(line || '\u00a0')}</div>*/}
                        {/*                </div>*/}
                        {/*            ))}*/}
                        {/*        </span>*/}
                        {/*    )*/}
                        {/*)}*/}

                        {param.field_type === 'select' && (() => {
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

                            const rawField = fieldValues[param.field_id] || "";
                            const trimmed = rawField.trim();
                            let defaultValue = rawField;

                            if (
                                (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                                (trimmed.startsWith("[") && trimmed.endsWith("]"))
                            ) {
                                try {
                                    const parsed = JSON.parse(trimmed);
                                    if (Array.isArray(parsed.options) && parsed.options.length > 0) {
                                        opts = parsed.options;
                                        baseOptionsRef.current = opts
                                    }
                                    if (parsed.select != null) {
                                        defaultValue = Array.isArray(parsed.select)
                                            ? parsed.select.join(",")
                                            : String(parsed.select) || "";
                                        onChange({[param.field_id]: defaultValue})
                                    }
                                } catch {
                                }
                            }
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
                            const rawVals = param.field_vals || "";
                            const baseOpts = rawVals.split(",").map(s => s.trim()).filter(Boolean);

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
                                    if (Array.isArray(parsed.options) && parsed.options.length) {
                                        opts = parsed.options;
                                        baseOptionsRef.current = opts
                                    }
                                    if (parsed.select) {
                                        selectedArr = Array.isArray(parsed.select)
                                            ? parsed.select.map((v: any) => String(v))
                                            : [String(parsed.select)];

                                        onChange({[param.field_id]: selectedArr.join(",")})
                                    }
                                } catch {
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
                            const trimmedField = rawField.trim();

                            let links: Array<{ text: string; url: string }> = [];

                            const parseLinks = (raw: unknown): Array<{ text: string; url: string }> => {
                                if (!raw) return [];

                                // уже готовый массив объектов
                                if (Array.isArray(raw)) {
                                    return raw.filter(
                                        (l): l is { text: string; url: string } =>
                                            l &&
                                            typeof l === "object" &&
                                            typeof (l as any).text === "string" &&
                                            typeof (l as any).url === "string"
                                    );
                                }

                                if (typeof raw === "string") {
                                    let s = raw.trim();
                                    if (!s) return [];

                                    if (!["{", "[", '"'].includes(s[0])) return [];

                                    try {
                                        if (s.startsWith('"') && s.endsWith('"')) {
                                            s = JSON.parse(s);
                                        }

                                        const parsed = JSON.parse(s);
                                        return parseLinks(parsed);
                                    } catch {
                                        return [];
                                    }
                                }

                                if (typeof raw === "object") {
                                    const obj = raw as any;
                                    if (Array.isArray(obj.links)) {
                                        return parseLinks(obj.links);
                                    }
                                }

                                return [];
                            };

                            if (trimmedField) {
                                links = parseLinks(trimmedField);
                            }

                            if (!links.length && param.field_vals) {
                                links = parseLinks(param.field_vals);
                            }

                            baseLinksRef.current = links;

                            if (!links.length) {
                                return null;
                            }

                            return (
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "4px",
                                        flex: 1,
                                        minWidth: 0,
                                    }}
                                >
                                    {links.map((link, i) => (
                                        <a
                                            key={i}
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="form-control"
                                            style={{
                                                display: "block",
                                                width: "100%",
                                                height: "100%",
                                                whiteSpace: "normal",
                                                overflowWrap: "anywhere",
                                                wordBreak: "break-word",
                                            }}
                                        >
                                            {link.text}
                                        </a>
                                    ))}
                                </div>
                            );
                        })()}

                        {param.field_type === 'dates_available' && (() => {
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


                            const rawField = fieldValues[param.field_id] || '';
                            const trimmed = rawField.trim();
                            let selectDateStr: string | null = null;
                            if (
                                (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                                (trimmed.startsWith('[') && trimmed.endsWith(']'))
                            ) {
                                try {
                                    const parsed = JSON.parse(trimmed);
                                    if (Array.isArray(parsed.options) && parsed.options.length > 0) {
                                        dates = parsed.options;
                                        baseOptionsRef.current = dates
                                    }
                                    if (parsed.select != null) {
                                        const raw = Array.isArray(parsed.select)
                                            ? String(parsed.select[0])
                                            : String(parsed.select);

                                        if (raw) {
                                            const [day, month, year] = raw.split('.');

                                            selectDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;


                                            onChange({ [param.field_id]: selectDateStr });
                                        } else {
                                            onChange({ [param.field_id]: "" });
                                        }
                                    } else {
                                        onChange({ [param.field_id]: "" });
                                    }
                                } catch {
                                }
                            }


                            const allowedDates = dates
                                .map(d => {
                                    const [dayStr, monthStr, yearStr] = d.split('.');
                                    const day   = parseInt(dayStr,   10);
                                    const month = parseInt(monthStr, 10) - 1;
                                    const year  = parseInt(yearStr,  10);

                                    const dt = new Date(year, month, day);
                                    return isNaN(dt.getTime()) ? null : dt;
                                })
                                .filter((dt): dt is Date => dt !== null);

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
