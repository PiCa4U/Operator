import React, {memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import type { UserFieldDef, UserFieldsMap } from "../../types";
import OperatorsSelect from "../select";
import {FieldDefinition} from "../../../../../callControlPanel";
import {registerLocale, setDefaultLocale} from "react-datepicker";
import {ru} from "date-fns/locale";

const TEXTAREA_MAX_HEIGHT = 260;

function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
}

function parseOptions(raw?: string | null): string[] {
    if (!raw) return [];
    const s = String(raw).trim();
    if (!s) return [];

    // JSON array?
    if (s.startsWith("[") && s.endsWith("]")) {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
        } catch {}
    }

    // split newline/comma/;/|
    return s.split(/\r?\n|,|;|\|/g).map((x) => x.trim()).filter(Boolean);
}

function splitMany(v?: string): string[] {
    if (!v) return [];
    return String(v)
        .split(/,|;|\r?\n/g)
        .map((x) => x.trim())
        .filter(Boolean);
}

/**
 * ВАЖНО: компонент вынесен наружу, чтобы НЕ пересоздавался на каждый рендер
 * (иначе React ремоунтит textarea и фокус слетает).
 */
type ChecklistProps = {
    options: string[];
    value: string[];               // выбранные
    disabled?: boolean;
    onChange: (next: string[]) => void;
    maxHeight?: number;
};

