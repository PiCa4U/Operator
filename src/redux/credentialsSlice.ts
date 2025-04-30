import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from './store';

// Интерфейс состояния для хранения параметров подключения
interface CredentialsState {
    sessionKey: string;
    sipLogin: string;
    fsServer: string;
    worker: string;
}

// Начальное состояние — пустые строки или возможные дефолтные значения
const initialState: CredentialsState = {
    sessionKey: '',
    sipLogin: '',
    fsServer: '',
    worker: '',
};

const credentialsSlice = createSlice({
    name: 'credentials',
    initialState,
    reducers: {
        setSessionKey(state, action: PayloadAction<string>) {
            state.sessionKey = action.payload;
        },
        setSipLogin(state, action: PayloadAction<string>) {
            state.sipLogin = action.payload;
        },
        setFsServer(state, action: PayloadAction<string>) {
            state.fsServer = action.payload;
        },
        setWorker(state, action: PayloadAction<string>) {
            state.worker = action.payload;
        },
        // опциональный экшен для массовой загрузки сразу всех значений
        setCredentials(state, action: PayloadAction<CredentialsState>) {
            state.sessionKey = action.payload.sessionKey;
            state.sipLogin   = action.payload.sipLogin;
            state.fsServer   = action.payload.fsServer;
            state.worker     = action.payload.worker;
        },
    },
});

// Экспорт экшенов
export const {
    setSessionKey,
    setSipLogin,
    setFsServer,
    setWorker,
    setCredentials,
} = credentialsSlice.actions;

// Селекторы для получения данных из стейта
export const selectSessionKey = (state: RootState) => state.credentials.sessionKey;
export const selectSipLogin    = (state: RootState) => state.credentials.sipLogin;
export const selectFsServer    = (state: RootState) => state.credentials.fsServer;
export const selectWorker      = (state: RootState) => state.credentials.worker;

// Редьюсер для подключения в store
export default credentialsSlice.reducer;
