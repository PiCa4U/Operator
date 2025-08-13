// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState, store } from './redux/store';
import { SipProvider } from './context/SipContext';
import MainApp from './components/mainApp';
import { enableWebRTC, disableWebRTC } from './socket';

type PhoneMode = 'softphone' | 'webrtc';

export default function App() {
    const { sipLogin = '' } = store.getState().credentials;
    const { ha1, turnCreds } = useSelector((s: RootState) => s.operator);

    const [mode, setMode] = useState<PhoneMode>(() => {
        const saved = localStorage.getItem('phone_mode') as PhoneMode | null;
        return saved === 'softphone' || saved === 'webrtc' ? saved : 'webrtc';
    });

    // включаем/выключаем подписки сокета под режим
    useEffect(() => {
        localStorage.setItem('phone_mode', mode);
        if (mode === 'webrtc') enableWebRTC();
        else disableWebRTC();
        return () => disableWebRTC(); // safety при размонтировании
    }, [mode]);

    // готовность нужна только для WebRTC
    const ready = useMemo(() => {
        return mode === 'softphone' ? true : Boolean(ha1 && turnCreds);
    }, [mode, ha1, turnCreds]);

    const ModeSwitch = (
        <div style={{ display: 'flex', gap: 8, padding: 8 }}>
            <button
                className={mode === 'webrtc' ? 'btn btn-success' : 'btn btn-outline-success'}
                onClick={() => setMode('webrtc')}
            >WebRTC</button>
            <button
                className={mode === 'softphone' ? 'btn btn-primary' : 'btn btn-outline-primary'}
                onClick={() => setMode('softphone')}
            >Softphone</button>
        </div>
    );

    if (!ready) {
        return (
            <div style={{ padding: 16 }}>
                {ModeSwitch}
                <div>Подготовка WebRTC: ждём TURN/HA1…</div>
            </div>
        );
    }

    return (
        <>
            <div style={{marginLeft: 40}}>
                {ModeSwitch}
            </div>
            <SipProvider
                enabled={mode === 'webrtc'}
                userId={sipLogin}
                ha1={ha1!}
                wsServer="wss://24webrtc.ru/ws"
                turnCreds={turnCreds!}
            >
                <MainApp />
            </SipProvider>

        </>
    );
}
