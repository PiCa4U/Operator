// src/types/agents.ts
export type Role = "operator" | "manager";
export type AgentPresence = string;

export interface Agent {
    fs_status: boolean;
    login: string;
    name: string;
    role: Role;
    department?: string | null;
    postobrabotka: boolean;     // робот/не робот
    post_obrabotka:boolean
    projects?: string[];        // tiers, может отсутствовать
    status?: AgentPresence;     // если приходит из монитора
    online?: boolean;           // если бек присылает булевый онлайн
}

export interface CreateAgentPayload {
    name: string;
    password?: string;
    role: Role;
    postobrabotka: boolean;
    department?: string;
    login?: string;
}

export interface UpdateAgentPayload {
    login: string;
    name?: string;
    password?: string;
    role?: Role;
    postobrabotka?: boolean;
    department?: string;
}

export interface TierMutationPayload {
    login: string;
    project_name: string;
}

export type RobotFilter = "all" | "robot" | "human";
export type OnlineFilter = "all" | "online" | "offline";

export interface FiltersState {
    name: string;
    projects: string[];
    department: string | null;
    robot: RobotFilter;
    online: OnlineFilter;
}
