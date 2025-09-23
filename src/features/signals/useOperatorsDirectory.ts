// src/features/signals/useOperatorsDirectory.ts (или оставь прежний путь)
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useSelector } from "react-redux";
import type { RootState } from "../../redux/store";

type RawUser = { id?: number; login: string; name?: string; is_deleted?: boolean };
type UsersObjectResponse = {
    status?: string;
    users?: Record<string, { name?: string; department?: string | null; is_deleted?: boolean }>;
};
type UsersArrayResponse = { result?: RawUser[]; data?: RawUser[] };

/** map: { [login]: name } */
export function useOperatorsDirectory() {
    // берём актуальный glagol_parent из Redux — хук пересчитает запрос при изменении
    const glagol_parent = useSelector(
        (s: RootState) => s.credentials.glagolParent || ""
    );

    return useQuery({
        queryKey: ["operatorsDirectory", glagol_parent],
        queryFn: async (): Promise<Record<string, string>> => {
            const { data } = await axios.get<UsersObjectResponse & UsersArrayResponse>(
                "/api/v1/users",
                { params: { glagol_parent } }
            );

            const map: Record<string, string> = {};

            // ТЕКУЩИЙ ФОРМАТ: data.users — объект { "1000": { name: "Иван" }, ... }
            if (data && data.users && typeof data.users === "object") {
                for (const [login, u] of Object.entries(data.users)) {
                    map[login] = u?.name || login;
                }
                return map;
            }

            // Фоллбек на массив (если когда-то встретится)
            const rows: RawUser[] = (data?.result ?? data?.data ?? []) as RawUser[];
            for (const u of rows) {
                if (!u?.login) continue;
                map[u.login] = u?.name || u.login;
            }
            return map;
        },
        // настройки
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        placeholderData: {},
        select: (m) => ({ ...m }),
        enabled: true, // можно поставить !!glagol_parent, если не хочешь стреляć без параметра
    });
}

/** "Имя (login) · Отдел: ..." */
export function formatOperatorLine(
    login: string,
    dict?: Record<string, string>,
    department?: string | null,
    showLogin = true
) {
    const name = dict?.[login];
    const base = name ? (showLogin ? `${name} (${login})` : name) : login;
    return department ? `${base} · Отдел: ${department}` : base;
}

/** "Имя (login)" или просто login */
export function formatOperator(login: string, dict?: Record<string, string>) {
    if (!login) return "";
    const name = dict?.[login];
    return name ? `${name} (${login})` : login;
}
