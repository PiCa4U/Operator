// src/redux/screenShareSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ScreenShareStatus = "idle" | "requesting" | "sharing" | "denied" | "error";

type ScreenShareState = {
    status: ScreenShareStatus;
    error: string | null;
    grantedOnce: boolean; // ✅ важно
};

const initialState: ScreenShareState = {
    status: "idle",
    error: null,
    grantedOnce: false,
};

const screenShareSlice = createSlice({
    name: "screenShare",
    initialState,
    reducers: {
        setStatus(state, a: PayloadAction<ScreenShareStatus>) {
            state.status = a.payload;
            if (a.payload !== "error") state.error = null;
        },
        setError(state, a: PayloadAction<string>) {
            state.status = "error";
            state.error = a.payload || "Ошибка";
        },
        clearError(state) {
            state.error = null;
            if (state.status === "error") state.status = "idle";
        },
        setGrantedOnce(state, a: PayloadAction<boolean>) {
            state.grantedOnce = a.payload;
        },
    },
});

export const { setStatus, setError, clearError, setGrantedOnce } = screenShareSlice.actions;
export default screenShareSlice.reducer;
