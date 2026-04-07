import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import { RootState } from "./store";

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
    tab?: string | number;
    [key: string]: any;
}

export interface MonitorData {
    monitorUsers: Record<string, any>;
    monitorProjects: Record<string, string>;
    allProjects: Record<string, any>;
    monitorCallcenter: Record<string, string[]>;
}

export interface OperatorProfile {
    login?: string;
    name?: string;
    glagol_service?: string | null;
    type?: string | null;
    [key: string]: any;
}

export interface OperatorAccess {
    loaded: boolean;
    presetIds: number[] | null;
    flowIds: number[] | null;
    queues: string[];
    bootstrapProjects: string[];
    allowedProjects: string[];
}

export interface TurnCredentials {
    urls: string[];
    username: string;
    credential: string;
}
export interface OperatorState {
    fsReport: any;
    fsStatus: any;
    interCalls: any
    activeCalls: any;
    roomId: string;
    sessionKey: string;
    name: string;
    monitorData: MonitorData;
    fsReasons: {
        call_reasons: ReasonItem[];
        call_results: ResultItem[];
        as_is_dict: FieldDefinition[];
    } | null;
    userStatuses: Record<string, UserStatus>;
    ha1: string;
    turnCreds: TurnCredentials | null;
    operatorProfile: OperatorProfile | null;
    operatorAccess: OperatorAccess;
}

export interface UserStatus {
    ping_status?: string;
    sofia_status?: string;
    state?: string;
    status?: string;
    [key: string]: any;
}

const initialState: OperatorState = {
    fsReport: {},
    fsStatus: {},
    interCalls: {},
    activeCalls: {},
    roomId: '',
    sessionKey: '',
    name: 'Имя по умолчанию',
    monitorData: {
        monitorUsers: {},
        monitorProjects: {},
        allProjects: {},
        monitorCallcenter: {},
    },
    fsReasons: null,
    userStatuses: {},
    ha1: "",
    turnCreds: null,
    operatorProfile: null,
    operatorAccess: {
        loaded: false,
        presetIds: null,
        flowIds: null,
        queues: [],
        bootstrapProjects: [],
        allowedProjects: [],
    },
};

export const makeSelectFullProjectPool = (sipLogin: string) =>
    createSelector(
        (state: RootState) => state.operator.monitorData.allProjects,
        (state: RootState) => state.operator.monitorData.monitorCallcenter[sipLogin] || [],
        (allProjects, myProjects) => {
            // Если проектов нет – вернём пустой массив.
            return myProjects
                .map((pName: string) => allProjects[pName])
                // .filter(proj => proj && proj.out_active);
        }
    );

export const selectOperatorProfile = (state: RootState) => state.operator.operatorProfile;
export const selectOperatorAccess = (state: RootState) => state.operator.operatorAccess;

export const selectOperatorAllowedProjects = createSelector(
    [selectOperatorAccess],
    (operatorAccess) => operatorAccess.allowedProjects
);

export const selectOperatorBootstrapProjects = createSelector(
    [selectOperatorAccess],
    (operatorAccess) => operatorAccess.bootstrapProjects
);

export const makeSelectAccessibleProjectPool = (sipLogin: string) =>
    createSelector(
        (state: RootState) => state.operator.monitorData.allProjects,
        selectOperatorAccess,
        (state: RootState) => state.operator.monitorData.monitorCallcenter[sipLogin] || [],
        (allProjects, operatorAccess, legacyProjects) => {
            let projectNames: string[] = legacyProjects;

            if (operatorAccess.loaded) {
                if (operatorAccess.presetIds !== null) {
                    projectNames = operatorAccess.allowedProjects;
                } else if (operatorAccess.bootstrapProjects.length) {
                    projectNames = operatorAccess.bootstrapProjects;
                }
            }

            return projectNames
                .map((pName: string) => allProjects[pName])
                .filter(Boolean);
        }
    );

export const selectAccessibleProjectNames = createSelector(
    [selectOperatorAccess],
    (operatorAccess) => {
        if (operatorAccess.presetIds !== null) {
            return operatorAccess.allowedProjects;
        }

        return operatorAccess.bootstrapProjects;
    }
);

export const selectMyProjects = createSelector(
    [(state: RootState) => state.operator.monitorData.monitorCallcenter, (_: RootState, sipLogin: string) => sipLogin],
    (monitorCallcenter, sipLogin) => monitorCallcenter[sipLogin] || []
);

export const selectUserStatuses = (state: RootState) => state.operator.userStatuses;
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
        setInterCalls(state, action: PayloadAction<any>) {
            if (!isEqual(state.interCalls, action.payload)) {
                state.interCalls = action.payload;
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
        setSessionKey(state, action: PayloadAction<string>) {
            if (state.sessionKey !== action.payload) {
                state.sessionKey = action.payload;
            }
        },
        setUserStatuses(state, action: PayloadAction<Record<string, UserStatus>>) {
            if (!isEqual(state.userStatuses, action.payload)) {
                state.userStatuses = action.payload;
            }
        },
        setHa1(state, action: PayloadAction<string>) {
            state.ha1 = action.payload;
        },
        setTurnCreds(state, action: PayloadAction<TurnCredentials>) {
            state.turnCreds = action.payload;
        },
        setOperatorProfile(state, action: PayloadAction<OperatorProfile | null>) {
            if (!isEqual(state.operatorProfile, action.payload)) {
                state.operatorProfile = action.payload;
            }
        },
        setOperatorAccess(state, action: PayloadAction<OperatorAccess>) {
            if (!isEqual(state.operatorAccess, action.payload)) {
                state.operatorAccess = action.payload;
            }
        },
    },
});

export const {
    setFsReport,
    setFsStatus,
    setActiveCalls,
    setInterCalls,
    setRoomId,
    setName,
    setMonitorData,
    setFsReasons,
    setSessionKey,
    setUserStatuses,
    setHa1,
    setTurnCreds,
    setOperatorProfile,
    setOperatorAccess,
} = operatorSlice.actions;

export default operatorSlice.reducer;
