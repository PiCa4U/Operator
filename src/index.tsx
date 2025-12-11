import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { store } from './redux/store';
import { Provider } from 'react-redux';
import './socket';
import { setCredentials } from './redux/credentialsSlice';
import {
    setFsStatus,
    setActiveCalls,
    setUserStatuses,
    setSessionKey as setOpSessionKey,
} from './redux/operatorSlice';
import axios from 'axios';
import 'react-datepicker/dist/react-datepicker.css';
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

// читаем ВСЕ нужные data-*
const {
    sessionKey: rawSessionKey,
    sipLogin: rawSipLogin,
    fsServer: rawFsServer,
    worker: rawWorker,
    chatServer: rawChatServer,
    codeServer: rawCodeServer,
    webrtc: rawWebrtcUrl,
    glagolParent: rawGlagolParent,
} = container.dataset as Partial<Record<string, string>>;

// дефолты (если не передали атрибуты)
const sipLogin     = rawSipLogin     || '1000';
const fsServer     = rawFsServer     || 'wwstest.glagol.ai';
const worker       = rawWorker       || '4.fs@akc24.ru';
// общий дефолтный ключ (используется только там, где не переопределяем профилем)
const sessionKey   = rawSessionKey || 'efa01b6be8b079bab901b519640bcc7ee547a14635e80d6cdfbc5e527248e62b67bc5110';
const chatServer   = rawChatServer   || 'wwstest.glagol.ai/chat';
const codeServer   = rawCodeServer   || 'wwstest.glagol.ai/code';
const glagolParent = rawGlagolParent || 'fs.at.akc24.ru';
const webrtcUrl    = rawWebrtcUrl    || 'wss://24webrtc.ru/ws';

// axios: базовый URL по fsServer
axios.defaults.baseURL = `https://${fsServer}`;

// --- SSE URL (как у тебя; оставляем закомментированным) ---
const sseUrl = `https://${fsServer}/api/v1/fs_data?sip_login=${encodeURIComponent(sipLogin)}`;

// ===== СТАРЫЙ БУТСТРАП (оставлен, но закомментирован) =====
// store.dispatch(setCredentials({
//     sessionKey,
//     sipLogin,
//     fsServer,
//     worker,
//     chatServer,
//     codeServer,
//     glagolParent,
//     webrtcUrl,
// }));
//
// store.dispatch(setOpSessionKey(sessionKey));
//
// const evtSource = new EventSource(sseUrl);
// evtSource.onmessage = (e) => {
//   try {
//     const { fs_calls, fs_status, other_users } = JSON.parse(e.data);
//     store.dispatch(setFsStatus(fs_status));
//     store.dispatch(setActiveCalls(fs_calls));
//     store.dispatch(setUserStatuses(other_users));
//     if (fs_status?.status === 'shutdown') {
//       evtSource.close();
//     }
//   } catch (err) {
//     console.error('Failed to parse SSE data:', err);
//   }
// };
// evtSource.onerror = (err) => {
//   console.error('SSE connection error:', err);
// };

const root = ReactDOM.createRoot(container);

/**
 * В проде — ведём себя как раньше (читаем data-* или дефолты и сразу стартуем).
 * В dev (localhost) — просим выбрать профиль оператора для тестов.
 */

