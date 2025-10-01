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
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ItsmGuidRoute from "./features/itsm/ItsmGuidRoute";
import { webrtcOwner } from './webrtcOwner';

type PhoneMode = 'softphone' | 'webrtc';

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, padding: '4px 0' }}>
        <div style={{ color: '#6c757d' }}>{label}:</div>
        <div style={{ fontWeight: 600, fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}>
            {value || '—'}
        </div>
    </div>
);

type RootHomeProps = {
    ready: boolean;
    mode: PhoneMode;
    setMode: (m: PhoneMode) => void;
    infoOpen: boolean;
    setInfoOpen: (v: boolean) => void;
    infoRef: React.MutableRefObject<HTMLDivElement | null>;
    name: string;
    glagol: string;
    phoneLogin: string;
    role: string;
    sipLogin: string;
    ha1: string;
    turnCreds: any;
    webrtcUrl: string;
    owner: { isOwner: boolean; claim: () => Promise<boolean> };
};

const RootHome: React.FC<RootHomeProps> = ({
                                               ready, mode, setMode, infoOpen, setInfoOpen, infoRef,
                                               name, glagol, phoneLogin, role, sipLogin, ha1, turnCreds, webrtcUrl,
                                               owner
                                           }) => {
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

    // жёлтый баннер – ВНУТРИ верхней полосы, между переключателем и бейджем
    const OwnerBannerInline = (mode === 'webrtc' && !owner.isOwner) ? (
        <div
            role="status"
            style={{
                flex: 1,
                margin: '0 16px',
                background: '#fff3cd',
                border: '1px solid #ffe69c',
                color: '#664d03',
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minWidth: 240
            }}
        >
            <span>Эта вкладка не отвечает за звонки. Телефония активна в другой вкладке.</span>
            <button
                className="btn btn-sm btn-warning"
                onClick={async () => {
                    const ok = await owner.claim();
                    if (!ok) alert('Текущая звонковая вкладка занята (идёт звонок). Попробуйте позже.');
                }}
            >
                Сделать эту вкладку звонковой
            </button>
        </div>
    ) : <div style={{ flex: 1 }} />; // заполнитель, чтобы бейдж справа не прыгал

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
            {/* Верхняя полоса */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                }}
            >
                <div style={{ marginLeft: 24 }}>{ModeSwitch}</div>

                {OwnerBannerInline}

                {/* Бейдж оператора */}
                <div
                    ref={infoRef}
                    style={{ marginRight: 20, position: 'relative', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={() => setInfoOpen(true)}
                    onMouseLeave={() => setInfoOpen(false)}
                >
                    <button
                        type="button"
                        className="btn btn-light"
                        onClick={() => setInfoOpen(!infoOpen)}
                        title={name}
                        aria-haspopup="dialog"
                        aria-expanded={infoOpen}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700,
                            borderRadius: 999, padding: '6px 12px', boxShadow: '0 1px 2px rgba(0,0,0,.06)'
                        }}
                    >
            <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
                        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12" />
                            <path d="M12 8.25a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-1.25 2.5a1.25 1.25 0 1 1 2.5 0v6a1.25 1.25 0 1 1-2.5 0v-6Z" fill="currentColor"/>
                        </svg>
                    </button>

                    {infoOpen && (
                        <div
                            role="dialog"
                            style={{
                                position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 280,
                                background: '#fff', border: '1px solid rgba(0,0,0,.08)', borderRadius: 12,
                                padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.06)', zIndex: 1000
                            }}
                        >
                            <div style={{ fontSize: 12, color: '#6c757d', marginBottom: 8 }}>Аккаунт оператора</div>
                            <Row label="Имя" value={name} />
                            <Row label="Glagol логин" value={glagol} mono />
                            <Row label="Логин телефонии" value={phoneLogin} mono />
                            <Row label="Роль" value={role} />
                            <div style={{ height: 4 }} />
                            <div style={{ fontSize: 11, color: "#98a2b3" }}>Наведи курсор или нажми ещё раз, чтобы скрыть.</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Основное приложение + телефония */}
            <SipProvider
                enabled={mode === 'webrtc' && owner.isOwner}
                userId={sipLogin}
                ha1={ha1}
                wsServer={webrtcUrl}
                turnCreds={turnCreds}
            >
                <MainApp />
            </SipProvider>
        </>
    );
};

export default function App() {
    const {
        sipLogin   = '',
        worker     = '',
        glagolParent = '',
        webrtcUrl = ''
    } = store.getState().credentials;

    const { ha1, turnCreds } = useSelector((s: RootState) => s.operator);
    const [userInfo, setUserInfo] = useState<any>({});
    const [mode, setMode] = useState<PhoneMode>(() => {
        const saved = localStorage.getItem('phone_mode') as PhoneMode | null;
        return saved === 'softphone' || saved === 'webrtc' ? saved : 'webrtc';
    });

    const name = userInfo?.name ?? '—';
    const glagol = userInfo?.glagol_service ?? '—';
    const phoneLogin = userInfo?.login ?? '—';
    const role = userInfo?.type === "manager" ? "Менеджер" : "Оператор" ?? '—';

    const [infoOpen, setInfoOpen] = useState(false);
    const infoRef = useRef<HTMLDivElement | null>(null);

    const [isOwner, setIsOwner] = useState<boolean>(false);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!infoRef.current) return;
            if (!infoRef.current.contains(e.target as Node)) setInfoOpen(false);
        };
        document.addEventListener('click', onDocClick);
        return () => document.removeEventListener('click', onDocClick);
    }, []);

    useEffect(() => {
        webrtcOwner.init(`fs:${sipLogin}`);
        const unsubscribe = webrtcOwner.subscribe((owner) => setIsOwner(owner));
        return () => { unsubscribe(); };
    }, [sipLogin]);

    useEffect(() => {
        localStorage.setItem('phone_mode', mode);
        if (mode === 'webrtc' && isOwner) enableWebRTC();
        else disableWebRTC();
        return () => disableWebRTC();
    }, [mode, isOwner]);

    useEffect(() => {
        const fetchAgents = async () => {
            try {
                const res = await axios.get("/api/v1/agents", { params: { glagol_parent: glagolParent } });
                const matchOperator = res.data.result.find((oper: any) => oper.login === sipLogin);
                setUserInfo(matchOperator);
            } catch (err) {
                console.error("Ошибка загрузки агентов:", err);
            }
        };
        fetchAgents();
    }, [sipLogin, glagolParent]);

    // Рендер блокируем только когда вкладка — владелец в режиме WebRTC и ещё нет creds
    const ready = useMemo(
        () => (mode === 'webrtc' && isOwner) ? Boolean(ha1 && turnCreds) : true,
        [mode, isOwner, ha1, turnCreds]
    );

    return (
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route path="/itsm/:guid" element={<ItsmGuidRoute />} />
                    <Route
                        path="/*"
                        element={
                            <RootHome
                                ready={ready}
                                mode={mode}
                                setMode={setMode}
                                infoOpen={infoOpen}
                                setInfoOpen={setInfoOpen}
                                infoRef={infoRef}
                                name={name}
                                glagol={glagol}
                                phoneLogin={phoneLogin}
                                role={role}
                                sipLogin={sipLogin}
                                ha1={ha1!}
                                turnCreds={turnCreds!}
                                webrtcUrl={webrtcUrl}
                                owner={{ isOwner, claim: () => webrtcOwner.claim() }}
                            />
                        }
                    />
                </Routes>
            </BrowserRouter>
        </QueryClientProvider>
    );
}
