import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { markReadLocal, readShown, writeShown } from "./local";
import { initSignalsSocketBridge, markSignalsWatched } from "./socketBridge";
import { getUnreadSignals, subscribeSignals } from "./runtime";

export function useManagerSignals(managerLogin?: string) {
    useEffect(() => {
        if (!managerLogin) return;
        initSignalsSocketBridge(managerLogin);
    }, [managerLogin]);

    const unread = useSyncExternalStore(
        subscribeSignals,
        () => getUnreadSignals(managerLogin),
        () => []
    );

    const unreadCount = unread.length;

    const newForUi = useMemo(() => {
        if (!managerLogin) return [];
        const shown = readShown(managerLogin);
        return unread.filter((item) => !shown.has(item.id));
    }, [managerLogin, unread]);

    const markIdsAsRead = useCallback(
        (ids: number[]) => {
            if (!managerLogin || !ids.length) return;

            markReadLocal(managerLogin, ids);
            markSignalsWatched(managerLogin, ids);

            const shown = readShown(managerLogin);
            ids.forEach((id) => shown.add(id));
            writeShown(managerLogin, shown);
        },
        [managerLogin]
    );

    const markOneAsRead = useCallback(
        (id: number) => {
            markIdsAsRead([id]);
        },
        [markIdsAsRead]
    );

    const markAllAsReadNow = useCallback(() => {
        const ids = unread.map((item) => item.id);
        markIdsAsRead(ids);
    }, [markIdsAsRead, unread]);

    return {
        query: { data: unread },
        unreadCount,
        newForUi,
        markOneAsRead,
        markAllAsReadNow,
        markIdsAsRead,
    };
}