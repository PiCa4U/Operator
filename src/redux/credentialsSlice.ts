import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from './store';

interface CredentialsState {
    sessionKey: string;
    sipLogin: string;
    fsServer: string;
    worker: string;
}

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
        setCredentials(state, action: PayloadAction<CredentialsState>) {
            state.sessionKey = action.payload.sessionKey;
            state.sipLogin   = action.payload.sipLogin;
            state.fsServer   = action.payload.fsServer;
            state.worker     = action.payload.worker;
        },
    },
});

export const {
    setSessionKey,
    setSipLogin,
    setFsServer,
    setWorker,
    setCredentials,
} = credentialsSlice.actions;

export const selectSessionKey = (state: RootState) => state.credentials.sessionKey;
export const selectSipLogin    = (state: RootState) => state.credentials.sipLogin;
export const selectFsServer    = (state: RootState) => state.credentials.fsServer;
export const selectWorker      = (state: RootState) => state.credentials.worker;

export default credentialsSlice.reducer;
