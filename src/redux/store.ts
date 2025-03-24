import { configureStore } from '@reduxjs/toolkit';
import operatorReducer from './operatorSlice';
import roomReducer from './roomSlice';
import callReducer from './callSlice';

export const store = configureStore({
    reducer: {
        operator: operatorReducer,
        room: roomReducer,
        call: callReducer,
    },
});

// Тип корневого состояния
export type RootState = ReturnType<typeof store.getState>;
// Тип dispatch
export type AppDispatch = typeof store.dispatch;
