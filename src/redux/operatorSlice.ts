import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import { RootState } from "./store";

// Типы для данных
export interface ReasonItem {
    id: string;
    name: string;
    description?: string;
    project_name: string;
    [key: string]: any;
}
export interface ResultItem {
    id: string;
    name: string;
    description?: string;
    project_name: string;
    [key: string]: any;
}
export interface FieldDefinition {
    field_id: string;
    field_name: string;
    field_type: string;
    field_vals: string | null;
    editable: boolean;
    must_have: boolean;
    project_name: string;
    [key: string]: any;
}

export interface MonitorData {
    monitorUsers: Record<string, any>;
    monitorProjects: Record<string, string>;
    allProjects: Record<string, any>;
    monitorCallcenter: Record<string, string[]>;
}

export interface OperatorState {
    fsReport: any;
    fsStatus: any;
    activeCalls: any;
    roomId: string;
    name: string;
    monitorData: MonitorData;
    fsReasons: {
        call_reasons: ReasonItem[];
        call_results: ResultItem[];
        as_is_dict: FieldDefinition[];
    } | null;
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
    fsReasons: null,
};

// Мемоизированный селектор для полной коллекции проектов для оператора
export const makeSelectFullProjectPool = (sipLogin: string) =>
    createSelector(
        (state: RootState) => state.operator.monitorData.allProjects,
        (state: RootState) => state.operator.monitorData.monitorCallcenter[sipLogin] || [],
        (allProjects, myProjects) => {
            // Если проектов нет – вернём пустой массив.
            return myProjects
                .map((pName: string) => allProjects[pName])
                .filter(proj => proj && proj.out_active);
        }
    );

// Другие селекторы, если нужно
export const selectMyProjects = createSelector(
    [(state: RootState) => state.operator.monitorData.monitorCallcenter, (_: RootState, sipLogin: string) => sipLogin],
    (monitorCallcenter, sipLogin) => monitorCallcenter[sipLogin] || []
);

export const selectProjectPool = createSelector(
    [
        (state: RootState) => state.operator.monitorData.allProjects,
        selectMyProjects,
    ],
    (allProjects, myProjects) =>
        myProjects.filter((pName: string) => allProjects[pName]?.out_active)
);

const operatorSlice = createSlice({
    name: 'operator',
    initialState,
    reducers: {
        setFsReport(state, action: PayloadAction<any>) {
            if (!isEqual(state.fsReport, action.payload)) {
                state.fsReport = action.payload;
            }
        },
        setFsStatus(state, action: PayloadAction<any>) {
            if (!isEqual(state.fsStatus, action.payload)) {
                state.fsStatus = action.payload;
            }
        },
        setActiveCalls(state, action: PayloadAction<any>) {
            if (!isEqual(state.activeCalls, action.payload)) {
                state.activeCalls = action.payload;
            }
        },
        setRoomId(state, action: PayloadAction<string>) {
            if (state.roomId !== action.payload) {
                state.roomId = action.payload;
            }
        },
        setName(state, action: PayloadAction<string>) {
            if (state.name !== action.payload) {
                state.name = action.payload;
            }
        },
        setMonitorData(state, action: PayloadAction<MonitorData>) {
            if (!isEqual(state.monitorData, action.payload)) {
                state.monitorData = action.payload;
            }
        },
        setFsReasons(state, action: PayloadAction<{
            call_reasons: ReasonItem[];
            call_results: ResultItem[];
            as_is_dict: FieldDefinition[];
        } | null>) {
            if (!isEqual(state.fsReasons, action.payload)) {
                state.fsReasons = action.payload;
            }
        },
    },
});

export const {
    setFsReport,
    setFsStatus,
    setActiveCalls,
    setRoomId,
    setName,
    setMonitorData,
    setFsReasons,
} = operatorSlice.actions;

export default operatorSlice.reducer;
