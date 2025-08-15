// src/features/signals/api.ts
import axios from "axios";

const glagol_parent = "fs.at.akc24.ru";

export type SignalType = "info" | "warning" | "error" | "success";
export type SignalItem = {
    id: number;
    signal_type: SignalType;
    title: string;
    message: string;
    login: string;
    department: string | null;
};

export async function getSignals(managerLogin: string): Promise<SignalItem[]> {
    const { data } = await axios.get("/api/v1/signals/notifications", {
        params: { glagol_parent, login: managerLogin },
    });
    return data?.data ?? [];
}

export async function markSignalsRead(payload: { login: string; ids: number[] }) {
    const { data } = await axios.post("/api/v1/signals/notifications", payload);
    return data;
}
