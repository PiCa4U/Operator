import { useLocation } from "react-router-dom";
import { useMemo } from "react";
import type { ChatRole } from "../../utils/itsmLink";

export function useViewerFromQuery() {
    const { search } = useLocation();
    return useMemo(() => {
        const p = new URLSearchParams(search);
        const worker = p.get("worker");
        const roleQ = (p.get("role") as ChatRole | null) ?? null;
        const name = p.get("name") ?? undefined;

        if (worker) {
            return {
                login: worker,
                name: name ?? worker,
                role: roleQ ?? ("operator" as ChatRole),
            };
        }
        return {
            login: null,
            name: "Клиент",
            role: "client" as ChatRole,
        };
    }, [search]);
}
