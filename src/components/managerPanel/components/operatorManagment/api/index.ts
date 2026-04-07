import axios, { AxiosResponse } from "axios";
import {
    Agent,
    CreateAgentPayload,
    UpdateAgentPayload,
    TierMutationPayload,
    Role,
    OperatorLogEntry,
    ActivityLogPerUser,
    QueueInfo,
    FlowInfo,
    PresetSummary,
} from "../types";
import { store } from "../../../../../redux/store";

function getGlagolParent(): string {
    return store.getState()?.credentials?.glagolParent || "";
}

function getWorker(): string {
    return store.getState()?.credentials?.worker || "";
}

function normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

function normalizeNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item));
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
    queues?: string[] | null;
    presets?: number[] | null;
    flows?: number[] | null;
    status: string | null;
    state: string | null;
    post: boolean | null;
    user_fields?: Record<string, any> | null;
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

export async function getAgents(): Promise<Agent[]> {
    const glagol_parent = getGlagolParent();

    const resp: AxiosResponse<ApiUsersResponse> = await axios.get("/api/v1/users", {
        params: {
            glagol_parent,
        },
    });

    const usersObj = resp.data?.users ?? {};

    const agents: Agent[] = Object.entries(usersObj).map(([login, u]) => {
        const talk = u?.talk && typeof u.talk === "object" ? (u.talk as ApiUser["talk"]) : null;
        const queues = normalizeStringArray(u?.queues ?? u?.projects);
        const projects = normalizeStringArray(u?.projects ?? u?.queues);

        return {
            login,
            ...u,
            talk,
            queues,
            projects,
            presets: normalizeNumberArray(u?.presets),
            flows: normalizeNumberArray(u?.flows),
            role: (u?.type ?? "operator") as Role,
            postobrabotka: typeof u?.post === "boolean" ? u.post : Boolean(u?.post_obrabotka),
            user_fields: u?.user_fields ?? {},
        } as Agent;
    });

    return agents;
}

export async function getQueues(): Promise<QueueInfo[]> {
    const glagol_parent = getGlagolParent();
    const resp: AxiosResponse<any> = await axios.get("/api/v1/queues", {
        params: { glagol_parent },
    });

    const items = Array.isArray(resp.data) ? resp.data : resp.data?.result ?? [];

    return items
        .filter(Boolean)
        .map((item: any) => ({
            queue: String(item?.queue || "").trim(),
            label: item?.label ?? null,
            project: item?.project ?? null,
            strategy: item?.strategy ?? null,
        }))
        .filter((item: QueueInfo) => Boolean(item.queue));
}

export async function getFlows(project?: string): Promise<FlowInfo[]> {
    const glagol_parent = getGlagolParent();

    try {
        const resp: AxiosResponse<any> = await axios.get("/api/v1/flow", {
            params: {
                glagol_parent,
                ...(project ? { project } : {}),
            },
        });

        const items = Array.isArray(resp.data) ? resp.data : resp.data?.result ?? [];

        return items
            .filter(Boolean)
            .map((item: any) => ({
                id: Number(item?.id),
                glagol_parent: item?.glagol_parent,
                project: item?.project ?? null,
                name: String(item?.name || "").trim(),
                description: item?.description ?? null,
                priority: item?.priority ?? null,
                active: item?.active,
            }))
            .filter((item: FlowInfo) => Number.isInteger(item.id) && Boolean(item.name));
    } catch (error: any) {
        if (error?.response?.status === 404) {
            return [];
        }
        throw error;
    }
}

export async function getPresets(projects: string[] = []): Promise<PresetSummary[]> {
    const glagol_parent = getGlagolParent();
    const worker = getWorker();

    const resp: AxiosResponse<any> = await axios.post("/api/v1/get_preset_list", {
        glagol_parent,
        worker,
        projects,
        role: "manager",
    });

    const items = Array.isArray(resp.data) ? resp.data : resp.data?.result ?? [];

    return items
        .filter(Boolean)
        .map((item: any) => ({
            id: Number(item?.id),
            preset_name: String(item?.preset_name || "").trim(),
            projects: normalizeStringArray(item?.projects),
            active: item?.active,
        }))
        .filter((item: PresetSummary) => Number.isInteger(item.id) && Boolean(item.preset_name));
}

export async function createAgent(payload: CreateAgentPayload): Promise<unknown> {
    const glagol_parent = getGlagolParent();
    const resp: AxiosResponse<unknown> = await axios.post("/api/v1/agents/create", {
        glagol_parent,
        ...payload,
    });
    return resp.data;
}

export async function updateAgent(payload: UpdateAgentPayload): Promise<unknown> {
    const glagol_parent = getGlagolParent();
    const resp: AxiosResponse<unknown> = await axios.put("/api/v1/agents/update", {
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
