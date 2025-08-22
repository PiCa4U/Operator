// src/features/manager/ManagerPanel.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Filters } from "./components/filters";
import { OperatorsTab } from "./components/operatorManagment";
import { LogsTab } from "./components/integrations/components/LogsTab"

type TabKey = "filters" | "operators" | "logs";

export const ManagerPanel: React.FC = () => {
    const [active, setActive] = useState<TabKey>(
        () => (localStorage.getItem("managerPanel.activeTab") as TabKey) || "filters"
    );

    useEffect(() => {
        localStorage.setItem("managerPanel.activeTab", active);
    }, [active]);

    const tabs = useMemo(
        () => [
            { key: "filters" as const, label: "Отчёты" },
            { key: "operators" as const, label: "Операторы" },
            { key: "logs" as const, label: "Логи" },
        ],
        []
    );

    return (
        <div className="card col ml-0">
            <div className="card-header">
                <ul className="nav nav-tabs card-header-tabs">
                    {tabs.map((t) => (
                        <li className="nav-item" key={t.key}>
                            <button
                                type="button"
                                className={`nav-link ${active === t.key ? "active" : ""}`}
                                onClick={() => setActive(t.key)}
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
                {active === "operators" && <OperatorsTab />}
                {active === "logs" && <LogsTab />}
            </div>
        </div>
    );
};