const ManyChecklist = memo(function ManyChecklist({
                                                      options,
                                                      value,
                                                      disabled,
                                                      onChange,
                                                      maxHeight = 220,
                                                  }: ChecklistProps) {
    const selected = useMemo(() => new Set(value), [value]);

    return (
        <div
            style={{
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 12,
                padding: 10,
                maxHeight,
                overflowY: "auto",
                background: disabled ? "#f8f9fa" : "#fff",
                opacity: disabled ? 0.75 : 1,
            }}
        >
            <div style={{ display: "grid", gap: 6 }}>
                {options.map((opt) => {
                    const checked = selected.has(opt);
                    return (
                        <label
                            key={opt}
                            className="form-check"
                            style={{ display: "flex", alignItems: "center", gap: 10, margin: 0, cursor: disabled ? "not-allowed" : "pointer" }}
                        >
                            <input
                                className="form-check-input"
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => {
                                    if (disabled) return;
                                    const next = new Set(selected);
                                    if (checked) next.delete(opt);
                                    else next.add(opt);
                                    onChange(Array.from(next));
                                }}
                            />
                            <span style={{ userSelect: "none" }}>{opt}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
});

const AutoTextarea = memo(function AutoTextarea({
                                                    value,
                                                    disabled,
                                                    onValueChange,
                                                }: {
    value: string;
    disabled?: boolean;
    onValueChange: (v: string) => void;
}) {
    const ref = useRef<HTMLTextAreaElement | null>(null);

    useLayoutEffect(() => {
        autosize(ref.current);
    }, [value]);

    return (
        <textarea
            ref={ref}
            className="form-control"
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(e) => {
                onValueChange(e.currentTarget.value);
                autosize(e.currentTarget);
            }}
            style={{ resize: "none", minHeight: 38 }}
        />
    );
});

type Props = {
    defs: UserFieldDef[];
    values: UserFieldsMap;
    onChange: (next: UserFieldsMap) => void;
    loading?: boolean;

    showInactive?: boolean;
    readOnlyInactive?: boolean;

    /**
     * Если передан (даже пустой массив) — показываем ТОЛЬКО выбранные поля.
     * Если не передан — показываем все.
     */
    onlySlugs?: string[];
};

export default function UserFieldsEditor({
                                             defs,
                                             values,
                                             onChange,
                                             loading,
                                             showInactive = false,
                                             readOnlyInactive = true,
                                             onlySlugs,
                                         }: Props) {
    const defsSorted = useMemo(() => {
        const arr = [...(defs || [])].filter((d) => d?.slug);
        arr.sort((a, b) => {
            const da = Number(!a.active) - Number(!b.active);
            if (da) return da;
            return String(a.name).localeCompare(String(b.name), "ru");
        });
        return arr;
    }, [defs]);

    const hasOnly = Array.isArray(onlySlugs);

    const visibleDefs = useMemo(() => {
        // режим "показывать только выбранные"
        if (hasOnly) {
            if (!onlySlugs || onlySlugs.length === 0) return [];
            const bySlug = new Map(defsSorted.map((d) => [d.slug, d]));
            return (onlySlugs || [])
                .map((s) => bySlug.get(s))
                .filter((d): d is UserFieldDef => !!d)
                .filter((d) => (showInactive ? true : d.active));
        }

        // режим "показывать все"
        return defsSorted.filter((d) => (showInactive ? true : d.active));
    }, [defsSorted, showInactive, hasOnly, onlySlugs]);

    const validSlugs = useMemo(() => new Set(defsSorted.map((d) => d.slug)), [defsSorted]);
    const staleKeys = useMemo(
        () => Object.keys(values || {}).filter((k) => k && !validSlugs.has(k)),
        [values, validSlugs]
    );

    const setVal = useCallback(
        (slug: string, v: string) => {
            const next = { ...(values || {}) };
            next[slug] = String(v ?? "");
            onChange(next);
        },
        [values, onChange]
    );

    if (loading) return <div className="text-muted small">Загрузка полей…</div>;

    if (!visibleDefs.length) {
        return (
            <div className="text-muted small">
                {hasOnly ? "Поля не выбраны." : "Поля не найдены."}
            </div>
        );
    }

    return (
        <div>
            {visibleDefs.map((d) => {
                const slug = d.slug;
                const v = values?.[slug] ?? "";
                const disabled = readOnlyInactive && !d.active;

                const opts =
                    d.field_type === "select" || d.field_type === "many" ? parseOptions(d.field_value) : [];

                return (
                    <div key={slug} className="mb-3">
                        <div className="d-flex align-items-start justify-content-between gap-2 mb-1">
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{d.name}</div>
                                {d.description && <div className="text-muted small">{d.description}</div>}
                            </div>

                            {!d.active && (
                                <span className="badge bg-light text-dark border" style={{ flex: "0 0 auto" }}>
                  inactive
                </span>
                            )}
                        </div>

                        {d.field_type === "textarea" && (
                            <AutoTextarea value={v} disabled={disabled} onValueChange={(nv) => setVal(slug, nv)} />
                        )}

                        {d.field_type === "regular" && (
                            <input
                                type="text"
                                className="form-control"
                                value={v}
                                disabled={disabled}
                                onChange={(e) => setVal(slug, e.currentTarget.value)}
                            />
                        )}

                        {d.field_type === "number" && (
                            <input
                                type="number"
                                className="form-control"
                                value={v}
                                disabled={disabled}
                                onChange={(e) => setVal(slug, e.currentTarget.value)}
                            />
                        )}

                        {d.field_type === "date" && (
                            <input
                                type="date"
                                className="form-control"
                                value={v}
                                disabled={disabled}
                                onChange={(e) => setVal(slug, e.currentTarget.value)}
                            />
                        )}

                        {d.field_type === "select" &&
                            (opts.length ? (
                                <OperatorsSelect
                                    value={v ? String(v) : null}
                                    options={opts}                 // opts = string[]
                                    onChange={(val) => setVal(slug, val ?? "")}
                                    placeholder="—"
                                    isClearable
                                    isSearchable
                                    isDisabled={disabled}
                                />
                            ) : (
                                <input
                                    type="text"
                                    className="form-control"
                                    value={v}
                                    disabled={disabled}
                                    onChange={(e) => setVal(slug, e.currentTarget.value)}
                                />
                            ))}

                        {d.field_type === "many" &&
                            (opts.length ? (
                                <ManyChecklist
                                    options={opts}
                                    value={splitMany(v)}
                                    disabled={disabled}
                                    onChange={(arr) => setVal(slug, arr.join(", "))}
                                    maxHeight={220}
                                />
                            ) : (
                                <input
                                    type="text"
                                    className="form-control"
                                    value={v}
                                    disabled={disabled}
                                    onChange={(e) => setVal(slug, e.currentTarget.value)}
                                    placeholder="Например: a, b, c"
                                />
                            ))}
                    </div>
                );
            })}

            {staleKeys.length > 0 && (
                <div className="alert alert-warning mt-3 mb-0">
                    <div className="fw-semibold mb-1">Устаревшие ключи (slug нет в справочнике):</div>
                    <div className="small">
                        {staleKeys.map((k) => (
                            <span key={k} className="badge bg-warning text-dark me-1 mb-1">
                {k}
              </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}