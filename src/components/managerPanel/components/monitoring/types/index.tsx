export type UserTalk = {
    phone?: string;
    project?: string;
    duration?: string; // "HH:MM:SS"
    [k: string]: any;
};

export type UserInfo = {
    glagol_service?: string | null;
    type?: string | null;
    name?: string | null;
    post_obrabotka?: boolean | null;
    is_deleted?: boolean | null;
    department?: string | null;
    fs_status?: boolean;
    projects?: string[];
    status?: string | null;
    state?: string | null;
    post?: boolean;
    talk?: UserTalk | Record<string, never>;
    [k: string]: any;
};

export type UsersResponse = {
    status: "success" | "error";
    users: Record<string, UserInfo>;
};
