// src/features/operators/useOperators.ts
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import {
    getAgents, createAgent, updateAgent, deleteAgent, addAgentToProject, removeAgentFromProject,
} from "../api";
import {
    Agent, CreateAgentPayload, UpdateAgentPayload, FiltersState, TierMutationPayload,
} from "../types";

export function useOperators() {
    const qc = useQueryClient();

    const [filters, setFilters] = useState<FiltersState>({
        name: "",
        projects: [],
        department: null,
        robot: "all",   // 'all' | 'robot' | 'human'
        online: "all",  // 'all' | 'online' | 'offline'
    });

    const query = useQuery<Agent[], unknown>({
        queryKey: ["users"],
        queryFn: getAgents,
        staleTime: 5_000,
        refetchInterval: 10_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        placeholderData: (prev) => prev,
        // главное место: убираем soft-deleted
        select: (data) => (data ?? []).filter((a: any) => !a?.is_deleted),
    });
    // ---- уникальные отделы из пришедших данных ----
    const departments = useMemo<string[]>(() => {
        const items = query.data ?? [];
        const set = new Set<string>();
        for (const a of items as any[]) {
            const d = (a?.department ?? "").toString().trim();
            if (d) set.add(d);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));
    }, [query.data]);

    // ---- helpers ----
    const norm = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

    const isOnlineByFields = (a: any): boolean => {
        if (typeof a?.fs_status === "boolean") return a.fs_status;
        if (typeof a?.online === "boolean") return a.online;

        const s = norm(a?.status);
        const st = norm(a?.state);
        if (!s && !st) return false;
        if (s.includes("logged out") || s.includes("offline")) return false;
        if (s.includes("on break")) return true;
        if (s.includes("available")) return true;
        if (st.includes("waiting") || st.includes("ring") || st.includes("call") || st.includes("busy") || st.includes("active") || st.includes("idle")) {
            return true;
        }
        return false;
    };

    const filtered: Agent[] = useMemo(() => {
        const items = query.data ?? [];

        return items.filter((a: any) => {
            // Поиск по ФИО/логину
            if (filters.name?.trim()) {
                const q = filters.name.trim().toLowerCase();
                const hay = `${a?.name ?? ""} ${a?.login ?? ""}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }

            // Отдел
            if (filters.department && a.department !== filters.department) return false;

            // Роботы / Не роботы: робот = post_obrabotka === false
            if (filters.robot !== "all") {
                const isRobot = !Boolean(a?.post_obrabotka);
                const needRobot = filters.robot === "robot";
                if (isRobot !== needRobot) return false;
            }

            // Онлайн / Оффлайн
            if (filters.online !== "all") {
                const needOnline = filters.online === "online";
                if (isOnlineByFields(a) !== needOnline) return false;
            }

            // Проекты
            if (filters.projects.length) {
                const set = new Set(a?.projects ?? []);
                const hasAny = filters.projects.some((p) => set.has(p));
                if (!hasAny) return false;
            }

            return true;
        });
    }, [query.data, filters]);

    const mutateCreate = useMutation<string, unknown, CreateAgentPayload>({
        mutationFn: createAgent,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    });
    const mutateUpdate = useMutation<string, unknown, UpdateAgentPayload>({
        mutationFn: updateAgent,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    });
    const mutateDelete = useMutation<string, unknown, string>({
        mutationFn: deleteAgent,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    });
    const mutateAddTier = useMutation<string, unknown, TierMutationPayload>({
        mutationFn: addAgentToProject,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    });
    const mutateRemoveTier = useMutation<string, unknown, TierMutationPayload>({
        mutationFn: removeAgentFromProject,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    });

    return {
        filters,
        setFilters,
        query,
        filtered,
        departments,
        mutateCreate,
        mutateUpdate,
        mutateDelete,
        mutateAddTier,
        mutateRemoveTier,
    };
}
