import React, { useEffect, useMemo, useState } from "react";
import type { UserFieldDef } from "../../types";
import OperatorsSelect, { type Option as SelectOption } from "../select";
import {CloseIconButton} from "../operatorModal";
type UpdateUserFieldDefPatch = Partial<
    Pick<UserFieldDef, "description" | "field_type" | "field_value" | "active">
> & { name?: any }; // на всякий случай, если где-то старый код ещё шлёт name


type Props = {
    open: boolean;
    defs: UserFieldDef[];
    loading?: boolean;
    onClose: () => void;

    onCreateClick?: () => void; // открыть CreateUserFieldModal
    onUpdate?: (id: number, patch: UpdateUserFieldDefPatch) => Promise<void> | void;

    // добавить поле оператору (просто подключить slug)
    onAddToOperator?: (slug: string) => void;
};

const TYPE_OPTIONS: Array<{ value: UserFieldDef["field_type"]; label: string }> = [
    { value: "regular", label: "Строка" },
    { value: "textarea", label: "Текст" },
    { value: "select", label: "Единственный выбор" },
    { value: "many", label: "Множественный выбор" },
    { value: "number", label: "Число" },
    { value: "date", label: "Дата" },
];

const TYPE_OPTIONS_KV: SelectOption[] = TYPE_OPTIONS.map((o) => ({
    value: String(o.value),
    label: o.label,
}));
function valueLabelByType(t: UserFieldDef["field_type"]) {
    if (t === "select" || t === "many") return "Варианты";
    return "Значение по умолчанию";
}

function valueHelpByType(t: UserFieldDef["field_type"]) {
    if (t === "select" || t === "many") {
        return "Для одиночного/множественного выбора укажи варианты: каждый вариант с новой строки или через запятую.";
    }
    return "Опционально. Если не нужно — оставь пустым.";
}

