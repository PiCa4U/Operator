import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { initiateCall, setPhone } from '../redux/callSlice';

export const useCallLogic = () => {
    const dispatch = useDispatch();
    const callState = useSelector((state: RootState) => state.call);


    const handlePhoneChange = (phone: string) => {
        const cleanedPhone = phone.replace(/\D/g, '');
        dispatch(setPhone(cleanedPhone));
    };

    const callByNumber = (phone: string) => {
        const type = callState.callActive ? 'redirect' : 'call';
        // dispatch(initiateCall({ phone, callType: type, activeCallUuid: callState.activeCallUuid }));
    };

    return { callState, handlePhoneChange, callByNumber };
};
