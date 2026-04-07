export type Role = "operator" | "manager";
export type AgentPresence = string;
export type UserFieldType = "regular" | "textarea" | "select" | "number" | "date" | "many";

export type FieldFilterOp = "eq" | "neq" | "like" | "not_like" | "in" | "not_in";

export type AppliedFieldFilter = {
    fieldSlugs: string[];
    op: FieldFilterOp;
    values: string[];
};

export type UserFieldDef = {
    id?: number;
    slug: string;
    name: string;
    description?: string | null;
    field_type: UserFieldType;
    field_value?: string | null;
    active: boolean;
};

export type UserFieldsMap = Record<string, any>;

export type CreateUserFieldPayload = {
    name: string;
    description?: string | null;
    field_type: UserFieldType;
    field_value?: string | null;
    active?: boolean;
};

export interface Agent {
    fs_status: boolean;
    login: string;
    name: string;
    role: Role;
    department?: string | null;
    postobrabotka: boolean;
    post_obrabotka: boolean;
    queues?: string[];
    presets?: number[];
    flows?: number[];
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
    user_fields?: UserFieldsMap;
}

export interface QueueInfo {
    queue: string;
    label?: string | null;
    project?: string | null;
    strategy?: string | null;
}

export interface FlowInfo {
    id: number;
    glagol_parent?: string;
    project?: string | null;
    name: string;
    description?: string | null;
    priority?: number | null;
    active?: boolean;
}

export interface PresetSummary {
    id: number;
    preset_name: string;
    projects?: string[];
    active?: boolean;
}

export interface OperatorLogEntry {
    status: string | null;
    state: string | null;
    reason: string | null;
    datetime: string;
}

/* ========= Activity log ========= */

export interface ActivityInterval {
    from: string;
    to: string;
    window_active: number[];
    scroll_active: number[];
    input_active: number[];
    score: number[];
}

export interface ActivityUrlSession {
    url: string;
    activity_intervals: ActivityInterval[];
}

export interface ActivityItem {
    activity_labels: string[];
    url_session: Record<string, ActivityUrlSession>;
}

/** login -> массив блоков активности */
export type ActivityLogPerUser = Record<string, ActivityItem[]>;

export interface CreateAgentPayload {
    name: string;
    password?: string;
    role: Role;
    postobrabotka: boolean;
    department?: string;
    login?: string;
    preset_ids?: number[];
    flow_ids?: number[];
    user_fields?: UserFieldsMap;
}

export interface UpdateAgentPayload {
    login: string;
    name?: string;
    password?: string;
    role?: Role;
    postobrabotka?: boolean;
    department?: string;
    preset_ids?: number[];
    flow_ids?: number[];
    user_fields?: UserFieldsMap;
}

export interface TierMutationPayload {
    login: string;
    project_name: string;
}

export type RobotFilter = "all" | "robot" | "human";
export type OnlineFilter = "all" | "online" | "offline";

export interface FiltersState {
    name: string;
    queues: string[];
    department: string | null;
    departments: string[];
    robot: RobotFilter;
    online: OnlineFilter;
    field_filters?: AppliedFieldFilter | null;
}
