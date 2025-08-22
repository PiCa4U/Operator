// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState, store } from './redux/store';
import { SipProvider } from './context/SipContext';
import MainApp from './components/mainApp';
import { enableWebRTC, disableWebRTC } from './socket';
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";
import axios from "axios";

type PhoneMode = 'softphone' | 'webrtc';

export default function App() {
    const { sipLogin = '' } = store.getState().credentials;
    const { ha1, turnCreds } = useSelector((s: RootState) => s.operator);
    const [userInfo, setUserInfo] = useState<any>({});

    const [mode, setMode] = useState<PhoneMode>(() => {
        const saved = localStorage.getItem('phone_mode') as PhoneMode | null;
        return saved === 'softphone' || saved === 'webrtc' ? saved : 'webrtc';
    });

    // ====== данные для поповера ======
    const name = userInfo?.name ?? '—';
    const glagol = userInfo?.glagol_service ?? '—';
    const phoneLogin = userInfo?.login ?? '—';
    const role = userInfo?.type === "manager" ? "Менеджер" : "Оператор" ?? '—';

    // поповер состояние и закрытие по клику вне
    const [infoOpen, setInfoOpen] = useState(false);
    const infoRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!infoRef.current) return;
            if (!infoRef.current.contains(e.target as Node)) setInfoOpen(false);
        };
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
    }, []);

    // включаем/выключаем подписки сокета под режим
    useEffect(() => {
        localStorage.setItem('phone_mode', mode);
        if (mode === 'webrtc') enableWebRTC();
        else disableWebRTC();
        return () => disableWebRTC();
    }, [mode]);

    useEffect(() => console.log("userInfo: ", userInfo), [userInfo]);

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await axios.get("/api/v1/agents", {
                    params: { glagol_parent: "fs.at.akc24.ru" }
                });
                const matchOperator = res.data.result.find((oper: any) => oper.login === sipLogin);
                setUserInfo(matchOperator);
            } catch (err) {
                console.error("Ошибка загрузки агентов:", err);
            }
        };
        fetchAgents();
    }, [sipLogin]);

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

    // маленькая helper‑строка для поповера
    const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, padding: '4px 0' }}>
            <div style={{ color: '#6c757d' }}>{label}:</div>
            <div style={{ fontWeight: 600, fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}>
                {value || '—'}
            </div>
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
        <QueryClientProvider client={queryClient}>
            {/* Верхняя панель */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                }}
            >
                <div style={{ marginLeft: 24 }}>
                    {ModeSwitch}
                </div>

                {/* Бейдж оператора с поповером */}
                <div
                    ref={infoRef}
                    style={{ marginRight: 20, position: 'relative', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={() => setInfoOpen(true)}
                    onMouseLeave={() => setInfoOpen(false)}
                >
                    <button
                        type="button"
                        className="btn btn-light"
                        onClick={() => setInfoOpen(v => !v)}
                        title={name}
                        aria-haspopup="dialog"
                        aria-expanded={infoOpen}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontWeight: 700,
                            borderRadius: 999,
                            padding: '6px 12px',
                            boxShadow: '0 1px 2px rgba(0,0,0,.06)'
                        }}
                    >
                        <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {name}
                        </span>
                        {/* Иконка info */}
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12" />
                            <path d="M12 8.25a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-1.25 2.5a1.25 1.25 0 1 1 2.5 0v6a1.25 1.25 0 1 1-2.5 0v-6Z" fill="currentColor"/>
                        </svg>
                    </button>

                    {infoOpen && (
                        <div
                            role="dialog"
                            style={{
                                position: 'absolute',
                                right: 0,
                                top: 'calc(100% + 8px)',
                                minWidth: 280,
                                background: '#fff',
                                border: '1px solid rgba(0,0,0,.08)',
                                borderRadius: 12,
                                padding: 12,
                                boxShadow: '0 8px 24px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.06)',
                                zIndex: 1000
                            }}
                        >
                            <div style={{ fontSize: 12, color: '#6c757d', marginBottom: 8 }}>
                                Аккаунт оператора
                            </div>

                            <Row label="Имя" value={name} />
                            <Row label="Glagol логин" value={glagol} mono />
                            <Row label="Логин телефонии" value={phoneLogin} mono />
                            <Row label="Роль" value={role} />

                            <div style={{ height: 4 }} />
                            <div style={{ fontSize: 11, color: "#98a2b3" }}>
                                Наведи курсор или нажми ещё раз, чтобы скрыть.
                            </div>
                        </div>
                    )}
                </div>
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
        </QueryClientProvider>
    );
}
