import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import type {
    Agent,
    Role,
    CreateAgentPayload,
    UpdateAgentPayload,
    UserFieldDef,
    UserFieldsMap,
    CreateUserFieldPayload,
} from "../../types";
import style from "../../../../../taskDashboard/components/checkbox.module.css";
import OperatorsSelect, { type Option as SelectOption } from "../select";
import UserFieldsEditor from "../UserFieldsEditor";
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
    onCreate(payload: CreateAgentPayload, queues: string[]): Promise<void> | void;
    onUpdate(payload: UpdateAgentPayload, queues: string[]): Promise<void> | void;

    queueOptions?: SelectOption[];
    presetOptions?: SelectOption[];
    flowOptions?: SelectOption[];

    userFieldDefs?: UserFieldDef[];
    userFieldDefsLoading?: boolean;

    onCreateUserField?: (payload: CreateUserFieldPayload) => Promise<void> | void;
    onUpdateUserFieldDef?: (id: number, patch: UpdateUserFieldDefPatch) => Promise<void> | void;
};

const ROLE_LABELS = ["Оператор", "Менеджер"] as const;

export const CloseIconButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({
    onClick,
    disabled = false,
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
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
            cursor: disabled ? "default" : "pointer",
            color: "#6c757d",
            opacity: disabled ? 0.5 : 1,
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

export function toGlagolLogin(raw?: string | null): string {
    if (!raw) return "";
    const s = String(raw).trim();
    if (s.includes("@")) return s;
    return s.replace(/\.at\./i, "@");
}

const roleToLabel = (role: Role): string => (role === "manager" ? "Менеджер" : "Оператор");
const labelToRole = (label: string | null): Role => (label === "Менеджер" ? "manager" : "operator");

const buildNumericIds = (values: string[]) =>
    Array.from(
        new Set(
            values
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value))
        )
    );

const buildQueuePayload = (values: string[]) =>
    Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));

