// src/api/agents.ts
import axios, { AxiosResponse } from "axios";
import {
    Agent,
    CreateAgentPayload,
    UpdateAgentPayload,
    TierMutationPayload
} from "../types";

const glagol_parent = "fs.at.akc24.ru";

export async function getAgents(): Promise<Agent[]> {
    const resp: AxiosResponse<Agent[]> = await axios.get("/api/v1/users", {
        params: glagol_parent,
    });
    return resp.data;
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
