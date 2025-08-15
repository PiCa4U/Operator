// src/features/operators/OperatorModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import type {
    Agent,
    Role,
    CreateAgentPayload,
    UpdateAgentPayload,
} from "../../types";
import style from "../../../../../taskDashboard/components/checkbox.module.css";
import OperatorsSelect from "../select";

type Props = {
    open: boolean;
    mode: "create" | "edit";
    initial?: Agent | null;
    onClose(): void;
    onCreate(payload: CreateAgentPayload): void;
    onUpdate(payload: UpdateAgentPayload): void;

    /** карта проектов: code -> человекочитаемое название */
    projectMap?: Record<string, string>;
    /** добавление/удаление проекта (дернуть POST/DELETE из родителя) */
    onAddProject?: (login: string, project_name: string) => void;
    onRemoveProject?: (login: string, project_name: string) => void;
};

const ROLE_LABELS = ["Оператор", "Менеджер"] as const;

const CloseIconButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label="Закрыть"
        title="Закрыть"
        style={{
            marginLeft: "auto",
            border: "none",
            background: "transparent",
            padding: 0,
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#6c757d",
        }}
    >
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    </button>
);

const TrashIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
);
const roleToLabel = (r: Role): string => (r === "manager" ? "Менеджер" : "Оператор");
const labelToRole = (label: string | null): Role =>
    label === "Менеджер" ? "manager" : "operator";

