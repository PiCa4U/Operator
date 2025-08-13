// src/features/operators/OperatorsTab.tsx
import React, { useMemo, useState } from "react";
import { useOperators } from "./hooks";
import { Agent, Role } from "./types";

export const OperatorsTab: React.FC = () => {
    const {
        filters, setFilters,
        query, filtered,
        mutateDelete, mutateUpdate, mutateAddTier, mutateRemoveTier
    } = useOperators();

    const [selected, setSelected] = useState<Record<Agent["login"], boolean>>({});
    const allChecked = useMemo(
        () => filtered.length > 0 && filtered.every((a) => selected[a.login]),
        [filtered, selected]
    );

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

    return (
        <div className="d-flex flex-column gap-3">
            {/* Фильтры */}
            <div className="d-flex gap-2 align-items-end flex-wrap">
                <div>
                    <label className="form-label mb-1">Поиск</label>
                    <input
                        className="form-control"
                        value={filters.name}
                        onChange={(e) => setFilters(f => ({ ...f, name: e.currentTarget.value }))}
                        placeholder="ФИО или логин"
                    />
                </div>

                <div>
                    <label className="form-label mb-1">Отдел</label>
                    <select
                        className="form-select"
                        value={filters.department ?? ""}
                        onChange={(e) => setFilters(f => ({ ...f, department: e.currentTarget.value || null }))}
                    >
                        <option value="">Все</option>
                        <option>Отдел 1</option>
                        <option>Отдел 2</option>
                    </select>
                </div>

                <div>
                    <label className="form-label mb-1">Роботы</label>
                    <select
                        className="form-select"
                        value={filters.robot}
                        onChange={(e) => setFilters(f => ({ ...f, robot: e.currentTarget.value as typeof f.robot }))}
                    >
                        <option value="all">Все</option>
                        <option value="robot">Робот</option>
                        <option value="human">Не робот</option>
                    </select>
                </div>

                <div>
                    <label className="form-label mb-1">Онлайн</label>
                    <select
                        className="form-select"
                        value={filters.online}
                        onChange={(e) => setFilters(f => ({ ...f, online: e.currentTarget.value as typeof f.online }))}
                    >
                        <option value="all">Все</option>
                        <option value="online">Онлайн</option>
                        <option value="offline">Оффлайн</option>
                    </select>
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
                                    const next: Record<Agent["login"], boolean> = {};
                                    filtered.forEach((a) => { next[a.login] = v; });
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
                        <th style={{ width: 280 }}>Действия</th>
                    </tr>
                    </thead>
                    <tbody>
                    {query.isLoading && (
                        <tr><td colSpan={9}>Загрузка…</td></tr>
                    )}

                    {!query.isLoading && filtered.map((a) => (
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
                                <select className="form-select form-select-sm" value={a.role} onChange={handleRoleChange(a.login)}>
                                    <option value="operator">operator</option>
                                    <option value="manager">manager</option>
                                </select>
                            </td>
                            <td>
                                <input
                                    className="form-control form-control-sm"
                                    defaultValue={a.department ?? ""}
                                    onBlur={handleDepartmentBlur(a.login)}
                                />
                            </td>
                            <td>
                                <div className="form-check form-switch m-0">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        checked={a.postobrabotka}
                                        onChange={(e) => mutateUpdate.mutate({ login: a.login, postobrabotka: e.currentTarget.checked })}
                                    />
                                </div>
                            </td>
                            <td>
                                <div className="d-flex flex-wrap gap-1">
                                    {(a.projects ?? []).map((p) => (
                                        <span key={p} className="badge bg-secondary">
                        {p}{" "}
                                            <button
                                                className="btn btn-sm btn-link p-0 ms-1 text-light"
                                                onClick={() => mutateRemoveTier.mutate({ login: a.login, project_name: p })}
                                                title="Убрать"
                                            >
                          ×
                        </button>
                      </span>
                                    ))}
                                    <button
                                        className="btn btn-outline-secondary btn-sm"
                                        onClick={() => {
                                            const project = window.prompt("Добавить в проект (имя):");
                                            if (project) {
                                                mutateAddTier.mutate({ login: a.login, project_name: project });
                                            }
                                        }}
                                    >
                                        + проект
                                    </button>
                                </div>
                            </td>
                            <td>
                                {a.status === "online" && <span className="badge bg-success">Онлайн</span>}
                                {a.status === "break"  && <span className="badge bg-warning text-dark">Перерыв</span>}
                                {!a.status || a.status === "offline" ? <span className="badge bg-secondary">Оффлайн</span> : null}
                            </td>
                            <td>
                                <div className="btn-group btn-group-sm">
                                    <button className="btn btn-outline-warning">Перерыв</button>
                                    <button className="btn btn-outline-success">На линию</button>
                                    <button className="btn btn-outline-dark">Логаут</button>
                                </div>
                                <button
                                    className="btn btn-outline-danger btn-sm ms-2"
                                    onClick={() => {
                                        if (window.confirm(`Удалить "${a.name}" (${a.login})?`)) {
                                            mutateDelete.mutate(a.login);
                                        }
                                    }}
                                >
                                    Удалить
                                </button>
                            </td>
                        </tr>
                    ))}

                    {!query.isLoading && filtered.length === 0 && (
                        <tr><td colSpan={9}>Ничего не найдено</td></tr>
                    )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
