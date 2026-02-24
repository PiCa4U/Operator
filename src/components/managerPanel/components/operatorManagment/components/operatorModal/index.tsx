import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import type { Agent, Role, CreateAgentPayload, UpdateAgentPayload } from "../../types";
import style from "../../../../../taskDashboard/components/checkbox.module.css";
import OperatorsSelect from "../select";
import UserFieldsEditor from "../UserFieldsEditor";
import type { UserFieldDef, UserFieldsMap, CreateUserFieldPayload } from "../../types";
import CreateUserFieldModal from "../CreateUserFieldModal";
import UserFieldsManagerModal from "../UserFieldsManagerModal";

type UpdateUserFieldDefPatch = Partial<
    Pick<UserFieldDef, "name" | "description" | "field_type" | "field_value" | "active">
>;

type Props = {
    open: boolean;
    mode: "create" | "edit";
    initial?: Agent | null;
    onClose(): void;
    onCreate(payload: CreateAgentPayload): void;
    onUpdate(payload: UpdateAgentPayload): void;

    projectMap?: Record<string, string>;
    onAddProject?: (login: string, project_name: string) => void;
    onRemoveProject?: (login: string, project_name: string) => void;

    userFieldDefs?: UserFieldDef[];
    userFieldDefsLoading?: boolean;

    onCreateUserField?: (payload: CreateUserFieldPayload) => Promise<void> | void;
    onUpdateUserFieldDef?: (id: number, patch: UpdateUserFieldDefPatch) => Promise<void> | void;
};

const ROLE_LABELS = ["Оператор", "Менеджер"] as const;

export const CloseIconButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    </button>
);

const TrashIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
);

export function toGlagolLogin(raw?: string | null): string {
    if (!raw) return "";
    const s = String(raw).trim();
    if (s.includes("@")) return s;
    return s.replace(/\.at\./i, "@");
}

