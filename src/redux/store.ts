// store.ts
import { configureStore } from '@reduxjs/toolkit';
import operatorReducer from './operatorSlice';
import credentialsSlice from './credentialsSlice';

// ⬇️ твой новый слайс (как в примере выше)
import tasksTableReducer from './tasksTableSlice';

export const store = configureStore({
    reducer: {
        operator: operatorReducer,
        credentials: credentialsSlice,
        tasksTable: tasksTableReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
