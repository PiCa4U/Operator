import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSignals, markSignalsRead, SignalItem } from "./api";
import { appendHistory, ensureReceived, markReadLocal, readShown, writeShown } from "./local";

export function useManagerSignals(managerLogin?: string) {
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: ["signals", managerLogin],
        queryFn: () => getSignals(managerLogin!),
        enabled: !!managerLogin,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
        staleTime: 30_000,
        select: (rows: SignalItem[]) => [...rows].sort((a, b) => b.id - a.id),
        placeholderData: (prev) => prev,
    });

    const unreadCount = (query.data ?? []).length;

    // ✅ ВАЖНО: как только клиент получил список (unread с бэка) —
    // фиксируем receivedAt и кладём в history, чтобы уведомления не "терялись",
    // даже если тостер не показался.
    useEffect(() => {
        if (!managerLogin) return;
        const rows = query.data ?? [];
        if (!rows.length) return;

        ensureReceived(managerLogin, rows);
        appendHistory(managerLogin, rows);
    }, [managerLogin, query.data]);

    const newForUi = useMemo(() => {
        if (!managerLogin) return [];
        const shown = readShown(managerLogin);
        return (query.data ?? []).filter((n) => !shown.has(n.id));
    }, [query.data, managerLogin]);

    const mutateMark = useMutation({
        mutationFn: markSignalsRead,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["signals", managerLogin] }),
    });

    const markOneAsRead = useCallback(
        (id: number) => {
            if (!managerLogin) return;

            // локально сразу ставим readAt (чтобы UI был стабильным)
            markReadLocal(managerLogin, [id]);

            mutateMark.mutate({ login: managerLogin, ids: [id] });

            // текущая логика: shown используется как "не показывать в тостере повторно"
            const shown = readShown(managerLogin);
            shown.add(id);
            writeShown(managerLogin, shown);
        },
        [managerLogin, mutateMark]
    );

    const markAllAsReadNow = useCallback(() => {
        if (!managerLogin) return;

        const ids = (query.data ?? []).map((x) => x.id);
        if (!ids.length) return;

        // локально readAt для всех
        markReadLocal(managerLogin, ids);

        mutateMark.mutate({ login: managerLogin, ids });

        const shown = readShown(managerLogin);
        ids.forEach((i) => shown.add(i));
        writeShown(managerLogin, shown);
    }, [managerLogin, mutateMark, query.data]);

    return { query, unreadCount, newForUi, markOneAsRead, markAllAsReadNow };
}
