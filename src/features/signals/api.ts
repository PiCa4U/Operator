import axios from "axios";
import { store } from "../../redux/store";

export type SignalType = "info" | "warning" | "error" | "success";
export type SignalItem = {
    id: number;
    signal_type: SignalType;
    title: string;
    message: string;
    login: string;
    department: string | null;
};

function getCreds() {
    const { credentials } = store.getState();
    const { sipLogin = "", worker = "", glagolParent = "" } = credentials || {};
    return { sipLogin, worker, glagol_parent: glagolParent || "" };
}

export async function getSignals(managerLogin: string): Promise<SignalItem[]> {
    const { glagol_parent } = getCreds();
    const { data } = await axios.get("/api/v1/signals/notifications", {
        params: { glagol_parent, login: managerLogin },
    });
    return data?.data ?? [];
}

export async function markSignalsRead(payload: { login: string; ids: number[] }) {
    // const { glagol_parent } = getCreds();
    // const body = { ...payload, glagol_parent };
    // const { data } = await axios.post("/api/v1/signals/notifications", body);
    const { data } = await axios.post("/api/v1/signals/notifications", payload);
    return data;
}
