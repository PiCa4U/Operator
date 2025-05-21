import { configureStore } from '@reduxjs/toolkit';
import operatorReducer from './operatorSlice';
import roomReducer from './roomSlice';
import credentialsSlice from "./credentialsSlice";

export const store = configureStore({
    reducer: {
        operator: operatorReducer,
        room: roomReducer,
        credentials: credentialsSlice
    },
});

// Тип корневого состояния
export type RootState = ReturnType<typeof store.getState>;
// Тип dispatch
export type AppDispatch = typeof store.dispatch;
