// src/components/managerPanel/index.tsx
import React, { memo, useEffect, useMemo, useState } from "react";
import { Filters } from "./components/filters";
import { OperatorsTab } from "./components/operatorManagment";
import { LogsTab } from "./components/integrations/components/LogsTab";
import { ManagerDashboardsTab } from "./components/dashboards";
import { MonitoringTab } from "./components/monitoring"; // ⬅️ NEW

type TabKey = "dashboards" | "filters" | "operators" | "logs" | "monitoring"; // ⬅️ NEW

const ManagerPanelInner: React.FC = () => {
    const [active, setActive] = useState<TabKey>(
        () => (localStorage.getItem("managerPanel.activeTab") as TabKey) || "filters"
    );

    useEffect(() => {
        localStorage.setItem("managerPanel.activeTab", active);
    }, [active]);

    const tabs = useMemo(
        () => [
            { key: "dashboards" as const, label: "Дашборды" },
            { key: "filters" as const, label: "Отчёты" },
            { key: "operators" as const, label: "Операторы" },
            { key: "monitoring" as const, label: "Диалоги" }, // ⬅️ NEW
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
                {active === "dashboards" && <ManagerDashboardsTab />}
                {active === "filters" && <Filters />}
                {active === "operators" && <OperatorsTab />}
                {active === "monitoring" && <MonitoringTab />} {/* ⬅️ NEW */}
                {active === "logs" && <LogsTab />}
            </div>
        </div>
    );
};

export const ManagerPanel = memo(ManagerPanelInner);
ManagerPanel.displayName = "ManagerPanel";
