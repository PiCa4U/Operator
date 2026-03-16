import axios from "axios";
import { store } from "../../redux/store";

export type SignalType = "info" | "warning" | "error" | "success";

export type SignalCondition = {
    type?: string;
    limit?: number;
    value?: number;
    status?: string;
    department?: string | null;
};

export type SignalItem = {
    id: number;
    signal_type: SignalType;
    title?: string;
    message?: string;
    login?: string;
    department?: string | null;
    condition?: SignalCondition;
};

const ALLOWED_SIGNAL_TYPES = new Set<SignalType>(["info", "warning", "error", "success"]);

function normalizeSignal(raw: any): SignalItem | null {
    const id = Number(raw?.signal_id ?? raw?.id);
    if (!Number.isFinite(id)) return null;

    const rawType = String(raw?.signal_type || "").trim() as SignalType;
    const signal_type: SignalType = ALLOWED_SIGNAL_TYPES.has(rawType) ? rawType : "info";

    const title = String(raw?.title ?? "").trim() || undefined;
    const message = String(raw?.message ?? "").trim() || undefined;
    const login = String(raw?.login ?? "").trim() || undefined;

    let department: string | null | undefined = raw?.department;
    if (department != null) {
        department = String(department).trim() || null;
    }

    const condition =
        raw?.condition && typeof raw.condition === "object"
            ? {
                type: raw.condition.type,
                limit: Number.isFinite(Number(raw.condition.limit))
                    ? Number(raw.condition.limit)
                    : undefined,
                value: Number.isFinite(Number(raw.condition.value))
                    ? Number(raw.condition.value)
                    : undefined,
                status: raw.condition.status,
                department:
                    raw.condition.department == null
                        ? null
                        : String(raw.condition.department).trim() || null,
            }
            : undefined;

    return {
        id,
        signal_type,
        title,
        message,
        login,
        department: department ?? null,
        condition,
    };
}

export function normalizeSignalsPayload(payload: any): SignalItem[] {
    const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
            ? payload
            : payload
                ? [payload]
                : [];

    return rows
        .map(normalizeSignal)
        .filter((item: any): item is SignalItem => Boolean(item))
        .sort((a: any, b: any) => b.id - a.id);
}

function getCreds() {
    const { credentials } = store.getState();
    const { sipLogin = "", worker = "", glagolParent = "" } = credentials || {};
    return { sipLogin, worker, glagol_parent: glagolParent || "" };
}

export async function getSignals(managerLogin: string): Promise<SignalItem[]> {
    const { glagol_parent } = getCreds();

    const { data } = await axios.get("/api/v1/signals/notifications", {
        params: {
            glagol_parent,
            login: managerLogin,
        },
    });

    return normalizeSignalsPayload(data?.data ?? data ?? []);
}