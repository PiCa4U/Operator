import React, { useEffect, useMemo, useState } from "react";
import { Filters } from "./components/filters";
// импортируй свой монитор (или временную заглушку)
import {OperatorsTab}  from "./components/operatorManagment";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type TabKey = "filters" | "operators";

export const ManagerPanel: React.FC = () => {
    const [active, setActive] = useState<TabKey>(() => {
        return (localStorage.getItem("managerPanel.activeTab") as TabKey) || "filters";
    });
    const [client] = useState(() => new QueryClient());

    useEffect(() => {
        localStorage.setItem("managerPanel.activeTab", active);
    }, [active]);

    const tabs = useMemo(
        () => ([
            { key: "filters" as const, label: "Отчёты" },
            { key: "operators" as const, label: "Операторы" },
        ]),
        []
    );

    return (
        <div className="card col ml-0">
            <div className="card-header">
                <ul className="nav nav-tabs card-header-tabs">
                    {tabs.map(t => (
                        <li className="nav-item" key={t.key}>
                            <button
                                type="button"
                                className={`nav-link ${active === t.key ? "active" : ""}`}
                                onClick={() => setActive(t.key)}
                                // немного доступности
                                aria-current={active === t.key ? "page" : undefined}
                            >
                                {t.label}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="card-body">
                {active === "filters" && <Filters />}
                {active === 'operators' && (
                    <QueryClientProvider client={client}>
                        <OperatorsTab />
                    </QueryClientProvider>
                )}
            </div>
        </div>
    );
};
