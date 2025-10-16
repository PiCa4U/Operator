import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { store } from './redux/store';
import { Provider } from 'react-redux';
import './socket';
import { setCredentials } from './redux/credentialsSlice';
import { setFsStatus, setActiveCalls, setUserStatuses } from './redux/operatorSlice';
import axios from 'axios';
import 'react-datepicker/dist/react-datepicker.css';
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import { setSessionKey as setOpSessionKey } from './redux/operatorSlice';


const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

// читаем ВСЕ нужные data-*
// webrtc — это URL сокета, кладём как строку
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
const sessionKey   = rawSessionKey ||  '437d89ecf560562f073cdd2db2871663b130cb56cabc5830'
const chatServer   = rawChatServer   || 'wwstest.glagol.ai/chat';
const codeServer   = rawCodeServer   || 'wwstest.glagol.ai/code';
const glagolParent = rawGlagolParent || 'fs.at.akc24.ru';
const webrtcUrl    = rawWebrtcUrl    || 'wss://24webrtc.ru/ws';

// axios: базовый URL по fsServer
axios.defaults.baseURL = `https://${fsServer}`;

// Сохраняем ВСЕ в Redux одним экшеном
store.dispatch(setCredentials({
    sessionKey,
    sipLogin,
    fsServer,
    worker,
    chatServer,
    codeServer,
    glagolParent,
    webrtcUrl,
}));

store.dispatch(setOpSessionKey(sessionKey));

// --- SSE (как у тебя; оставлено закомментированным) ---
const sseUrl = `https://${fsServer}/api/v1/fs_data?sip_login=${encodeURIComponent(sipLogin)}`;
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

// --- Рендер React-приложения ---
const root = ReactDOM.createRoot(container);
root.render(
    <Provider store={store}>
        <App />
    </Provider>
);

reportWebVitals();
