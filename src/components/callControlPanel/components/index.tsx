import React, {useState, useEffect, useRef, useLayoutEffect, memo, useMemo} from 'react';
import { FieldDefinition } from "../index";
import SearchableSelect from './select';
import DatePicker, {registerLocale, setDefaultLocale} from 'react-datepicker';
import "../../callsDashboard/picker.css"
import {ru} from "date-fns/locale";
import MapField, {MapFieldMapping} from "./mapField";

type MapDefaults = Partial<{
    lat: string | number;
    lon: string | number;
    q: string;
    country: string;
    state: string;
    city: string;
    city_district: string;
    road: string;
    house_number: string;
    postcode: string;
}>;

type MapOverlayConfig = Partial<{
    type: "kml";
    url: string;
    field_id: string;
    fitBounds: boolean;
}>;

function tryParseJson<T = any>(value: unknown): T | null {
    if (typeof value !== "string") return null;
    const s = value.trim();
    if (!s) return null;

    try {
        return JSON.parse(s) as T;
    } catch {
        return null;
    }
}

function normalizeLooseObjectString(raw: string): string {
    let s = raw.trim();

    // если это строка вида "{defaults:{},overlay:{...}}"
    // убираем внешние кавычки
    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
    ) {
        s = s.slice(1, -1).trim();
    }

    // ключи без кавычек -> в кавычки
    s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // type:kml -> type:"kml"
    s = s.replace(/("type"\s*:\s*)(kml)(?=\s*[,}])/g, '$1"$2"');

    // url:https://... -> url:"https://..."
    s = s.replace(/("url"\s*:\s*)(https?:\/\/[^,}]+)/g, '$1"$2"');

    return s;
}

function parseMapConfig(raw: unknown): {
    mapping: MapFieldMapping;
    defaults: MapDefaults;
    overlay?: MapOverlayConfig;
} {
    let mapping: MapFieldMapping = {};
    let defaults: MapDefaults = {};
    let overlay: MapOverlayConfig | undefined;

    if (raw == null) {
        return { mapping, defaults, overlay };
    }

    let parsed: any = raw;

    // 1) если это строка -> пробуем JSON.parse
    if (typeof parsed === "string") {
        const first = tryParseJson(parsed);
        if (first != null) {
            parsed = first;
        }
    }

    // 2) если после первого parse всё ещё строка -> возможно это
    // "{defaults:{},overlay:{type:kml,url:https://...}}"
    if (typeof parsed === "string") {
        const normalized = normalizeLooseObjectString(parsed);
        const second = tryParseJson(normalized);
        if (second != null) {
            parsed = second;
        }
    }

    // 3) если это уже объект нужного формата
    if (
        parsed &&
        typeof parsed === "object" &&
        ("mapping" in parsed || "defaults" in parsed || "overlay" in parsed)
    ) {
        if (parsed.mapping && typeof parsed.mapping === "object") {
            mapping = parsed.mapping as MapFieldMapping;
        }
        if (parsed.defaults && typeof parsed.defaults === "object") {
            defaults = parsed.defaults as MapDefaults;
        }
        if (parsed.overlay && typeof parsed.overlay === "object") {
            overlay = parsed.overlay as MapOverlayConfig;
        }

        return { mapping, defaults, overlay };
    }

    // 4) если это просто defaults-объект старого формата
    if (parsed && typeof parsed === "object") {
        defaults = parsed as MapDefaults;
    }

    return { mapping, defaults, overlay };
}

function splitOptions(raw: string): string[] {
    if (!raw) return [];
    return (raw.includes("|_|_|") ? raw.split("|_|_|") : raw.split(","))
        .map(s => String(s).trim())
        .filter(Boolean);
}

function isJsonLike(raw: string): boolean {
    const s = raw.trim();
    return (
        (s.startsWith("{") && s.endsWith("}")) ||
        (s.startsWith("[") && s.endsWith("]"))
    );
}

