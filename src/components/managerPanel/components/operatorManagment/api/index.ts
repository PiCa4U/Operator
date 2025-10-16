import axios, { AxiosResponse } from "axios";
import {
    Agent,
    CreateAgentPayload,
    UpdateAgentPayload,
    TierMutationPayload,
    Role, OperatorLogEntry,
} from "../types";
import { store } from "../../../../../redux/store";

function getGlagolParent(): string {
    return store.getState()?.credentials?.glagolParent || "";
}

type ApiUser = {
    glagol_service: string | null;
    type: "operator" | "manager" | null;
    name: string | null;
    post_obrabotka: boolean | null;
    is_deleted: boolean | null;
    department: string | null;
    fs_status: boolean;
    projects: string[] | null;
    status: string | null;
    state: string | null;
    post: boolean | null;

    // 👇 а не string
    talk: null | {
        phone?: string;
        project?: string;
        duration?: string;
        [k: string]: unknown;
    };
};

type ApiUsersResponse = {
    status: "success";
    users: Record<string, ApiUser>;
};

export async function getAgents(): Promise<Agent[]> {
    const glagol_parent = getGlagolParent();

    const resp: AxiosResponse<ApiUsersResponse> = await axios.get("/api/v1/users", {
        params: { glagol_parent },
    });

    const usersObj = resp.data?.users ?? {};

    const agents: Agent[] = Object.entries(usersObj).map(([login, u]) => {
        // аккуратно нормализуем talk: {} | null | объект
        const talk =
            u?.talk && typeof u.talk === "object" ? (u.talk as ApiUser["talk"]) : null;

        return {
            login,
            ...u,                 // тут может прийти talk из u…
            talk,                 // …но мы его перезапишем нормализованным объектом
            role: (u?.type ?? "operator") as Role,
            postobrabotka:
                typeof u?.post === "boolean" ? u.post : Boolean(u?.post_obrabotka),
        } as Agent;
    });

    return agents;
}

export async function createAgent(payload: CreateAgentPayload): Promise<string> {
    const glagol_parent = getGlagolParent();
    const resp: AxiosResponse<string> = await axios.post("/api/v1/agents/create", {
        glagol_parent,
        ...payload,
    });
    return resp.data;
}

export async function updateAgent(payload: UpdateAgentPayload): Promise<string> {
    const glagol_parent = getGlagolParent();
    const resp: AxiosResponse<string> = await axios.put("/api/v1/agents/update", {
        glagol_parent,
        ...payload,
    });
    return resp.data;
}

export async function deleteAgent(login: string): Promise<string> {
    const glagol_parent = getGlagolParent();
    const resp: AxiosResponse<string> = await axios.delete("/api/v1/agents/delete", {
        data: { glagol_parent, login },
    });
    return resp.data;
}

export async function addAgentToProject({
                                            login,
                                            project_name,
                                        }: TierMutationPayload): Promise<string> {
    const glagol_parent = getGlagolParent();
    const resp: AxiosResponse<string> = await axios.post("/api/v1/agents/tier", {
        glagol_parent,
        login,
        project_name,
    });
    return resp.data;
}

export async function removeAgentFromProject({
                                                 login,
                                                 project_name,
                                             }: TierMutationPayload): Promise<string> {
    const glagol_parent = getGlagolParent();
    const resp: AxiosResponse<string> = await axios.delete("/api/v1/agents/tier", {
        data: { glagol_parent, login, project_name },
    });
    return resp.data;
}


type LogApiResponse = {
    status: "success" | "error";
    result?: Record<string, OperatorLogEntry[]>;
    message?: string;
};

export async function getOperatorLog(params: {
    users: string | number | Array<string | number>;
    date_start: string; // YYYY-MM-DD
    date_end: string;   // YYYY-MM-DD
    glagol_parent?: string; // опционально, по умолчанию возьмём из стора
}): Promise<Record<string, OperatorLogEntry[]>> {
    const glagol_parent = params.glagol_parent ?? getGlagolParent();
    const { users, date_start, date_end } = params;

    const resp: AxiosResponse<LogApiResponse> = await axios.get(
        "/api/v1/states_and_statuses/log",
        {
            params: { glagol_parent, users, date_start, date_end },
            paramsSerializer: (p) => {
                // корректно сериализуем users как повторяющийся query (?users=1&users=2)
                const usp = new URLSearchParams();
                usp.set("glagol_parent", glagol_parent);
                (Array.isArray(users) ? users : [users]).forEach((u) =>
                    usp.append("users", String(u))
                );
                usp.set("date_start", date_start);
                usp.set("date_end", date_end);
                return usp.toString();
            },
        }
    );

    if (resp.data?.status !== "success") {
        throw new Error(resp.data?.message || "log request failed");
    }
    return resp.data?.result ?? {};
}
