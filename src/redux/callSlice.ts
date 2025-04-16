// src/redux/callSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { socket } from '../socket';
import { getCookies } from '../utils';
import { RootState } from './store';

// Определяем тип состояния вызова
interface CallState {
    activeCallUuid: string;
    callType: 'call' | 'redirect';
    callActive: boolean;
    phone: string;
    outExtension: string;
    outExtensions: any[]; // список доступных линий для исходящих вызовов
    outBaseFields: Record<string, any>;
    error: string | null;
}

const initialState: CallState = {
    activeCallUuid: '',
    callType: 'call',
    callActive: false,
    phone: '',
    outExtension: '',
    outExtensions: [],
    outBaseFields: {},
    error: null,
};

// Асинхронный экшен для инициации вызова
export const initiateCall = createAsyncThunk<
    { activeCallUuid: string; callType: 'call' | 'redirect' },
    { phone: string; callType: 'call' | 'redirect'; activeCallUuid?: string },
    { state: RootState; rejectValue: string }
>(
    'call/initiateCall',
    async (params, { getState, rejectWithValue }) => {
        // Получаем нужные данные из куков и Redux‑state
        const sessionKey = getCookies('session_key');
        const sipLogin = getCookies('sip_login');
        const fsServer = getCookies('fs_server');
        const roomId = getState().room.roomId || 'default_room';
        const worker = getCookies('worker');

        // Если есть назначенные линии, выбираем первую
        const outExtensions = getState().call.outExtensions;
        let selectedExtension = '';
        if (outExtensions.length > 0) {
            selectedExtension = outExtensions[0].prefix;
        }

        // Если линии нет (и вызов обычный), возвращаем ошибку
        if (!selectedExtension && params.callType === 'call') {
            return rejectWithValue('Нет назначенной линии для исходящих вызовов');
        }

        // Формируем объект данных для вызова
        const payload = {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            room_id: roomId,
            fs_server: fsServer,
            phone: params.phone,
            out_extension: selectedExtension,
            call_type: params.callType,
            ...(params.callType === 'redirect' && { uuid: params.activeCallUuid }),
        };

        // Отправляем запрос через сокет
        // socket.emit('click_to_call', payload);

        // Здесь можно добавить логику ожидания ответа от сервера (например, через событие "click_to_call_start")
        // В данном примере сразу возвращаем данные, предполагая успешное начало вызова.
        return {
            activeCallUuid: params.callType === 'redirect' ? (params.activeCallUuid || '') : 'newCallUuid',
            callType: params.callType,
        };
    }
);

const callSlice = createSlice({
    name: 'call',
    initialState,
    reducers: {
        setPhone(state, action: PayloadAction<string>) {
            state.phone = action.payload;
        },
        setOutExtensions(state, action: PayloadAction<any[]>) {
            state.outExtensions = action.payload;
        },
        setActiveCallUuid(state, action: PayloadAction<string>) {
            state.activeCallUuid = action.payload;
        },
        setCallType(state, action: PayloadAction<'call' | 'redirect'>) {
            state.callType = action.payload;
        },
        setCallActive(state, action: PayloadAction<boolean>) {
            state.callActive = action.payload;
        },
        clearCallError(state) {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(initiateCall.fulfilled, (state, action) => {
                state.activeCallUuid = action.payload.activeCallUuid;
                state.callType = action.payload.callType;
                state.callActive = true;
                state.error = null;
            })
            .addCase(initiateCall.rejected, (state, action) => {
                state.error = action.payload || 'Ошибка при инициировании вызова';
                state.callActive = false;
            });
    },
});

export const { setPhone, setOutExtensions, setActiveCallUuid, setCallType, setCallActive, clearCallError } =
    callSlice.actions;

export default callSlice.reducer;
