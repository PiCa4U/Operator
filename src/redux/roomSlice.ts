import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface RoomState {
    roomId: string | null;
}

const initialState: RoomState = {
    roomId: null,
};

const roomSlice = createSlice({
    name: 'room',
    initialState,
    reducers: {
        setRoomId: (state, action: PayloadAction<string>) => {
            state.roomId = action.payload;
        },
    },
});

export const { setRoomId } = roomSlice.actions;
export default roomSlice.reducer;
