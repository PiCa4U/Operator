// src/features/operators/OperatorsTab.tsx
import React, {useEffect, useMemo, useState} from "react";
import { useOperators } from "./hooks";
import { Agent, Role } from "./types";
import { OperatorModal } from "./components/operatorModal";
import axios from "axios";
import OperatorsSelect from "./components/select";
import Swal from "sweetalert2";
import {socket} from "../../../../socket";
import {store} from "../../../../redux/store";

export const OperatorsTab: React.FC = () => {
    const {
        filters, setFilters,
        query, filtered,
        mutateDelete, mutateUpdate,departments, mutateAddTier, mutateRemoveTier,
        mutateCreate,
    } = useOperators();
    const { sessionKey } = store.getState().operator
    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;

    const [selected, setSelected] = useState<Record<Agent["login"], boolean>>({});

    // ---- Пагинация ----
    const PAGE_SIZE = 10; // показываем по 10
    const [page, setPage] = useState(1);

    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // если фильтры/данные изменились и текущая страница вышла за пределы — поджимаем
    useEffect(() => {
        if (page > pageCount) setPage(pageCount);
    }, [page, pageCount]);

    const startIdx = (page - 1) * PAGE_SIZE;
    const endIdx = Math.min(total, startIdx + PAGE_SIZE);
    const pageItems = useMemo(() => filtered.slice(startIdx, endIdx), [filtered, startIdx, endIdx]);

    const allChecked = useMemo(
        () => pageItems.length > 0 && pageItems.every((a) => selected[a.login]),
        [pageItems, selected]
    );

    // modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"create"|"edit">("create");
    const [editing, setEditing] = useState<Agent | null>(null);

    const glagol_parent = "fs.at.akc24.ru";
    const [projMap, setProjMap] = useState<Record<string, string>>({});

    useEffect(() => {
        let mounted = true;
        axios.get("/api/v1/projects", { params: { glagol_parent } })
            .then((resp) => {
                const arr = Array.isArray(resp.data?.projects) ? resp.data.projects : [];
                const map: Record<string, string> = {};
                for (const p of arr) {
                    const key = p?.project_name;
                    if (!key) continue;
                    map[key] = p?.glagol_name || key;
                }
                if (mounted) setProjMap(map);
            })
            .catch((err) => {
                console.error("Не удалось загрузить список проектов", err);
            });
        return () => { mounted = false; };
    }, []);

    const ROBOT_LABELS = ["Робот", "Оператор"] as const;
    const ONLINE_LABELS = ["Онлайн", "Оффлайн"] as const;

    const robotToLabel = (v: "all" | "robot" | "human"): string | null =>
        v === "robot" ? "Робот" : v === "human" ? "Оператор" : null;

    const labelToRobot = (label: string | null): "all" | "robot" | "human" =>
        label === "Робот" ? "robot" : label === "Оператор" ? "human" : "all";

    const onlineToLabel = (v: "all" | "online" | "offline"): string | null =>
        v === "online" ? "Онлайн" : v === "offline" ? "Оффлайн" : null;

    const labelToOnline = (label: string | null): "all" | "online" | "offline" =>
        label === "Онлайн" ? "online" : label === "Оффлайн" ? "offline" : "all";

    // --- helpers for status/state ---
    const norm = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

    const getStatusBadgeClass = (status?: boolean) => {
        if (!status) return "badge bg-danger";
        if (status)  return "badge bg-success";
        return "badge bg-info";
    };

    const getTelephonyState = (a: any): { text: string; cls: string } => {
        const s = norm(a?.status);
        const st = norm(a?.state);
        const post = !!a?.post;
        const fs = Boolean(a?.fs_status);

        if (post) return { text: "В постобработке", cls: "badge bg-warning text-dark" };
        if (s.includes("on break")) return { text: "Перерыв", cls: "badge bg-warning text-dark" };
        if (s.includes("logged out") || fs === false) return { text: "Не на линии", cls: "badge bg-danger" };

        if (st.includes("queue call")) return { text: "В активном звонке", cls: "badge bg-warning text-dark" };

        if (
            st.includes("waiting") && s.includes("available")
        ) return { text: "На линии", cls: "badge bg-success" };

        if (st.includes("idle")) return { text: "В постобработке", cls: "badge bg-warning text-dark" };

        return { text: "Не на линии", cls: "badge bg-secondary" };
    };

    const openCreate = () => {
        setEditing(null);
        setModalMode("create");
        setModalOpen(true);
    };
    const openEdit = (agent: Agent) => {
        setEditing(agent);
        setModalMode("edit");
        setModalOpen(true);
    };

    const roleName = (role: string) => {
        if (role === "admin")   return "Админ";
        if (role === "manager") return "Менеджер";
        if (role === "operator")return "Оператор";
        return role;
    };

    const handleDepartmentBlur = (login: string) =>
        (e: React.FocusEvent<HTMLInputElement>) => {
            const next = e.currentTarget.value.trim();
            mutateUpdate.mutate({ login, department: next || undefined });
        };

    const handleRoleChange = (login: string) =>
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            const role = e.currentTarget.value as Role;
            mutateUpdate.mutate({ login, role });
        };

    const goto = (p: number) => setPage(Math.min(pageCount, Math.max(1, p)));

    const handleStartFs = (login: string, reason?: string, idle_set?: boolean) => {
        socket.emit('change_status_fs', {
            sip_login: login,
            worker,
            session_key: sessionKey,
            action: 'available',
            reason,
            idle_set,
            page: 'online',
        });
        socket.emit('change_state_fs', {
            sip_login: login,
            worker,
            session_key: sessionKey,
            action: 'available',
            state: "waiting",
            reason,
            page: 'online',
        });
    };

    const handlePauseFs = async (status: string, login: string) => {
        if (status === "On Break") {
            socket.emit('change_status_fs', {
                sip_login: login,
                worker,
                session_key: sessionKey,
                action: 'available',
                page: 'online',
            });
        } else {
            const { value: reason } = await Swal.fire({
                title: 'Укажите причину перерыва',
                input: 'select',
                inputOptions: {
                    break: 'Перерыв',
                    study: 'Обучение',
                    admin: 'Административный',
                    lunch: 'Обед',
                },
                inputPlaceholder: 'Выберите опцию',
                showCancelButton: true,
            });
            if (!reason) return;
            socket.emit('change_status_fs', {
                sip_login: login,
                worker,
                session_key: sessionKey,
                action: 'pause',
                reason,
                page: 'online',
            });
        }
    };

    const handleLogoutFs = (login: string) => {
        socket.emit('change_status_fs', {
            sip_login: login,
            worker,
            session_key: sessionKey,
            action: 'logout',
            page: 'online',
        });
    };

    return (
        <div className="d-flex flex-column gap-3">

            {/* Фильтры + кнопка создания */}
            <div
                style={{
                    display: "flex",
                    gap: "1rem",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                    marginBottom: 10,
                }}
            >
                <div>
                    <label className="form-label mb-1">Поиск</label>
                    <input
                        className="form-control"
                        value={filters.name}
                        onChange={(e) => {
                            const v = e.currentTarget.value;
                            setFilters((f) => ({ ...f, name: v }));
                            setPage(1);
                        }}
                        placeholder="ФИО или логин"
                    />
                </div>

                <div>
                    <label className="form-label mb-1">Отдел</label>
                    <OperatorsSelect
                        value={filters.department}
                        options={departments}
                        onChange={(val) => {
                            setFilters((f) => ({ ...f, department: val }));
                            setPage(1);
                        }}
                        placeholder="Все отделы"
                    />
                </div>

                <div>
                    <label className="form-label mb-1">Роботы</label>
                    <OperatorsSelect
                        // value отображаем человекочитаемой меткой (или null = Все)
                        value={robotToLabel(filters.robot)}
                        options={[...ROBOT_LABELS]}          // ["Робот","Не робот"]
                        onChange={(label) => {
                            const v = labelToRobot(label);
                            setFilters((f) => ({ ...f, robot: v }));
                            setPage(1);
                        }}
                        placeholder="Все"
                    />
                </div>

                <div>
                    <label className="form-label mb-1">Онлайн</label>
                    <OperatorsSelect
                        value={onlineToLabel(filters.online)}
                        options={[...ONLINE_LABELS]}        // ["Онлайн","Оффлайн"]
                        onChange={(label) => {
                            const v = labelToOnline(label);
                            setFilters((f) => ({ ...f, online: v }));
                            setPage(1);
                        }}
                        placeholder="Все"
                    />
                </div>

                <div style={{ marginLeft: "auto" }}>
                    <button className="btn btn-success" onClick={openCreate}>
                        Создать оператора
                    </button>
                </div>
            </div>


            {/* Таблица */}
            <div className="table-responsive">
                <table className="table table-sm align-middle">
                    <thead>
                    <tr>
                        <th style={{ width: 32 }}>
                            <input
                                type="checkbox"
                                checked={allChecked}
                                onChange={(e) => {
                                    const v = e.currentTarget.checked;
                                    const next: Record<Agent["login"], boolean> = { ...selected };
                                    pageItems.forEach((a) => { next[a.login] = v; }); // только текущая страница
                                    setSelected(next);
                                }}
                            />
                        </th>
                        <th>Имя</th>
                        <th>Логин</th>
                        <th>Роль</th>
                        <th>Отдел</th>
                        <th>Робот</th>
                        <th>Проекты</th>
                        <th>Статус</th>
                        <th>Состояние</th>
                        <th style={{ width: 360 }}>Действия</th>
                    </tr>
                    </thead>
                    <tbody>
                    {query.isLoading && (
                        <tr><td colSpan={10}>Загрузка…</td></tr>
                    )}

                    {!query.isLoading && pageItems.map((a) => (
                        <tr key={a.login}>
                            <td>
                                <input
                                    type="checkbox"
                                    checked={Boolean(selected[a.login])}
                                    onChange={(e) => setSelected(prev => ({ ...prev, [a.login]: e.currentTarget.checked }))}
                                />
                            </td>
                            <td>{a.name}</td>
                            <td>{a.login}</td>
                            <td>
                                <span className="badge bg-light text-dark">{roleName(a.role)}</span>
                            </td>
                            <td>{a.department ?? "-"}</td>
                            <td>
                                <span className={`badge ${a.post_obrabotka ? "bg-info" : "bg-secondary"}`}>
                                    {!a.post_obrabotka ? "Робот" : "Человек"}
                                </span>
                            </td>
                            <td>
                                {(() => {
                                    const projects = Array.isArray(a.projects) ? a.projects.filter(Boolean) : [];
                                    const display = projects.map((code) => projMap[code] ?? code);

                                    const maxVisible = 3;
                                    const visible = display.slice(0, maxVisible);
                                    const hidden  = display.slice(maxVisible);

                                    return (
                                        <div
                                            className="position-relative"
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns: "repeat(auto-fill, minmax(100px, auto))",
                                                gap: "4px",
                                            }}
                                        >
                                            {visible.map((name) => (
                                                <span
                                                    key={name}
                                                    className="badge bg-light text-dark border"
                                                    title={name}
                                                    style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                                                >
                                                    {name}
                                                </span>
                                            ))}

                                            {hidden.length > 0 && (
                                                <span
                                                    className="badge bg-light text-dark border"
                                                    style={{ cursor: "pointer", whiteSpace: "nowrap" }}
                                                    title={hidden.join(", ")}
                                                >
                                                    +{hidden.length} {hidden.length === 1 ? "проект" : hidden.length < 5 ? "проекта" : "проектов"}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}
                            </td>

                            <td>
                                {(() => {
                                    const cls = getStatusBadgeClass(a.fs_status);
                                    return <span className={cls}>{a.fs_status ? "Авторизирован" : "Выключен"}</span>;
                                })()}
                            </td>

                            <td>
                                {(() => {
                                    const { text, cls } = getTelephonyState(a);
                                    return <span className={cls}>{text}</span>;
                                })()}
                            </td>

                            <td>
                                <div className="btn-group btn-group-sm">
                                    {/* Редактировать всегда */}
                                    <button
                                        className="btn btn-outline-success"
                                        onClick={() => openEdit(a)}
                                    >
                                        Редактировать
                                    </button>

                                    {/* На линию */}
                                    {a.status === "Logged Out" && a.fs_status && (
                                        <button className="btn btn-outline-success" onClick={() => handleStartFs(a.login)}>
                                            На линию
                                        </button>
                                    )}

                                    {/* Перерыв + Логаут */}
                                    {(a.status === "Available" || a.status === "Available (On Demand)") && (
                                        <>
                                            <button className="btn btn-outline-warning" onClick={() => handlePauseFs("Available", a.login)}>
                                                Перерыв
                                            </button>
                                            <button className="btn btn-outline-dark" onClick={() => handleLogoutFs(a.login)}>
                                                Логаут
                                            </button>
                                        </>
                                    )}

                                    {/* Снять с перерыва */}
                                    {a.status === "On Break" && (
                                        <button className="btn btn-outline-warning" onClick={() => handlePauseFs("On Break", a.login)}>
                                            Снять с перерыва
                                        </button>
                                    )}

                                    {/* Удалить */}
                                    <button
                                        className="btn btn-outline-danger"
                                        onClick={() => {
                                            Swal.fire({
                                                title: `Удалить "${a.name}" (${a.login})?`,
                                                icon: "warning",
                                                showCancelButton: true,
                                                confirmButtonText: "Да, удалить",
                                                cancelButtonText: "Отмена",
                                                confirmButtonColor: "#d33",
                                                cancelButtonColor: "#3085d6",
                                                reverseButtons: true,
                                            }).then((result) => {
                                                if (result.isConfirmed) {
                                                    mutateDelete.mutate(a.login);
                                                    Swal.fire({
                                                        title: "Удалено!",
                                                        icon: "success",
                                                        timer: 1500,
                                                        showConfirmButton: false,
                                                    });
                                                }
                                            });
                                        }}
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </td>

                        </tr>
                    ))}

                    {!query.isLoading && pageItems.length === 0 && (
                        <tr><td colSpan={10}>Ничего не найдено</td></tr>
                    )}
                    </tbody>
                </table>
            </div>

            {/* Пагинация */}
            <div className="d-flex align-items-center justify-content-between">
                <small className="text-muted">
                    {total > 0 ? `${startIdx + 1}–${endIdx} из ${total}` : "0 из 0"}
                </small>

                <ul className="pagination pagination-sm mb-0">
                    <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                        <button className="page-link" onClick={() => goto(1)} title="В начало">«</button>
                    </li>
                    <li className={`page-item ${page === 1 ? "disabled" : ""}`}>
                        <button className="page-link" onClick={() => goto(page - 1)} title="Назад">‹</button>
                    </li>
                    <li className="page-item disabled">
                        <span className="page-link">{page} / {pageCount}</span>
                    </li>
                    <li className={`page-item ${page === pageCount ? "disabled" : ""}`}>
                        <button className="page-link" onClick={() => goto(page + 1)} title="Вперёд">›</button>
                    </li>
                    <li className={`page-item ${page === pageCount ? "disabled" : ""}`}>
                        <button className="page-link" onClick={() => goto(pageCount)} title="В конец">»</button>
                    </li>
                </ul>
            </div>

            {/* Модалка */}
            <OperatorModal
                open={modalOpen}
                mode={modalMode}
                initial={editing}
                onClose={() => setModalOpen(false)}
                onCreate={(payload) => {
                    mutateCreate.mutate(payload, { onSuccess: () => setModalOpen(false) });
                }}
                onUpdate={(payload) => {
                    mutateUpdate.mutate(payload, { onSuccess: () => setModalOpen(false) });
                }}

                projectMap={projMap}
                onAddProject={(login, project_name) => {
                    mutateAddTier.mutate({ login, project_name });
                }}
                onRemoveProject={(login, project_name) => {
                    mutateRemoveTier.mutate({ login, project_name });
                }}
            />
        </div>
    );
};
