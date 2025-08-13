// src/features/operators/useOperators.ts
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import {
    getAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    addAgentToProject,
    removeAgentFromProject,
} from "../api";
import {
    Agent,
    CreateAgentPayload,
    UpdateAgentPayload,
    FiltersState,
    TierMutationPayload,
} from "../types";

export function useOperators() {
    const qc = useQueryClient();

    const [filters, setFilters] = useState<FiltersState>({
        name: "",
        projects: [],
        department: null,
        robot: "all",
        online: "all",
    });

    const query: UseQueryResult<Agent[], unknown> = useQuery({
        queryKey: ["users", filters.name],
        queryFn: () => getAgents(),
        staleTime: 15_000,
    });

    const filtered: Agent[] = useMemo(() => {
        const items = query.data ?? [];
        return items.filter((a: any) => {
            if (filters.department && a.department !== filters.department) return false;

            if (filters.robot !== "all") {
                const needRobot = filters.robot === "robot";
                if (Boolean(a.postobrabotka) !== needRobot) return false;
            }

            if (filters.online !== "all") {
                const needOnline = filters.online === "online";
                const isOnline =
                    typeof a.online === "boolean"
                        ? a.online
                        : a.status === "online";
                if (Boolean(isOnline) !== needOnline) return false;
            }

            if (filters.projects.length) {
                const set = new Set(a.projects ?? []);
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
        mutateCreate,
        mutateUpdate,
        mutateDelete,
        mutateAddTier,
        mutateRemoveTier,
    };
}
