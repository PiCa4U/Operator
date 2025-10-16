export type Role = "operator" | "manager";
export type AgentPresence = string;

export interface Agent {
    fs_status: boolean;
    login: string;
    name: string;
    role: Role;
    department?: string | null;
    postobrabotka: boolean;
    post_obrabotka: boolean;
    projects?: string[];
    status?: AgentPresence;
    online?: boolean;
    glagol_service: string;
    talk?: {
        phone?: string;
        project?: string;
        duration?: string;
        [k: string]: unknown;
    } | null;

}


export interface OperatorLogEntry {
    status: string | null;
    state: string | null;
    reason: string | null;
    datetime: string; // 'YYYY-MM-DD HH:mm:ss'
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
    departments: string[];
    robot: RobotFilter;
    online: OnlineFilter;
}
