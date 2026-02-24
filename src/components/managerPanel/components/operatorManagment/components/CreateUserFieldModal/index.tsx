import React, { useEffect, useMemo, useState } from "react";
import type { CreateUserFieldPayload } from "../../types";
import OperatorsSelect, { type Option as SelectOption } from "../select";
import {CloseIconButton} from "../operatorModal";

type Props = {
    open: boolean;
    onClose: () => void;
    onSubmit: (payload: CreateUserFieldPayload) => Promise<void> | void;
};

const TYPE_OPTIONS: Array<{ value: CreateUserFieldPayload["field_type"]; label: string }> = [
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
export default function CreateUserFieldModal({ open, onClose, onSubmit }: Props) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [fieldType, setFieldType] = useState<CreateUserFieldPayload["field_type"]>("regular");
    const [fieldValue, setFieldValue] = useState("");
    const [active, setActive] = useState(true);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setName("");
        setDescription("");
        setFieldType("regular");
        setFieldValue("");
        setActive(true);
        setSubmitting(false);
        setError(null);
    }, [open]);

    const valueLabel = useMemo(() => {
        if (fieldType === "select" || fieldType === "many") return "Варианты";
        return "Значение по умолчанию";
    }, [fieldType]);

    const valueHelp = useMemo(() => {
        if (fieldType === "select" || fieldType === "many") {
            return "Для удинственного/множественного выбора укажи варианты: каждый вариант с новой строки или через запятую.";
        }
        return "Опционально. Если не нужно — оставь пустым.";
    }, [fieldType]);

    if (!open) return null;

    const submit = async () => {
        setError(null);

        const n = name.trim();
        if (!n) {
            setError("Поле «Имя поля» обязательно.");
            return;
        }

        const payload: CreateUserFieldPayload = {
            name: n,
            description: description.trim() ? description.trim() : null,
            field_type: fieldType,
            field_value: fieldValue.trim() ? fieldValue.trim() : null,
            active,
        };

        try {
            setSubmitting(true);
            await onSubmit(payload);
            onClose();
        } catch (e: any) {
            setError(String(e?.message || e || "Не удалось создать поле"));
        } finally {
            setSubmitting(false);
        }
    };

    const overlayStyle: React.CSSProperties = {
        background: "rgba(0,0,0,.55)",
        zIndex: 2000, // чтобы поверх OperatorModal
    };

    return (
        <div
            className="modal d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            style={overlayStyle}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="modal-dialog modal-dialog-centered" role="document" style={{ maxWidth: 560 }}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Создать пользовательское поле</h5>
                        <CloseIconButton onClick={onClose} />
                    </div>

                    <div className="modal-body">
                        {error && <div className="alert alert-danger py-2">{error}</div>}

                        <div className="mb-3">
                            <label className="form-label">Имя поля</label>
                            <input
                                className="form-control"
                                value={name}
                                onChange={(e) => setName(e.currentTarget.value)}
                                placeholder="Например: Заметка менеджера"
                                autoFocus
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Описание (опционально)</label>
                            <input
                                className="form-control"
                                value={description}
                                onChange={(e) => setDescription(e.currentTarget.value)}
                                placeholder="Например: видит только менеджер"
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Тип поля</label>
                            <OperatorsSelect
                                value={fieldType}
                                options={TYPE_OPTIONS_KV}
                                isClearable={false}
                                onChange={(v) => setFieldType((v ?? "regular") as any)}
                                placeholder="Выберите тип…"
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">{valueLabel}</label>

                            {fieldType === "textarea" || fieldType === "select" || fieldType === "many" ? (
                                <textarea
                                    className="form-control"
                                    rows={4}
                                    value={fieldValue}
                                    onChange={(e) => setFieldValue(e.currentTarget.value)}
                                    placeholder={
                                        fieldType === "select" || fieldType === "many"
                                            ? "Вариант 1\nВариант 2\nВариант 3"
                                            : "Текст по умолчанию"
                                    }
                                />
                            ) : fieldType === "number" ? (
                                <input
                                    type="number"
                                    className="form-control"
                                    value={fieldValue}
                                    onChange={(e) => setFieldValue(e.currentTarget.value)}
                                    placeholder="Например: 10"
                                />
                            ) : fieldType === "date" ? (
                                <input
                                    type="date"
                                    className="form-control"
                                    value={fieldValue}
                                    onChange={(e) => setFieldValue(e.currentTarget.value)}
                                />
                            ) : (
                                <input
                                    className="form-control"
                                    value={fieldValue}
                                    onChange={(e) => setFieldValue(e.currentTarget.value)}
                                    placeholder="Например: дефолт"
                                />
                            )}

                            <div className="form-text">{valueHelp}</div>
                        </div>

                    </div>

                    <div className="modal-footer">
                        <button className="btn btn-outline-secondary" onClick={onClose} disabled={submitting}>
                            Отмена
                        </button>
                        <button className="btn btn-success" onClick={submit} disabled={submitting}>
                            {submitting ? "Создаём…" : "Создать"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}