const roleToLabel = (r: Role): string => (r === "manager" ? "Менеджер" : "Оператор");
const labelToRole = (label: string | null): Role => (label === "Менеджер" ? "manager" : "operator");

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
                                                   userFieldDefs,
                                                   userFieldDefsLoading,
                                                   onCreateUserField,
                                                   onUpdateUserFieldDef,
                                               }) => {
    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState<Role>("operator");
    const [department, setDepartment] = useState<string>("");
    const [postobrabotka, setPostobrabotka] = useState<boolean>(false);

    const [localProjects, setLocalProjects] = useState<string[]>([]);
    const [projectToAddLabel, setProjectToAddLabel] = useState<string | null>(null);

    const [userFieldsMap, setUserFieldsMap] = useState<UserFieldsMap>({});
    const [showInactiveUserFields, setShowInactiveUserFields] = useState(false);
    const [selectedUserFieldSlugs, setSelectedUserFieldSlugs] = useState<string[]>([]);

    const [createUserFieldOpen, setCreateUserFieldOpen] = useState(false);
    const [manageUserFieldsOpen, setManageUserFieldsOpen] = useState(false);

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

            const initUF = initial.user_fields && typeof initial.user_fields === "object" ? (initial.user_fields as any) : {};
            const nextUF: UserFieldsMap = {};
            Object.entries(initUF).forEach(([k, v]) => {
                if (!k) return;
                nextUF[String(k)] = v == null ? "" : String(v);
            });
            setUserFieldsMap(nextUF);
            setSelectedUserFieldSlugs(Object.keys(nextUF));
        } else {
            setName("");
            setPassword("");
            setRole("operator");
            setDepartment("");
            setPostobrabotka(false);
            setLocalProjects([]);
            setProjectToAddLabel(null);
            setUserFieldsMap({});
            setShowInactiveUserFields(false);
            setSelectedUserFieldSlugs([]);
        }
    }, [open, mode, initial]);

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

    const selectableLabels = useMemo(() => {
        return Object.entries(projectMap)
            .filter(([code]) => !localProjects.includes(code))
            .map(([, label]) => label);
    }, [projectMap, localProjects]);

    const title = mode === "create" ? "Создать оператора" : `Редактировать: ${initial?.login}`;

    const validSlugs = useMemo(() => new Set((userFieldDefs || []).map((d) => d.slug)), [userFieldDefs]);

    const buildUserFieldsPayload = () => {
        const out: Record<string, string> = {};
        for (const slug of selectedUserFieldSlugs) {
            if (!validSlugs.has(slug)) continue;
            out[slug] = String(userFieldsMap?.[slug] ?? "");
        }
        return out;
    };

    // ==== labels без slug (slug добавляем ТОЛЬКО если есть дубль по name) ====
    const nameCounts = useMemo(() => {
        const c: Record<string, number> = {};
        (userFieldDefs || []).forEach((d) => {
            const n = String(d.name || "").trim();
            if (!n) return;
            c[n] = (c[n] || 0) + 1;
        });
        return c;
    }, [userFieldDefs]);

    const labelBySlug = useMemo(() => {
        const m: Record<string, string> = {};
        (userFieldDefs || []).forEach((d) => {
            const nm = String(d.name || "").trim();
            const label = (nameCounts[nm] || 0) > 1 ? `${d.name} (${d.slug})` : d.name;
            m[d.slug] = label;
        });
        return m;
    }, [userFieldDefs, nameCounts]);

    const slugByLabel = useMemo(() => {
        const m: Record<string, string> = {};
        (userFieldDefs || []).forEach((d) => {
            const nm = String(d.name || "").trim();
            const label = (nameCounts[nm] || 0) > 1 ? `${d.name} (${d.slug})` : d.name;
            m[label] = d.slug;
        });
        return m;
    }, [userFieldDefs, nameCounts]);

    const userFieldOptions = useMemo(() => {
        return (userFieldDefs || [])
            .filter((d) => (showInactiveUserFields ? true : d.active))
            .map((d) => labelBySlug[d.slug])
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "ru"));
    }, [userFieldDefs, showInactiveUserFields, labelBySlug]);

    const selectedUserFieldLabels = useMemo(() => {
        return selectedUserFieldSlugs.map((slug) => labelBySlug[slug]).filter(Boolean);
    }, [selectedUserFieldSlugs, labelBySlug]);

    const addFieldToOperator = (slug: string) => {
        if (!slug) return;

        setSelectedUserFieldSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]));

        setUserFieldsMap((prev) => {
            const next = { ...(prev || {}) };
            if (next[slug] == null) next[slug] = "";
            return next;
        });
    };

    if (!open) return null;

    return (
        <div
            className="modal d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            style={{
                background: "rgba(0,0,0,.5)",
                position: "fixed",
                inset: 0,
                overflowY: "auto",
                overflowX: "hidden",
                padding: "16px",
                zIndex: 1050,
            }}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="modal-dialog" role="document" style={{ width: "96vw", maxWidth: 920, margin: "0 auto" }}>
                <div className="modal-content" style={{ maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column" }}>
                    <div className="modal-header" style={{ flex: "0 0 auto" }}>
                        <h5 className="modal-title">{title}</h5>
                        <CloseIconButton onClick={onClose} />
                    </div>

                    <div className="modal-body" style={{ flex: "1 1 auto", overflowY: "auto", overflowX: "hidden" }}>
                        {/* ======= ВЕРХ (2 колонки) ======= */}
                        <div className="row g-3">
                            <div className="col-12 col-md-6">
                                <label className="form-label">Логин</label>
                                <input className="form-control" value={toGlagolLogin(initial?.glagol_service)} disabled={true} placeholder="Логин" />
                            </div>

                            <div className="col-12 col-md-6">
                                <label className="form-label">Роль</label>
                                <OperatorsSelect value={roleToLabel(role)} options={[...ROLE_LABELS]} onChange={(label) => setRole(labelToRole(label))} placeholder="Выберите роль" />
                            </div>

                            <div className="col-12 col-md-6">
                                <label className="form-label">Имя</label>
                                <input className="form-control" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="ФИО/отображаемое имя" />
                            </div>

                            <div className="col-12 col-md-6">
                                <label className="form-label">Пароль</label>
                                <input
                                    className="form-control"
                                    value={password}
                                    onChange={(e) => setPassword(e.currentTarget.value)}
                                    placeholder={mode === "create" ? "Задайте пароль" : "Оставьте пустым, чтобы не менять"}
                                />
                            </div>

                            <div className="col-12 col-md-6">
                                <label className="form-label">Отдел (опционально)</label>
                                <input className="form-control" value={department} onChange={(e) => setDepartment(e.currentTarget.value)} placeholder="Например: Тестовая группа" />
                            </div>

                            <div className="col-12 col-md-6 d-flex flex-column justify-content-end">
                                <div style={{ display: "flex", flexDirection: "row", gap: 10, alignItems: "center" }}>
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
                            </div>
                        </div>

                        <hr className="my-4" />

                        {/* ======= КАСТОМНЫЕ ПОЛЯ ======= */}
                        <div className="d-flex align-items-center gap-2 mb-2">
                            <label className="form-label m-0">Пользовательские поля</label>

                            <div className="ms-auto d-flex align-items-center gap-2 ml-2">
                                {/*<button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowInactiveUserFields((v) => !v)}>*/}
                                {/*    {showInactiveUserFields ? "Скрыть inactive" : "Показать inactive"}*/}
                                {/*</button>*/}

                                <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setManageUserFieldsOpen(true)}>
                                    Редактор полей
                                </button>
                            </div>
                        </div>

                        <div className="mb-2">
                            <label className="form-label mb-1">Поля в карточке оператора</label>

                            <OperatorsSelect
                                isMulti
                                value={selectedUserFieldLabels}
                                options={userFieldOptions}
                                onChange={(vals: any) => {
                                    const labels = Array.isArray(vals) ? vals : [];
                                    const slugs = labels.map((l) => slugByLabel[l]).filter(Boolean);

                                    setSelectedUserFieldSlugs(slugs);

                                    setUserFieldsMap((prev) => {
                                        const next = { ...(prev || {}) };
                                        for (const s of slugs) {
                                            if (next[s] == null) next[s] = "";
                                        }
                                        return next;
                                    });
                                }}
                                placeholder="Выберите поля..."
                            />

                            {/*<div className="form-text">Здесь выбираешь какие поля “подключены” к оператору. Редактируются ниже.</div>*/}
                        </div>

                        <UserFieldsEditor
                            defs={userFieldDefs || []}
                            loading={userFieldDefsLoading}
                            values={userFieldsMap}
                            onChange={setUserFieldsMap}
                            showInactive={showInactiveUserFields}
                            readOnlyInactive
                            onlySlugs={selectedUserFieldSlugs} // теперь даже [] => ничего не покажет
                        />

                        {/*<div className="d-flex gap-2 mt-2">*/}
                        {/*    <button*/}
                        {/*        type="button"*/}
                        {/*        className="btn btn-outline-secondary btn-sm"*/}
                        {/*        onClick={() => {*/}
                        {/*            setUserFieldsMap({});*/}
                        {/*            setSelectedUserFieldSlugs([]);*/}
                        {/*        }}*/}
                        {/*        title="При сохранении отправится {} — это очистит user_fields у юзера"*/}
                        {/*    >*/}
                        {/*        Очистить все поля*/}
                        {/*    </button>*/}
                        {/*</div>*/}

                        {/* ======= ПРОЕКТЫ ======= */}
                        {mode === "edit" && initial && (
                            <div className="mt-4">
                                <label className="form-label">Проекты</label>

                                <div className="d-flex flex-wrap gap-2 mb-2">
                                    {localProjects.length === 0 && <span className="text-muted">Нет проектов</span>}

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
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-danger btn-sm rounded-circle p-0 d-inline-flex align-items-center justify-content-center"
                                                    style={{ width: 22, height: 22, lineHeight: 1, borderWidth: 1 }}
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

                                <div style={{ display: "flex", flexDirection: "row", gap: 10 }}>
                                    <div style={{ flex: 1, minWidth: 220 }}>
                                        <OperatorsSelect value={projectToAddLabel} options={selectableLabels} onChange={setProjectToAddLabel} placeholder="Выбрать проект…" />
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

                    <div className="modal-footer" style={{ flex: "0 0 auto" }}>
                        <button className="btn btn-outline-danger" onClick={onClose}>
                            Отмена
                        </button>

                        {mode === "create" ? (
                            <button
                                className="btn btn-success"
                                onClick={() => {
                                    if (!name.trim() || !password.trim()) {
                                        Swal.fire({ icon: "error", title: "Ошибка", text: "Имя и пароль обязательны." });
                                        return;
                                    }
                                    const payload: CreateAgentPayload = {
                                        name: name.trim(),
                                        password: password,
                                        role,
                                        postobrabotka,
                                        department: department.trim() || undefined,
                                        user_fields: buildUserFieldsPayload(),
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
                                        Swal.fire({ icon: "error", title: "Ошибка", text: "Имя обязательно." });
                                        return;
                                    }
                                    const payload: UpdateAgentPayload = {
                                        login: initial.login,
                                        name: name.trim(),
                                        role,
                                        postobrabotka,
                                        department: department.trim() || undefined,
                                        ...(password.trim() ? { password: password.trim() } : {}),
                                        user_fields: buildUserFieldsPayload(),
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

            {/* ======= РЕДАКТОР ПОЛЕЙ ======= */}
            <UserFieldsManagerModal
                open={manageUserFieldsOpen}
                onClose={() => setManageUserFieldsOpen(false)}
                defs={userFieldDefs || []}
                loading={userFieldDefsLoading}
                onCreateClick={() => setCreateUserFieldOpen(true)}
                onUpdate={onUpdateUserFieldDef}
                onAddToOperator={(slug) => addFieldToOperator(slug)}
            />

            {/* ======= СОЗДАНИЕ ПОЛЯ ======= */}
            <CreateUserFieldModal
                open={createUserFieldOpen}
                onClose={() => setCreateUserFieldOpen(false)}
                onSubmit={async (payload) => {
                    await onCreateUserField?.(payload);
                }}
            />
        </div>
    );
};