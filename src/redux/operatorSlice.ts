import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {RootState} from "./store";

interface MonitorData {
    monitorUsers: Record<string, any>;
    monitorProjects: Record<string, string>;
    allProjects: Record<string, any>;
    monitorCallcenter: Record<string, string[]>;
}

interface OperatorState {
    fsReport: any;
    fsStatus: any;
    activeCalls: any;
    roomId: string;
    name: string;
    // Добавляем новые поля для monitor_projects
    monitorData: MonitorData;
}

const initialState: OperatorState = {
    fsReport: {},
    fsStatus: {},
    activeCalls: {},
    roomId: '',
    name: 'Имя по умолчанию',
    monitorData: {
        monitorUsers: {},
        monitorProjects: {},
        allProjects: {},
        monitorCallcenter: {},
    },
};

export function selectMyProjects(state: RootState, sipLogin: string) {
    return state.operator.monitorData.monitorCallcenter[sipLogin] || [];
}

export function selectProjectPool(state: RootState, sipLogin: string) {
    const { allProjects } = state.operator.monitorData;
    const myProjects = selectMyProjects(state, sipLogin);
    return myProjects.filter((pName: string) => allProjects[pName]?.out_active);
}

const operatorSlice = createSlice({
    name: 'operator',
    initialState,
    reducers: {
        setFsReport(state, action: PayloadAction<any>) {
            state.fsReport = action.payload;
        },
        setFsStatus(state, action: PayloadAction<any>) {
            state.fsStatus = action.payload;
        },
        setActiveCalls(state, action: PayloadAction<any>) {
            state.activeCalls = action.payload;
        },
        setRoomId(state, action: PayloadAction<string>) {
            state.roomId = action.payload;
        },
        setName(state, action: PayloadAction<string>) {
            state.name = action.payload;
        },

        // Новый экшен для записи monitorData
        setMonitorData(state, action: PayloadAction<MonitorData>) {
            state.monitorData = action.payload;
        },
    },
});

export const {
    setFsReport,
    setFsStatus,
    setActiveCalls,
    setRoomId,
    setName,
    setMonitorData, // <-- Экспортируем новый экшен
} = operatorSlice.actions;

export default operatorSlice.reducer;
