// src/App.tsx
import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {RootState, store} from './redux/store';
import { setTurnCreds, setHa1 } from './redux/operatorSlice'; // ваш слайс
import { socket } from './socket';
import { SipProvider } from './context/SipContext';
import MainApp from "./components/mainApp"; // компонент, который показывает «Ждём…»

export default function App() {
    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;

    // 1) Читаем из Redux те значения, которые нам нужны для инициализации SIP
    const { ha1, turnCreds } = useSelector((s: RootState) => s.operator);

    // 2) Локальный флаг «готовности»: true, когда и ha1, и turnCreds пришли
    const [ready, setReady] = useState(false);

    // 4) Как только оба значения есть — переключаем ready
    useEffect(() => {
        if (ha1 && turnCreds) {
            setReady(true);
        }
    }, [ha1, turnCreds]);

    // 5) Пока не готовы — показываем экран ожидания
    if (!ready) {
        return <div>Подготовка софтфона, ждём TURN-креды…</div>
    }

    // 6) Как только готовы — монтируем провайдер и всю логику WebPhone
    return (
        <SipProvider
            userId={sipLogin}
            ha1={ha1}
            wsServer="wss://24webrtc.ru/ws"
            turnCreds={turnCreds}
        >
            <MainApp />
        </SipProvider>
    );
}
