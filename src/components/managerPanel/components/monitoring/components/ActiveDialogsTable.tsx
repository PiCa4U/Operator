import React from "react";

export type Row = {
    project: string;
    operator: string;          // логин
    name?: string;
    department?: string | null;
    phone?: string;
    duration?: string;
    uuid?: string | null;      // добавлено
    b_uuid?: string | null;    // добавлено
};

type Props = {
    loading?: boolean;
    rows: Row[];
    onHold?: (uuid: string) => void;      // добавлено
    onHangup?: (uuid: string) => void;    // добавлено
    pending?: Record<string, boolean>;    // uuid -> в процессе
};

export const ActiveDialogsTable: React.FC<Props> = ({
                                                        loading,
                                                        rows,
                                                        onHold,
                                                        onHangup,
                                                        pending,
                                                    }) => {
    const hasRows = rows?.length > 0;

    return (
        <section>
            <div className="d-flex align-items-center justify-content-between mb-2">
                <h5 className="mb-0">Активные диалоги</h5>
                <span className="badge bg-secondary">{rows.length}</span>
            </div>

            <div className="table-responsive">
                <table className="table table-sm table-striped align-middle">
                    <thead className="table-light">
                    <tr>
                        <th style={{ minWidth: 160 }}>Проект</th>
                        <th style={{ minWidth: 120 }}>Оператор</th>
                        <th style={{ minWidth: 160 }}>Имя</th>
                        <th style={{ minWidth: 140 }}>Отдел</th>
                        <th style={{ minWidth: 140 }}>Номер</th>
                        <th style={{ minWidth: 120 }}>Длительность</th>
                        <th style={{ minWidth: 160 }}>Действия</th>
                    </tr>
                    </thead>
                    <tbody>
                    {!loading && !hasRows && (
                        <tr>
                            {/* было 6 — исправлено на 7 из-за колонки "Действия" */}
                            <td colSpan={7} className="text-muted">Активных диалогов нет.</td>
                        </tr>
                    )}

                    {rows.map((r, i) => {
                        const currentUuid = r.uuid || r.b_uuid || null;
                        const isBusy = currentUuid ? !!pending?.[currentUuid] : false;

                        return (
                            <tr key={`${r.project}-${r.operator}-${r.phone}-${r.uuid}-${i}`}>
                                <td>{r.project}</td>
                                <td className="text-monospace">{r.operator}</td>
                                <td>{r.name || "—"}</td>
                                <td>{r.department || "—"}</td>
                                <td className="text-monospace">{r.phone || "—"}</td>
                                <td>{r.duration || "—"}</td>
                                <td>
                                    <div className="btn-group btn-group-sm" role="group" aria-label="call-actions">
                                        <button
                                            type="button"
                                            className="btn btn-outline-warning"
                                            disabled={!currentUuid || isBusy || !onHold}
                                            onClick={() => currentUuid && onHold?.(currentUuid)}
                                            title="Поставить/снять с удержания"
                                        >
                                            {isBusy ? (
                                                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                                            ) : (
                                                "Удержание"
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            className="btn btn-outline-danger"
                                            disabled={!currentUuid || isBusy || !onHangup}
                                            onClick={() => currentUuid && onHangup?.(currentUuid)}
                                            title="Сбросить звонок"
                                        >
                                            {isBusy ? (
                                                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                                            ) : (
                                                "Сброс"
                                            )}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default ActiveDialogsTable;
