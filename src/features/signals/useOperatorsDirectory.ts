import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const glagol_parent = "fs.at.akc24.ru";

type RawUser = { id?: number; login: string; name?: string; is_deleted?: boolean };
type UsersObjectResponse = {
    status?: string;
    users?: Record<string, { name?: string; department?: string | null; is_deleted?: boolean }>;
};
type UsersArrayResponse = { result?: RawUser[]; data?: RawUser[] };

/** map: { [login]: name } */
export function useOperatorsDirectory() {
    return useQuery({
        queryKey: ["operatorsDirectory"],
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
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        placeholderData: {},
        select: (m) => ({ ...m }),
    });
}

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

export function formatOperator(login: string, dict?: Record<string, string>) {
    if (!login) return "";
    const name = dict?.[login];
    return name ? `${name} (${login})` : login;
}
