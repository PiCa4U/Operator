import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import ManagerDashboards from "./components/ManagerDashboards";
import type { RootState } from "../../../../redux/store";

/**
 * Хук окружения: достаём glagolParent (fs_server) и userLogin (sip_login)
 * приоритет: Redux → data-* на #root → дефолты.
 */
function useGlagolEnv() {
    // Всегда вызываем хуки в одном и том же порядке — без short-circuit!
    const fsServerOperator = useSelector<RootState, string | undefined>(
        (s) => (s as any)?.operator?.fs_server
    );
    const fsServerCreds = useSelector<RootState, string | undefined>(
        (s) => (s as any)?.credentials?.fs_server
    );

    const sipLoginOperator = useSelector<RootState, string | undefined>(
        (s) => (s as any)?.operator?.sip_login
    );
    const sipLoginCreds = useSelector<RootState, string | undefined>(
        (s) => (s as any)?.credentials?.sip_login
    );

    // Затем уже склеиваем значения
    const fsServerRedux = fsServerOperator ?? fsServerCreds;
    const sipLoginRedux = sipLoginOperator ?? sipLoginCreds;

    // dataset как запасной источник
    const root = document.getElementById("root") as HTMLElement | null;
    const ds = (root?.dataset ?? {}) as Partial<Record<string, string>>;

    const glagolParent =
        fsServerRedux ?? ds.fsServer ?? ds.glagolParent ?? "fs.at.akc24.ru";

    const userLogin =
        sipLoginRedux ?? ds.sipLogin ?? ds.user ?? "1.fs.at.akc24.ru";

    return { glagolParent, userLogin };
}

export const ManagerDashboardsTab: React.FC<{
    listEndpoint?: string;
    gridRowHeight?: number;
}> = ({
          listEndpoint = "https://tmpapi.glagol.ai/get_dash_boards",
          gridRowHeight = 120,
      }) => {
    const { glagolParent, userLogin } = useGlagolEnv();

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
