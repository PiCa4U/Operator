import React from "react";

export type Row = {
    project: string;
    operator: string;          // логин
    name?: string;
    department?: string | null;
    phone?: string;
    duration?: string;
};

type Props = {
    loading?: boolean;
    rows: Row[];
};

export const ActiveDialogsTable: React.FC<Props> = ({ loading, rows }) => {
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
                    </tr>
                    </thead>
                    <tbody>
                    {!loading && !hasRows && (
                        <tr>
                            <td colSpan={6} className="text-muted">Активных диалогов нет.</td>
                        </tr>
                    )}
                    {rows.map((r, i) => (
                        <tr key={`${r.project}-${r.operator}-${r.phone}-${i}`}>
                            <td>{r.project}</td>
                            <td className="text-monospace">{r.operator}</td>
                            <td>{r.name || "—"}</td>
                            <td>{r.department || "—"}</td>
                            <td className="text-monospace">{r.phone || "—"}</td>
                            <td>{r.duration || "—"}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default ActiveDialogsTable;
