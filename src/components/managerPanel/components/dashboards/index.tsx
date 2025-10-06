import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import ManagerDashboards from "./components/ManagerDashboards";
import type { RootState } from "../../../../redux/store";
import { store } from "../../../../redux/store";

/** Нормализация worker → glagol-логин:
 * - если уже содержит ".at." — оставляем как есть
 * - если содержит "@", меняем ПЕРВОЕ вхождение на ".at."
 * - иначе возвращаем как есть
 */
function normalizeWorkerLogin(raw: string): string {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (s.includes(".at.")) return s;

    const at = s.indexOf("@");
    if (at >= 0) {
        return `${s.slice(0, at)}.at.${s.slice(at + 1)}`;
    }
    return s;
}

/**
 * Хук окружения: достаём glagolParent (fs_server) и userLogin (worker)
 * приоритет: Redux → data-* на #root → дефолты.
 */
function getCreds() {
    const { credentials } = store.getState();
    const { worker = "", glagolParent = "" } = credentials || {};
    const userLogin = normalizeWorkerLogin(worker);
    return { userLogin, glagolParent: glagolParent || "" };
}

export const ManagerDashboardsTab: React.FC<{
    listEndpoint?: string;
    gridRowHeight?: number;
}> = ({
          listEndpoint = "https://tmpapi.glagol.ai/get_dash_boards",
          gridRowHeight = 120,
      }) => {
    const { glagolParent, userLogin } = getCreds();

    const props = useMemo(
        () => ({ listEndpoint, glagolParent, userLogin, gridRowHeight }),
        [listEndpoint, glagolParent, userLogin, gridRowHeight]
    );

    return (
        <div style={{ height: "70vh", minHeight: 480 }}>
            <ManagerDashboards {...props} />
        </div>
    );
};
