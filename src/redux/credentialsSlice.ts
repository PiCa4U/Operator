import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

// Единый стор для параметров подключения и сопутствующих конфигов
export interface CredentialsState {
    sessionKey: string;
    sipLogin: string;
    fsServer: string;
    worker: string;

    // Доп. значения из data-атрибутов
    chatServer?: string;
    codeServer?: string;
    glagolParent?: string;

    // ВАЖНО: webrtc — это ССЫЛКА на WebSocket (или другой сокет), а не boolean
    webrtcUrl?: string;
}

const initialState: CredentialsState = {
    sessionKey: '',
    sipLogin: '',
    fsServer: '',
    worker: '',

    chatServer: '',
    codeServer: '',
    glagolParent: '',
    webrtcUrl: '',
};

const credentialsSlice = createSlice({
    name: 'credentials',
    initialState,
    reducers: {
        // точечные сеттеры (оставляем для совместимости/удобства)
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
        setChatServer(state, action: PayloadAction<string | undefined>) {
            state.chatServer = action.payload ?? '';
        },
        setCodeServer(state, action: PayloadAction<string | undefined>) {
            state.codeServer = action.payload ?? '';
        },
        setGlagolParent(state, action: PayloadAction<string | undefined>) {
            state.glagolParent = action.payload ?? '';
        },
        setWebrtcUrl(state, action: PayloadAction<string | undefined>) {
            state.webrtcUrl = action.payload ?? '';
        },

        // массовая загрузка: можно передавать частичный объект
        setCredentials(state, action: PayloadAction<Partial<CredentialsState>>) {
            Object.assign(state, action.payload);
        },
        resetCredentials: () => initialState,
    },
});

export const {
    setSessionKey,
    setSipLogin,
    setFsServer,
    setWorker,
    setChatServer,
    setCodeServer,
    setGlagolParent,
    setWebrtcUrl,
    setCredentials,
    resetCredentials,
} = credentialsSlice.actions;

export default credentialsSlice.reducer;

/* --------- селекторы --------- */
export const selectCredentials   = (s: RootState) => s.credentials;
export const selectSessionKey    = (s: RootState) => s.credentials.sessionKey;
export const selectSipLogin      = (s: RootState) => s.credentials.sipLogin;
export const selectFsServer      = (s: RootState) => s.credentials.fsServer;
export const selectWorker        = (s: RootState) => s.credentials.worker;
export const selectChatServer    = (s: RootState) => s.credentials.chatServer;
export const selectCodeServer    = (s: RootState) => s.credentials.codeServer;
export const selectGlagolParent  = (s: RootState) => s.credentials.glagolParent;
export const selectWebrtcUrl     = (s: RootState) => s.credentials.webrtcUrl;
