import axios, { AxiosResponse } from "axios";
import {
    Agent,
    CreateAgentPayload,
    UpdateAgentPayload,
    TierMutationPayload,
    Role, OperatorLogEntry, ActivityLogPerUser,
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

type ActivityLogApiResponse = {
    status?: "success" | "error";
    result?: ActivityLogPerUser;
    message?: string;
};

export async function getActivityLog(params: {
    users: string | number | Array<string | number>;
    from_dt: string;
    to_dt: string;
    glagol_parent?: string;
}): Promise<ActivityLogPerUser> {
    const glagol_parent = params.glagol_parent ?? getGlagolParent();
    const { users, from_dt, to_dt } = params;

    const resp: AxiosResponse<ActivityLogApiResponse | ActivityLogPerUser> = await axios.get(
        "/api/v1/activity/log",
        {
            params: { glagol_parent, users, from_dt, to_dt },
            paramsSerializer: () => {
                const usp = new URLSearchParams();
                usp.set("glagol_parent", glagol_parent);
                (Array.isArray(users) ? users : [users]).forEach((u) =>
                    usp.append("users", String(u))
                );
                usp.set("from_dt", from_dt);
                usp.set("to_dt", to_dt);
                return usp.toString();
            },
        }
    );

    const data: any = resp.data ?? {};

    if ("status" in data || "result" in data) {
        if (data.status && data.status !== "success") {
            throw new Error(data.message || "activity request failed");
        }
        return (data.result ?? {}) as ActivityLogPerUser;
    }

    return data as ActivityLogPerUser;
}

export async function getAgents(params?: { field_filters?: string | null }): Promise<Agent[]> {
    const glagol_parent = getGlagolParent();

    const resp: AxiosResponse<ApiUsersResponse> = await axios.get("/api/v1/users", {
        params: {
            glagol_parent,
            ...(params?.field_filters ? { field_filters: params.field_filters } : {}),
        },
    });

    const usersObj = resp.data?.users ?? {};

    const agents: Agent[] = Object.entries(usersObj).map(([login, u]) => {
        const talk = u?.talk && typeof u.talk === "object" ? (u.talk as ApiUser["talk"]) : null;

        return {
            login,
            ...u,
            talk,
            role: (u?.type ?? "operator") as Role,
            postobrabotka: typeof u?.post === "boolean" ? u.post : Boolean(u?.post_obrabotka),
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
    date_start: string;
    date_end: string;
    glagol_parent?: string;
}): Promise<Record<string, OperatorLogEntry[]>> {
    const glagol_parent = params.glagol_parent ?? getGlagolParent();
    const { users, date_start, date_end } = params;

    const resp: AxiosResponse<LogApiResponse> = await axios.get(
        "/api/v1/states_and_statuses/log",
        {
            params: { glagol_parent, users, date_start, date_end },
            paramsSerializer: (p) => {
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
