// features/tasksTable/tasksTableSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type FilterMethod = '=' | '!=' | 'LIKE' | 'NOT LIKE' | 'IN' | 'NOT IN' | 'DATES';

export type ServerAppliedByCol =
    | { key: string; method: FilterMethod; values: string[] }
    | null;

export type ServerDraftItem = { key: string; method: FilterMethod; values: string[] };
export type ServerDraftByCol = { selectedIdx: number | null; items: ServerDraftItem[] };

export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

export interface TableFilters {
    searchTerm: string;
    selectedOperator: string | null;
    selectedStatus: string | null;
    startDate: string | null; // ISO
    endDate: string | null;   // ISO
    sortConfig: SortConfig;
    rowsPerPage: number;
    currentPage: number;
    unreadOnly: boolean;

    appliedLocalFilters: Record<string, string>;
    appliedServerFilters: Record<string, ServerAppliedByCol>;
    localFilterDraft: Record<string, string>;
    serverFilterDraft: Record<string, ServerDraftByCol>;
}

const defaultFilters: TableFilters = {
    searchTerm: '',
    selectedOperator: null,
    selectedStatus: null,
    startDate: null,
    endDate: null,
    sortConfig: null,
    rowsPerPage: 10,
    currentPage: 1,
    unreadOnly: false,

    appliedLocalFilters: {},
    appliedServerFilters: {},
    localFilterDraft: {},
    serverFilterDraft: {},
};

type Key = string; // `${glagolParent2}:${presetId}`

interface TasksTableState {
    byKey: Record<Key, TableFilters>;
}

const initialState: TasksTableState = { byKey: {} };

const ensure = (state: TasksTableState, key: Key) => {
    if (!state.byKey[key]) state.byKey[key] = { ...defaultFilters };
};

const slice = createSlice({
    name: 'tasksTable',
    initialState,
    reducers: {
        patch(state, action: PayloadAction<{ key: Key; patch: Partial<TableFilters> }>) {
            const { key, patch } = action.payload;
            ensure(state, key);
            state.byKey[key] = { ...state.byKey[key], ...patch };
        },
        reset(state, action: PayloadAction<{ key: Key }>) {
            state.byKey[action.payload.key] = { ...defaultFilters };
        },
        replace(state, action: PayloadAction<{ key: Key; value: TableFilters }>) {
            state.byKey[action.payload.key] = action.payload.value;
        },
    },
});

export const tasksTableActions = slice.actions;
export default slice.reducer;

// селектор
export const selectTableFilters = (key: Key) => (s: any): TableFilters =>
    s.tasksTable?.byKey?.[key] ?? defaultFilters;
