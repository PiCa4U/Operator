// src/api/agents.ts
import axios, { AxiosResponse } from "axios";
import {
    Agent,
    CreateAgentPayload,
    UpdateAgentPayload,
    TierMutationPayload, Role
} from "../types";

const glagol_parent = "fs.at.akc24.ru";

type ApiUser = {
    glagol_service: string | null;
    type: "operator" | "manager" | null;
    name: string | null;
    post_obrabotka: boolean | null;
    is_deleted: boolean | null;
    department: string | null;
    fs_status: boolean;          // bool онлайн из ФС
    projects: string[] | null;
    status: string;              // "Logged Out" и т.п.
    state: string;               // "Waiting"/"Idle"/...
    post: boolean;
    talk: string;
};

type ApiUsersResponse = {
    status: "success";
    users: Record<string, ApiUser>;
};

export async function getAgents(): Promise<Agent[]> {
    const resp: AxiosResponse<ApiUsersResponse> = await axios.get("/api/v1/users", {
        params: { glagol_parent },
    });

    const usersObj = resp.data?.users ?? {};

    const agents: Agent[] = Object.entries(usersObj).map(([login, u]) => {
        return {
            // 1) добавляем login из ключа
            login,

            // 2) пробрасываем все поля сервера как есть (fs_status, status, state, post, post_obrabotka, projects, talk, type, и т.д.)
            ...u,

            // 3) НЕразрушающие алиасы для фронта (оригиналы сохраняются):
            //    role нужен таблице, но не затираем server.type
            role: (u?.type ?? "operator") as Role,
            //    для совместимости с существующим UI (badge "Робот/Человек")
            postobrabotka:
                typeof u?.post === "boolean"
                    ? u.post
                    : Boolean(u?.post_obrabotka),
        } as Agent;
    });

    return agents;
}

export async function createAgent(payload: CreateAgentPayload): Promise<string> {
    const resp: AxiosResponse<string> = await axios.post("/api/v1/agents/create", {
        glagol_parent,
        ...payload,
    });
    return resp.data;
}

export async function updateAgent(payload: UpdateAgentPayload): Promise<string> {
    const resp: AxiosResponse<string> = await axios.put("/api/v1/agents/update", {
        glagol_parent,
        ...payload,
    });
    return resp.data;
}

export async function deleteAgent(login: string): Promise<string> {
    const resp: AxiosResponse<string> = await axios.delete("/api/v1/agents/delete", {
        data: { glagol_parent, login },
    });
    return resp.data;
}

export async function addAgentToProject({ login, project_name }: TierMutationPayload): Promise<string> {
    const resp: AxiosResponse<string> = await axios.post("/api/v1/agents/tier", {
        glagol_parent,
        login,
        project_name,
    });
    return resp.data;
}

export async function removeAgentFromProject({ login, project_name }: TierMutationPayload): Promise<string> {
    const resp: AxiosResponse<string> = await axios.delete("/api/v1/agents/tier", {
        data: { glagol_parent, login, project_name },
    });
    return resp.data;
}