function parseManyValue(rawField: string, rawFieldVals: string | null) {
    const baseOptions = splitOptions(rawFieldVals || "");
    const trimmed = String(rawField || "").trim();

    let options = baseOptions;
    let selected: string[] = [];

    if (isJsonLike(trimmed)) {
        try {
            const parsed = JSON.parse(trimmed);

            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                if (Array.isArray(parsed.options)) {
                    options = parsed.options.map((v: any) => String(v).trim()).filter(Boolean);
                }

                if (parsed.select != null) {
                    selected = Array.isArray(parsed.select)
                        ? parsed.select.map((v: any) => String(v).trim()).filter(Boolean)
                        : [String(parsed.select).trim()].filter(Boolean);
                }
            } else if (Array.isArray(parsed)) {
                selected = parsed.map((v: any) => String(v).trim()).filter(Boolean);
            }
        } catch {
            selected = splitOptions(rawField);
        }
    } else {
        selected = splitOptions(rawField);
    }

    return { options, selected };
}

function buildManyStoredValue(rawField: string, options: string[], selected: string[]): string {
    const trimmed = String(rawField || "").trim();

    if (isJsonLike(trimmed)) {
        try {
            const parsed = JSON.parse(trimmed);

            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return JSON.stringify({
                    ...parsed,
                    options,
                    select: selected,
                });
            }
        } catch {}
    }

    return selected.join(",");
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

    const visibleParams = useMemo(() => params.filter(param => !param.deleted), [params]);
    const baseOptionsRef = useRef<Record<string, string[]>>({});
    const baseLinksRef = useRef<any[]>([]);
    const overrideOptionsRef = useRef(null);

    useEffect(() => {
        setFieldValues((prev) => {
            const next = initialValues ?? {};
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(next);

            if (
                prevKeys.length === nextKeys.length &&
                nextKeys.every((k) => String(prev[k] ?? "") === String(next[k] ?? ""))
            ) {
                return prev;
            }

            return { ...next };
        });
    }, [initialValues]);

    const handleChange = (fieldId: string, newValue: string) => {
        setFieldValues((prev) => {
            if (String(prev[fieldId] ?? "") === String(newValue ?? "")) {
                return prev;
            }

            const newValues = { ...prev, [fieldId]: newValue };
            onChange?.(newValues);
            return newValues;
        });
    };

    useEffect(() => {
        let changed = false;
        const next = { ...fieldValues };

        for (const param of visibleParams) {
            if (param.field_type !== "select" && param.field_type !== "dates_available") continue;

            const fieldId = param.field_id;
            const rawField = String(next[fieldId] ?? "");
            const trimmed = rawField.trim();
            if (!isJsonLike(trimmed)) continue;

            const parsed = tryParseJson<any>(trimmed);
            if (!parsed || typeof parsed !== "object") continue;

            if (Array.isArray(parsed.options) && parsed.options.length > 0) {
                baseOptionsRef.current[fieldId] = parsed.options
                    .map((v: any) => String(v).trim())
                    .filter(Boolean);
            }

            if (param.field_type === "select") {
                if (parsed.select == null) continue;

                const normalized = Array.isArray(parsed.select)
                    ? parsed.select.join(",")
                    : String(parsed.select ?? "");

                if (normalized !== rawField) {
                    next[fieldId] = normalized;
                    changed = true;
                }
                continue;
            }

            let normalizedDate = "";
            if (parsed.select != null) {
                const raw = Array.isArray(parsed.select)
                    ? String(parsed.select[0] ?? "")
                    : String(parsed.select ?? "");

                if (raw) {
                    const [day, month, year] = raw.split(".");
                    if (day && month && year) {
                        normalizedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
                    }
                }
            }

            if (normalizedDate !== rawField) {
                next[fieldId] = normalizedDate;
                changed = true;
            }
        }

        if (changed) {
            setFieldValues(next);
            onChange?.(next);
        }
    }, [fieldValues, visibleParams, onChange]);


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
                const stableParamId = String(param.id ?? param.field_id);

                const commonProps = {
                    className: "form-control",
                    value: currentValue,
                    onChange: (e: React.ChangeEvent<any>) =>
                        handleChange(param.field_id, e.target.value),
                    readOnly: !param.editable,
                };

                return (
                    <div
                        key={stableParamId}
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
                            const { mapping, defaults, overlay } = parseMapConfig(param.field_vals);
                            const isDefaultsOnly = !mapping || Object.keys(mapping).length === 0;
                            const virtualMapping: MapFieldMapping = {
                                lat: "__lat__", lon: "__lon__", q: "__q__",
                                country: "__country__", state: "__state__", city: "__city__",
                                city_district: "__city_district__", road: "__road__",
                                house_number: "__house_number__", postcode: "__postcode__",
                            };
                            const mappingForChild: MapFieldMapping = isDefaultsOnly ? virtualMapping : mapping;

                            const overlayUrl =
                                String(
                                    overlay?.field_id
                                        ? fieldValues[overlay.field_id] || initialValues[overlay.field_id] || ""
                                        : overlay?.url || ""
                                ).trim();

                            const fitKmlBounds = overlay?.fitBounds ?? true;

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
                                        fitKmlBounds={fitKmlBounds}
                                        overlayUrl={overlayUrl}
                                        onPatch={(patch) => {
                                            if (isDefaultsOnly) {
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

                                                const full: Record<string, string> = {};
                                                for (const k of MAP_KEYS) {
                                                    full[k] = String((prevObj as any)[k] ?? (defaults as any)?.[k] ?? "");
                                                }

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
                            const cacheKey = String(param.field_id);
                            const rawVals = param.field_vals || "";
                            const splitVals = rawVals.includes("|_|_|")
                                ? rawVals.split("|_|_|")
                                : rawVals.split(",");
                            let opts: string[];
                            const cachedOptions = baseOptionsRef.current[cacheKey];
                            if (!cachedOptions?.length) {
                                opts = splitVals.map(s => s.trim()).filter(Boolean);
                            } else {
                                opts = cachedOptions;
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
                                        opts = parsed.options.map((o: any) => String(o).trim()).filter(Boolean);
                                        baseOptionsRef.current[cacheKey] = opts;
                                    }
                                    if (parsed.select != null) {
                                        defaultValue = Array.isArray(parsed.select)
                                            ? parsed.select.join(",")
                                            : String(parsed.select) || "";
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
                                    id={`checkbox_${stableParamId}`}
                                    checked={currentValue === 'true'}
                                    disabled={!param.editable}
                                    onChange={e =>
                                        handleChange(param.field_id, e.target.checked ? 'true' : 'false')
                                    }
                                />
                                <label className="form-check-label" htmlFor={`checkbox_${stableParamId}`}>
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
                                            id={`radio_${stableParamId}_${idx}`}
                                            name={stableParamId}
                                            value={opt}
                                            checked={currentValue === opt}
                                            disabled={!param.editable}
                                            onChange={e => handleChange(param.field_id, e.target.value)}
                                        />
                                        <label
                                            className="form-check-label"
                                            htmlFor={`radio_${stableParamId}_${idx}`}
                                        >
                                            {opt}
                                        </label>
                                    </div>
                                ))}
                            </>
                        )}

                        {param.field_type === 'many' && (() => {
                            const rawField = fieldValues[param.field_id] || "";
                            const { options, selected } = parseManyValue(rawField, param.field_vals);
                            const stableParamId = String(param.id ?? param.field_id);

                            return (
                                <div style={{ marginLeft: "8px" }}>
                                    {options.map((opt, idx) => {
                                        const isChecked = selected.includes(opt);
                                        const inputId = `many_${stableParamId}_${idx}`;

                                        return (
                                            <div className="form-check" key={inputId} style={{ marginRight: "10px" }}>
                                                <input
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    id={inputId}
                                                    value={opt}
                                                    checked={isChecked}
                                                    disabled={!param.editable}
                                                    onChange={e => {
                                                        const next = e.target.checked
                                                            ? [...selected, opt]
                                                            : selected.filter(v => v !== opt);

                                                        const nextValue = buildManyStoredValue(rawField, options, next);
                                                        handleChange(param.field_id, nextValue);
                                                    }}
                                                />
                                                <label className="form-check-label" htmlFor={inputId}>
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
                            const cacheKey = String(param.field_id);
                            let dates: string[] = [] ;
                            const cachedDates = baseOptionsRef.current[cacheKey];
                            if(!cachedDates?.length) {
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
                                dates = cachedDates;
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
                                        dates = parsed.options.map((d: any) => String(d).trim()).filter(Boolean);
                                        baseOptionsRef.current[cacheKey] = dates;
                                    }
                                    if (parsed.select != null) {
                                        const raw = Array.isArray(parsed.select)
                                            ? String(parsed.select[0])
                                            : String(parsed.select);

                                        if (raw) {
                                            const [day, month, year] = raw.split('.');

                                            selectDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                        }
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
