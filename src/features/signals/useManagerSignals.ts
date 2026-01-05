import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSignals, markSignalsRead, SignalItem } from "./api";
import { readShown, writeShown } from "./local";

export function useManagerSignals(managerLogin?: string) {
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: ["signals", managerLogin],
        queryFn: () => getSignals(managerLogin!),
        enabled: !!managerLogin,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
        staleTime: 30_000,
        select: (rows: SignalItem[]) => [...rows].sort((a,b)=>b.id-a.id),
        placeholderData: (prev)=>prev,
    });

    const unreadCount = (query.data ?? []).length;

    const newForUi = useMemo(() => {
        if (!managerLogin) return [];
        const shown = readShown(managerLogin);
        return (query.data ?? []).filter(n => !shown.has(n.id));
    }, [query.data, managerLogin]);

    const mutateMark = useMutation({
        mutationFn: markSignalsRead,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["signals", managerLogin] }),
    });

    const markOneAsRead = (id: number) => {
        if (!managerLogin) return;
        mutateMark.mutate({ login: managerLogin, ids: [id] });
        const shown = readShown(managerLogin); shown.add(id); writeShown(managerLogin, shown);
    };

    const markAllAsReadNow = () => {
        if (!managerLogin) return;
        const ids = (query.data ?? []).map(x => x.id);
        if (!ids.length) return;
        mutateMark.mutate({ login: managerLogin, ids });
        const shown = readShown(managerLogin); ids.forEach(i=>shown.add(i)); writeShown(managerLogin, shown);
    };

    return { query, unreadCount, newForUi, markOneAsRead, markAllAsReadNow };
}