// ===== КОМПОНЕНТ ДЛЯ DEV РЕЖИМА (выбор оператора) =====
const DevBootstrap: React.FC = () => {
    const [profileId, setProfileId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!profileId) return;

        // два профиля на выбор, у каждого свой session_key
        const profile =
            profileId === '1000'
                ? {
                    sipLogin: '1000',
                    worker: '4.fs@akc24.ru',
                    sessionKey:
                        '197dcf472e5e5a011a8dbef4774c5f6ecc1c77251260a301e35f6f152c7af0356527f248',
                }
                : {
                    sipLogin: '1012',
                    worker: '1.fs@akc24.ru',
                    sessionKey:
                        'b67705eef2f4ea78a50fd6630213e06180875970abb966842f1d0a8f74d17eecc0d184a9',
                };

        // базовый URL уже установлен выше, но продублируем на всякий случай
        axios.defaults.baseURL = `https://${fsServer}`;

        // пишем креды в Redux
        store.dispatch(
            setCredentials({
                sessionKey: profile.sessionKey,
                sipLogin: profile.sipLogin,
                fsServer,
                worker: profile.worker,
                chatServer,
                codeServer,
                glagolParent,
                webrtcUrl,
            })
        );

        // sessionKey в операторском слайсе — тоже из профиля
        store.dispatch(setOpSessionKey(profile.sessionKey));

        // Если нужно, тут же можно включить SSE под конкретный sipLogin:
        // const devSseUrl = `https://${fsServer}/api/v1/fs_data?sip_login=${encodeURIComponent(profile.sipLogin)}`;
        // const evtSource = new EventSource(devSseUrl);
        // ...
    }, [profileId]);

    if (!profileId) {
        // экран выбора профиля: 1000 / 1012
        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#121212',
                    color: '#fff',
                    fontFamily:
                        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
            >
                <div
                    style={{
                        padding: '32px',
                        borderRadius: '12px',
                        background: '#1e1e1e',
                        boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
                        maxWidth: '420px',
                        width: '100%',
                    }}
                >
                    <h2 style={{ marginBottom: '16px', fontSize: '20px' }}>
                        Выбор профиля оператора (dev)
                    </h2>
                    <p style={{ marginBottom: '24px', fontSize: '14px', opacity: 0.8 }}>
                        Запускаем localhost с одним из преднастроенных операторов (логин + worker +
                        свой session_key). Дальше уже будут подтягиваться твои моковые данные.
                    </p>

                    <button
                        type="button"
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: '1px solid #3f51b5',
                            background: '#3f51b5',
                            color: '#fff',
                            fontWeight: 500,
                            cursor: 'pointer',
                            marginBottom: '12px',
                        }}
                        onClick={() => setProfileId('1000')}
                    >
                        Оператор 1000 — worker 4.fs@akc24.ru
                        <br />
                        <span style={{ fontSize: '11px', opacity: 0.8 }}>
                            session_key: efa0…e62b67bc5110
                        </span>
                    </button>

                    <button
                        type="button"
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: '1px solid #4caf50',
                            background: '#4caf50',
                            color: '#fff',
                            fontWeight: 500,
                            cursor: 'pointer',
                        }}
                        onClick={() => setProfileId('1012')}
                    >
                        Оператор 1012 — worker 1.fs@akc24.ru
                        <br />
                        <span style={{ fontSize: '11px', opacity: 0.8 }}>
                            session_key: 17a6…321d82f2e
                        </span>
                    </button>

                    <p style={{ marginTop: '16px', fontSize: '12px', opacity: 0.6 }}>
                        Это всё временно для тестов. Старый бутстрап из data-* оставлен
                        закомментированным в index.tsx.
                    </p>
                </div>
            </div>
        );
    }

    // профиль выбран → приложение работает как обычно
    return <App />;
};

// ===== РЕНДЕР =====

if (process.env.NODE_ENV === 'production') {
    // ПРОД: сразу используем креды (почти как старый код, только без SSE)
    store.dispatch(
        setCredentials({
            sessionKey,
            sipLogin,
            fsServer,
            worker,
            chatServer,
            codeServer,
            glagolParent,
            webrtcUrl,
        })
    );
    store.dispatch(setOpSessionKey(sessionKey));

    root.render(
        <Provider store={store}>
            <App />
        </Provider>
    );
} else {
    // DEV: сначала показываем выбор оператора
    root.render(
        <Provider store={store}>
            <DevBootstrap />
        </Provider>
    );
}

reportWebVitals();