export const OperatorModal: React.FC<Props> = ({
    open,
    mode,
    initial,
    onClose,
    onCreate,
    onUpdate,
    queueOptions = [],
    presetOptions = [],
    flowOptions = [],
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
    const [localQueues, setLocalQueues] = useState<string[]>([]);
    const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
    const [selectedFlowIds, setSelectedFlowIds] = useState<string[]>([]);

    const [userFieldsMap, setUserFieldsMap] = useState<UserFieldsMap>({});
    const [showInactiveUserFields] = useState(false);
    const [selectedUserFieldSlugs, setSelectedUserFieldSlugs] = useState<string[]>([]);

    const [createUserFieldOpen, setCreateUserFieldOpen] = useState(false);
    const [manageUserFieldsOpen, setManageUserFieldsOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;

        if (mode === "edit" && initial) {
            setName(initial.name || "");
            setPassword("");
            setRole(initial.role);
            setDepartment(initial.department ?? "");
            setPostobrabotka(Boolean(initial.post_obrabotka));
            setLocalQueues(
                Array.isArray(initial.queues)
                    ? [...initial.queues]
                    : Array.isArray(initial.projects)
                        ? [...initial.projects]
                        : []
            );
            setSelectedPresetIds((initial.presets ?? []).map((id) => String(id)));
            setSelectedFlowIds((initial.flows ?? []).map((id) => String(id)));

            const initUF =
                initial.user_fields && typeof initial.user_fields === "object"
                    ? (initial.user_fields as Record<string, any>)
                    : {};
            const nextUF: UserFieldsMap = {};
            Object.entries(initUF).forEach(([key, value]) => {
                if (!key) return;
                nextUF[String(key)] = value == null ? "" : String(value);
            });
            setUserFieldsMap(nextUF);
            setSelectedUserFieldSlugs(Object.keys(nextUF));
        } else {
            setName("");
            setPassword("");
            setRole("operator");
            setDepartment("");
            setPostobrabotka(false);
            setLocalQueues([]);
            setSelectedPresetIds([]);
            setSelectedFlowIds([]);
            setUserFieldsMap({});
            setSelectedUserFieldSlugs([]);
        }

        setSaving(false);
    }, [open, mode, initial]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !saving) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose, saving]);

    const title = mode === "create" ? "Создать оператора" : `Редактировать: ${initial?.login}`;

    const validSlugs = useMemo(() => new Set((userFieldDefs || []).map((def) => def.slug)), [userFieldDefs]);

    const buildUserFieldsPayload = () => {
        const out: Record<string, string> = {};
        for (const slug of selectedUserFieldSlugs) {
            if (!validSlugs.has(slug)) continue;
            out[slug] = String(userFieldsMap?.[slug] ?? "");
        }
        return out;
    };

    const nameCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        (userFieldDefs || []).forEach((def) => {
            const name = String(def.name || "").trim();
            if (!name) return;
            counts[name] = (counts[name] || 0) + 1;
        });
        return counts;
    }, [userFieldDefs]);

    const labelBySlug = useMemo(() => {
        const map: Record<string, string> = {};
        (userFieldDefs || []).forEach((def) => {
            const name = String(def.name || "").trim();
            const label = (nameCounts[name] || 0) > 1 ? `${def.name} (${def.slug})` : def.name;
            map[def.slug] = label;
        });
        return map;
    }, [userFieldDefs, nameCounts]);

    const slugByLabel = useMemo(() => {
        const map: Record<string, string> = {};
        (userFieldDefs || []).forEach((def) => {
            const name = String(def.name || "").trim();
            const label = (nameCounts[name] || 0) > 1 ? `${def.name} (${def.slug})` : def.name;
            map[label] = def.slug;
        });
        return map;
    }, [userFieldDefs, nameCounts]);

    const userFieldOptions = useMemo(() => {
        return (userFieldDefs || [])
            .filter((def) => (showInactiveUserFields ? true : def.active))
            .map((def) => labelBySlug[def.slug])
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "ru"));
    }, [userFieldDefs, showInactiveUserFields, labelBySlug]);

    const selectedUserFieldLabels = useMemo(
        () => selectedUserFieldSlugs.map((slug) => labelBySlug[slug]).filter(Boolean),
        [selectedUserFieldSlugs, labelBySlug]
    );

    const addFieldToOperator = (slug: string) => {
        if (!slug) return;

        setSelectedUserFieldSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
        setUserFieldsMap((prev) => {
            const next = { ...(prev || {}) };
            if (next[slug] == null) next[slug] = "";
            return next;
        });
    };

    const handleCreateClick = async () => {
        if (!name.trim() || !password.trim()) {
            await Swal.fire({
                icon: "error",
                title: "Ошибка",
                text: "Имя и пароль обязательны.",
            });
            return;
        }

        const payload: CreateAgentPayload = {
            name: name.trim(),
            password,
            role,
            postobrabotka,
            department: department.trim() || undefined,
            preset_ids: buildNumericIds(selectedPresetIds),
            flow_ids: buildNumericIds(selectedFlowIds),
            user_fields: buildUserFieldsPayload(),
        };

        setSaving(true);
        try {
            await onCreate(payload, buildQueuePayload(localQueues));
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateClick = async () => {
        if (!initial) return;
        if (!name.trim()) {
            await Swal.fire({
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
            preset_ids: buildNumericIds(selectedPresetIds),
            flow_ids: buildNumericIds(selectedFlowIds),
            ...(password.trim() ? { password: password.trim() } : {}),
            user_fields: buildUserFieldsPayload(),
        };

        setSaving(true);
        try {
            await onUpdate(payload, buildQueuePayload(localQueues));
        } finally {
            setSaving(false);
        }
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
                if (!saving && e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="modal-dialog"
                role="document"
                style={{ width: "96vw", maxWidth: 920, margin: "0 auto" }}
            >
                <div
                    className="modal-content"
                    style={{ maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column" }}
                >
                    <div className="modal-header" style={{ flex: "0 0 auto" }}>
                        <h5 className="modal-title">{title}</h5>
                        <CloseIconButton onClick={onClose} disabled={saving} />
                    </div>

                    <div
                        className="modal-body"
                        style={{ flex: "1 1 auto", overflowY: "auto", overflowX: "hidden" }}
                    >
                        <div className="row g-3">
                            <div className="col-12 col-md-6">
                                <label className="form-label">Логин</label>
                                <input
                                    className="form-control"
                                    value={toGlagolLogin(initial?.glagol_service)}
                                    disabled
                                    placeholder={mode === "create" ? "Будет создан после сохранения" : "Логин"}
                                />
                            </div>

                            <div className="col-12 col-md-6">
                                <label className="form-label">Роль</label>
                                <OperatorsSelect
                                    value={roleToLabel(role)}
                                    options={[...ROLE_LABELS]}
                                    onChange={(label) => setRole(labelToRole(label))}
                                    placeholder="Выберите роль"
                                    isDisabled={saving}
                                />
                            </div>

                            <div className="col-12 col-md-6">
                                <label className="form-label">Имя</label>
                                <input
                                    className="form-control"
                                    value={name}
                                    onChange={(e) => setName(e.currentTarget.value)}
                                    placeholder="ФИО или отображаемое имя"
                                    disabled={saving}
                                />
                            </div>

                            <div className="col-12 col-md-6">
                                <label className="form-label">Пароль</label>
                                <input
                                    className="form-control"
                                    value={password}
                                    onChange={(e) => setPassword(e.currentTarget.value)}
                                    placeholder={
                                        mode === "create"
                                            ? "Задайте пароль"
                                            : "Оставьте пустым, чтобы не менять"
                                    }
                                    disabled={saving}
                                />
                            </div>

                            <div className="col-12 col-md-6">
                                <label className="form-label">Отдел</label>
                                <input
                                    className="form-control"
                                    value={department}
                                    onChange={(e) => setDepartment(e.currentTarget.value)}
                                    placeholder="Например: Тестовая группа"
                                    disabled={saving}
                                />
                            </div>

                            <div className="col-12 col-md-6 d-flex flex-column justify-content-end">
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <input
                                        id="robotSwitch"
                                        className={style.customCheckbox}
                                        type="checkbox"
                                        checked={postobrabotka}
                                        onChange={(e) => setPostobrabotka(e.currentTarget.checked)}
                                        disabled={saving}
                                    />
                                    <label htmlFor="robotSwitch" className="form-check-label">
                                        Включить постобработку
                                    </label>
                                </div>
                            </div>
                        </div>

                        <hr className="my-4" />

                        <div className="row g-3">
                            <div className="col-12">
                                <label className="form-label">Очереди</label>
                                <OperatorsSelect
                                    isMulti
                                    value={localQueues}
                                    options={queueOptions}
                                    onChange={(vals) => setLocalQueues(Array.isArray(vals) ? vals : [])}
                                    placeholder="Выберите очереди..."
                                    withCheckboxes
                                    isDisabled={saving}
                                />
                            </div>

                            <div className="col-12 col-lg-6">
                                <label className="form-label">Доступные flow</label>
                                <OperatorsSelect
                                    isMulti
                                    value={selectedFlowIds}
                                    options={flowOptions}
                                    onChange={(vals) => setSelectedFlowIds(Array.isArray(vals) ? vals : [])}
                                    placeholder="Выберите flow..."
                                    withCheckboxes
                                    isDisabled={saving}
                                />
                            </div>

                            <div className="col-12 col-lg-6">
                                <label className="form-label">Доступные пресеты</label>
                                <OperatorsSelect
                                    isMulti
                                    value={selectedPresetIds}
                                    options={presetOptions}
                                    onChange={(vals) => setSelectedPresetIds(Array.isArray(vals) ? vals : [])}
                                    placeholder="Выберите пресеты..."
                                    withCheckboxes
                                    isDisabled={saving}
                                />
                            </div>
                        </div>

                        <hr className="my-4" />

                        <div className="d-flex align-items-center gap-2 mb-2">
                            <label className="form-label m-0">Пользовательские поля</label>

                            <div className="ms-auto d-flex align-items-center gap-2">
                                <button
                                    type="button"
                                    className="btn btn-outline-primary btn-sm"
                                    onClick={() => setManageUserFieldsOpen(true)}
                                    disabled={saving}
                                >
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
                                    const slugs = labels.map((label) => slugByLabel[label]).filter(Boolean);

                                    setSelectedUserFieldSlugs(slugs);
                                    setUserFieldsMap((prev) => {
                                        const next = { ...(prev || {}) };
                                        for (const slug of slugs) {
                                            if (next[slug] == null) next[slug] = "";
                                        }
                                        return next;
                                    });
                                }}
                                placeholder="Выберите поля..."
                                isDisabled={saving}
                            />
                        </div>

                        <UserFieldsEditor
                            defs={userFieldDefs || []}
                            loading={userFieldDefsLoading}
                            values={userFieldsMap}
                            onChange={setUserFieldsMap}
                            showInactive={showInactiveUserFields}
                            readOnlyInactive
                            onlySlugs={selectedUserFieldSlugs}
                        />
                    </div>

                    <div className="modal-footer" style={{ flex: "0 0 auto" }}>
                        <button
                            className="btn btn-outline-danger"
                            onClick={onClose}
                            disabled={saving}
                        >
                            Отмена
                        </button>

                        {mode === "create" ? (
                            <button
                                className="btn btn-success"
                                onClick={() => {
                                    void handleCreateClick();
                                }}
                                disabled={saving}
                            >
                                {saving ? "Сохраняем..." : "Создать"}
                            </button>
                        ) : (
                            <button
                                className="btn btn-success"
                                onClick={() => {
                                    void handleUpdateClick();
                                }}
                                disabled={saving}
                            >
                                {saving ? "Сохраняем..." : "Сохранить"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <UserFieldsManagerModal
                open={manageUserFieldsOpen}
                onClose={() => setManageUserFieldsOpen(false)}
                defs={userFieldDefs || []}
                loading={userFieldDefsLoading}
                onCreateClick={() => setCreateUserFieldOpen(true)}
                onUpdate={onUpdateUserFieldDef}
                onAddToOperator={(slug) => addFieldToOperator(slug)}
            />

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