export default function UserFieldsManagerModal({
                                                   open,
                                                   defs,
                                                   loading,
                                                   onClose,
                                                   onCreateClick,
                                                   onUpdate,
                                                   onAddToOperator,
                                               }: Props) {
    const [q, setQ] = useState("");
    const [showInactive, setShowInactive] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);

    const selected = useMemo(() => {
        if (!selectedId) return null;
        return defs.find((d) => d.id === selectedId) || null;
    }, [defs, selectedId]);

    const [formName, setFormName] = useState("");
    const [formDesc, setFormDesc] = useState("");
    const [formType, setFormType] = useState<UserFieldDef["field_type"]>("regular");
    const [formValue, setFormValue] = useState("");
    const [formActive, setFormActive] = useState(true);

    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setQ("");
        setShowInactive(false);
        setSelectedId(null);
        setErr(null);
        setSaving(false);
    }, [open]);

    useEffect(() => {
        if (!selected) return;
        setFormName(String(selected.name || ""));
        setFormDesc(String(selected.description ?? ""));
        setFormType(selected.field_type);
        setFormValue(String(selected.field_value ?? ""));
        setFormActive(Boolean(selected.active));
        setErr(null);
    }, [selectedId]); // намеренно только по смене выбора

    const filtered = useMemo(() => {
        const qq = q.trim().toLowerCase();
        return (defs || [])
            .filter((d) => (showInactive ? true : d.active))
            .filter((d) => {
                if (!qq) return true;
                const hay = `${d.name} ${d.description ?? ""} ${d.slug}`.toLowerCase();
                return hay.includes(qq);
            })
            .sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
    }, [defs, q, showInactive]);

    const buildPatch = (): UpdateUserFieldDefPatch => {
        if (!selected) return {};

        const patch: UpdateUserFieldDefPatch = {};

        const origDesc = String(selected.description ?? "");
        const nextDescTrimmed = formDesc.trim();
        const origDescTrimmed = origDesc.trim();
        // если было что-то и стало пусто -> отправляем null (по swagger это сброс)
        if (nextDescTrimmed !== origDescTrimmed) patch.description = nextDescTrimmed ? nextDescTrimmed : null;

        if (formType !== selected.field_type) patch.field_type = formType;

        const origVal = String(selected.field_value ?? "");
        if (formValue !== origVal) patch.field_value = formValue.trim() ? formValue : null;

        if (formActive !== Boolean(selected.active)) patch.active = formActive;

        return patch;
    };

    const hasChanges = useMemo(() => {
        const p = buildPatch();
        return Object.keys(p).length > 0;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, formName, formDesc, formType, formValue, formActive]);

    if (!open) return null;

    return (
        <div
            className="modal d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            style={{
                background: "rgba(0,0,0,.55)",
                position: "fixed",
                inset: 0,
                overflowY: "auto",
                padding: 16,
                zIndex: 1500,
            }}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="modal-dialog" role="document" style={{ maxWidth: 980, margin: "0 auto" }}>
                <div className="modal-content" style={{ maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column" }}>
                    <div className="modal-header">
                        <h5 className="modal-title">Редактор пользовательских полей</h5>
                        <CloseIconButton onClick={onClose} />
                    </div>

                    <div className="modal-body" style={{ overflow: "auto" }}>
                        {err && <div className="alert alert-danger py-2">{err}</div>}

                        <div className="row g-3">
                            {/* LEFT: list */}
                            <div className="col-12 col-md-5">
                                <div className="d-flex gap-2 mb-2">
                                    <input
                                        className="form-control"
                                        value={q}
                                        onChange={(e) => setQ(e.currentTarget.value)}
                                        placeholder="Поиск по имени/описанию"
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary"
                                        onClick={() => setShowInactive((v) => !v)}
                                        title="Показывать inactive"
                                    >
                                        {showInactive ? "Скрыть удалённые" : "Показать удалённые"}
                                    </button>
                                </div>

                                <div
                                    className="list-group"
                                    style={{
                                        maxHeight: "60vh",
                                        overflow: "auto",
                                        border: "1px solid rgba(0,0,0,0.08)",
                                        borderRadius: 8,
                                    }}
                                >
                                    {loading && <div className="p-3 text-muted small">Загрузка…</div>}

                                    {!loading && filtered.length === 0 && (
                                        <div className="p-3 text-muted small">Ничего не найдено</div>
                                    )}

                                    {!loading &&
                                        filtered.map((d) => {
                                            const active = Boolean(d.active);
                                            const isSel = d.id && d.id === selectedId;
                                            return (
                                                <button
                                                    key={d.id ?? d.slug}
                                                    type="button"
                                                    className={`list-group-item list-group-item-action ${isSel ? "active" : ""}`}
                                                    onClick={() => setSelectedId(d.id ?? null)}
                                                    style={{ textAlign: "left" }}
                                                >
                                                    <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{d.name}</div>
                                                    {d.description && <div className={`small ${isSel ? "text-white-50" : "text-muted"}`}>{d.description}</div>}
                                                    {!active && (
                                                        <div className="mt-1">
                                                            <span className={`badge ${isSel ? "bg-light text-dark" : "bg-light text-dark border"}`}>Удалённый</span>
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                </div>

                                <div className="d-flex gap-2 mt-3">
                                    {onCreateClick && (
                                        <button type="button" className="btn btn-outline-success" onClick={onCreateClick}>
                                            + Создать поле
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* RIGHT: editor */}
                            <div className="col-12 col-md-7">
                                {!selected && (
                                    <div className="text-muted">
                                        Выбери поле слева — справа откроется редактор.
                                    </div>
                                )}

                                {selected && (
                                    <div
                                        style={{
                                            border: "1px solid rgba(0,0,0,0.08)",
                                            borderRadius: 8,
                                            padding: 12,
                                            background: "#fff",
                                        }}
                                    >
                                        <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{selected.name}</div>
                                                <div className="text-muted small">slug: {selected.slug}</div>
                                            </div>

                                            <div className="d-flex gap-2" style={{ flex: "0 0 auto" }}>
                                                {onAddToOperator && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline-primary btn-sm"
                                                        onClick={() => onAddToOperator(selected.slug)}
                                                    >
                                                        Добавить оператору
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="row g-3">

                                            <div className="col-12">
                                                <label className="form-label">Описание</label>
                                                <textarea
                                                    className="form-control"
                                                    rows={3}
                                                    value={formDesc}
                                                    onChange={(e) => setFormDesc(e.currentTarget.value)}
                                                    placeholder="Описание (можно пусто)"
                                                />
                                                {/*<div className="form-text">*/}
                                                {/*    Если очистить и сохранить — отправим <code>null</code> (описание сбросится).*/}
                                                {/*</div>*/}
                                            </div>

                                            <div className="col-12 col-md-6">
                                                <label className="form-label">Тип поля</label>
                                                <OperatorsSelect
                                                    value={formType}
                                                    options={TYPE_OPTIONS_KV}
                                                    isClearable={false}
                                                    onChange={(v) => setFormType((v ?? "regular") as any)}
                                                    placeholder="Выберите тип…"
                                                />
                                            </div>

                                            <div className="col-12">
                                                <label className="form-label">{valueLabelByType(formType)}</label>

                                                {formType === "textarea" || formType === "select" || formType === "many" ? (
                                                    <textarea
                                                        className="form-control"
                                                        rows={4}
                                                        value={formValue}
                                                        onChange={(e) => setFormValue(e.currentTarget.value)}
                                                        placeholder={
                                                            formType === "select" || formType === "many"
                                                                ? "Вариант 1\nВариант 2\nВариант 3"
                                                                : "Текст по умолчанию"
                                                        }
                                                    />
                                                ) : formType === "number" ? (
                                                    <input
                                                        type="number"
                                                        className="form-control"
                                                        value={formValue}
                                                        onChange={(e) => setFormValue(e.currentTarget.value)}
                                                    />
                                                ) : formType === "date" ? (
                                                    <input
                                                        type="date"
                                                        className="form-control"
                                                        value={formValue}
                                                        onChange={(e) => setFormValue(e.currentTarget.value)}
                                                    />
                                                ) : (
                                                    <input
                                                        className="form-control"
                                                        value={formValue}
                                                        onChange={(e) => setFormValue(e.currentTarget.value)}
                                                        placeholder="Например: дефолт"
                                                    />
                                                )}

                                                <div className="form-text">{valueHelpByType(formType)}</div>
                                            </div>
                                        </div>

                                        <div style={{display:"flex", flexDirection: "row", gap: 8, marginTop: 16}}>
                                            <button
                                                type="button"
                                                className="btn btn-success"
                                                disabled={selected?.id == null || saving || !hasChanges}
                                                onClick={async () => {
                                                    if (!selected?.id) return;
                                                    if (!formName.trim()) {
                                                        setErr("Имя поля обязательно.");
                                                        return;
                                                    }

                                                    const patch = buildPatch();
                                                    if (!Object.keys(patch).length) return;

                                                    try {
                                                        setErr(null);
                                                        setSaving(true);
                                                        await onUpdate?.(selected.id, patch);
                                                    } catch (e: any) {
                                                        setErr(String(e?.message || e || "Не удалось сохранить"));
                                                    } finally {
                                                        setSaving(false);
                                                    }
                                                }}
                                            >
                                                {saving ? "Сохраняем…" : "Сохранить"}
                                            </button>

                                            <button
                                                type="button"
                                                className="btn btn-outline-danger ms-auto"
                                                disabled={saving}
                                                onClick={async () => {
                                                    // “Удаление” делаем как active=false (по swagger это поддержано)
                                                    if (!selected?.id) return;
                                                    try {
                                                        setErr(null);
                                                        setSaving(true);
                                                        await onUpdate?.(selected.id, { active: false });
                                                    } catch (e: any) {
                                                        setErr(String(e?.message || e || "Не удалось деактивировать"));
                                                    } finally {
                                                        setSaving(false);
                                                    }
                                                }}
                                                title="Мягкое удаление: active=false"
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/*<div className="modal-footer">*/}
                    {/*    <div className="text-muted small">*/}
                    {/*        PUT <code>/api/v1/user_fields/update</code> — отправляем только изменённые поля.*/}
                    {/*    </div>*/}
                    {/*</div>*/}
                </div>
            </div>
        </div>
    );
}