export const OperatorModal: React.FC<Props> = ({
                                                   open,
                                                   mode,
                                                   initial,
                                                   onClose,
                                                   onCreate,
                                                   onUpdate,
                                                   projectMap = {},
                                                   onAddProject,
                                                   onRemoveProject,
                                               }) => {
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<Role>("operator");
    const [department, setDepartment] = useState<string>("");
    const [postobrabotka, setPostobrabotka] = useState<boolean>(false);

    // локальное отображение проектов оператора (коды)
    const [localProjects, setLocalProjects] = useState<string[]>([]);
    // выбранная опция в селекте добавления (лейбл!)
    const [projectToAddLabel, setProjectToAddLabel] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (mode === "edit" && initial) {
            setName(initial.name || "");
            setPassword("");
            setRole(initial.role);
            setDepartment(initial.department ?? "");
            setPostobrabotka(Boolean(initial.post_obrabotka));
            setLocalProjects(Array.isArray(initial.projects) ? [...initial.projects] : []);
            setProjectToAddLabel(null);
        } else {
            setName("");
            setPassword("");
            setRole("operator");
            setDepartment("");
            setPostobrabotka(false);
            setLocalProjects([]);
            setProjectToAddLabel(null);
        }
    }, [open, mode, initial]);

    // Закрытие по Esc
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const labelToCode = useMemo(() => {
        const m: Record<string, string> = {};
        Object.entries(projectMap).forEach(([code, label]) => {
            m[label] = code;
        });
        return m;
    }, [projectMap]);

    // список лейблов, которые ещё не привязаны к оператору
    const selectableLabels = useMemo(() => {
        return Object.entries(projectMap)
            .filter(([code]) => !localProjects.includes(code))
            .map(([, label]) => label);
    }, [projectMap, localProjects]);

    const title = mode === "create" ? "Создать оператора" : `Редактировать: ${initial?.login}`;
    if (!open) return null;

    // обратная мапа: label -> code

    return (
        <div
            className="modal d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            style={{ background: "rgba(0,0,0,.5)" }}
            // закрытие кликом по бэкдропу
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="modal-dialog modal-dialog-centered" role="document">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">{title}</h5>
                        <CloseIconButton onClick={onClose} />
                    </div>

                    <div className="modal-body">
                        <div className="mb-3">
                            <label className="form-label">Имя</label>
                            <input
                                className="form-control"
                                value={name}
                                onChange={(e) => setName(e.currentTarget.value)}
                                placeholder="ФИО/отображаемое имя"
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Пароль</label>
                            <input
                                className="form-control"
                                value={password}
                                onChange={(e) => setPassword(e.currentTarget.value)}
                                placeholder={mode === "create" ? "Задайте пароль" : "Оставьте пустым, чтобы не менять"}
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Роль</label>
                            <OperatorsSelect
                                value={roleToLabel(role)}
                                options={[...ROLE_LABELS]}
                                onChange={(label) => setRole(labelToRole(label))}
                                placeholder="Выберите роль"
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Отдел (опционально)</label>
                            <input
                                className="form-control"
                                value={department}
                                onChange={(e) => setDepartment(e.currentTarget.value)}
                                placeholder="Например: Тестовая группа"
                            />
                        </div>

                        <div style={{ display: "flex", flexDirection: "row", gap: 10 }}>
                            <input
                                id="robotSwitch"
                                className={style.customCheckbox}
                                type="checkbox"
                                checked={postobrabotka}
                                onChange={(e) => setPostobrabotka(e.currentTarget.checked)}
                            />
                            <label htmlFor="robotSwitch" className="form-check-label">
                                Включить постобработку
                            </label>
                        </div>
                        <div className="form-text">Если выключено, оператор считается роботом.</div>

                        {/* Управление проектами — только в режиме редактирования */}
                        {mode === "edit" && initial && (
                            <div className="mt-4">
                                <label className="form-label">Проекты</label>

                                {/* текущие проекты */}
                                <div className="d-flex flex-wrap gap-2 mb-2">
                                    {localProjects.length === 0 && (
                                        <span className="text-muted">Нет проектов</span>
                                    )}

                                    {localProjects.map((code) => {
                                        const label = projectMap[code] ?? code;
                                        return (
                                            <span
                                                key={code}
                                                className="badge bg-light text-dark border d-inline-flex align-items-center"
                                                style={{ gap: 8, padding: "0.35rem 0.5rem" }}
                                                title={label}
                                            >
                                                {label}
                                                {/* Круглая кнопка удаления */}
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-danger btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center"
                                                    style={{
                                                        width: 22,
                                                        height: 22,
                                                        lineHeight: 1,
                                                        borderWidth: 1,
                                                    }}
                                                    aria-label={`Удалить проект «${label}»`}
                                                    title={`Удалить проект «${label}»`}
                                                    onClick={() => {
                                                        if (!onRemoveProject) return;
                                                        setLocalProjects((prev) => prev.filter((p) => p !== code));
                                                        onRemoveProject(initial!.login, code);
                                                    }}
                                                >
                                                    <TrashIcon />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>


                                {/* селект добавления проекта */}
                                <div style={{display: "flex", flexDirection: "row", gap: 10}}>
                                    <div style={{ flex: 1, minWidth: 220 }}>
                                        <OperatorsSelect
                                            value={projectToAddLabel}
                                            options={selectableLabels}
                                            onChange={setProjectToAddLabel}
                                            placeholder="Выбрать проект…"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-outline-success"
                                        disabled={!projectToAddLabel}
                                        onClick={() => {
                                            if (!initial || !projectToAddLabel || !onAddProject) return;
                                            const code = labelToCode[projectToAddLabel] ?? projectToAddLabel;
                                            if (localProjects.includes(code)) {
                                                setProjectToAddLabel(null);
                                                return;
                                            }
                                            setLocalProjects((prev) => [...prev, code]);
                                            onAddProject(initial.login, code);
                                            setProjectToAddLabel(null);
                                        }}
                                    >
                                        Добавить проект
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button className="btn btn-outline-danger" onClick={onClose}>
                            Отмена
                        </button>
                        {mode === "create" ? (
                            <button
                                className="btn btn-success"
                                onClick={() => {
                                    if (!name.trim() || !password.trim()) {
                                        Swal.fire({
                                            icon: "error",
                                            title: "Ошибка",
                                            text: "Имя и пароль обязательны.",
                                        });
                                        return;
                                    }
                                    const payload: CreateAgentPayload = {
                                        name: name.trim(),
                                        password: password,
                                        role,
                                        postobrabotka,
                                        department: department.trim() || undefined,
                                    };
                                    onCreate(payload);
                                }}
                            >
                                Создать
                            </button>
                        ) : (
                            <button
                                className="btn btn-success"
                                onClick={() => {
                                    if (!initial) return;
                                    if (!name.trim()) {
                                        Swal.fire({
                                            icon: "error",
                                            title: "Ошибка",
                                            text: "Имя обязательно.",
                                        });
                                        return;
                                    }
                                    const payload: UpdateAgentPayload = {
                                        login: initial.login,
                                        name: name.trim(),
                                        role,
                                        postobrabotka,
                                        department: department.trim() || undefined,
                                        ...(password.trim() ? { password: password.trim() } : {}),
                                    };
                                    onUpdate(payload);
                                }}
                            >
                                Сохранить
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
