// index.tsx
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
import {SipProvider} from "./context/SipContext";

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

const {
    sessionKey: rawSessionKey,
    sipLogin: rawSipLogin,
    fsServer: rawFsServer,
    worker: rawWorker,
} = container.dataset as Partial<Record<string, string>>;

// Значения по умолчанию, если data-атрибутов нет
const sipLogin = rawSipLogin || '1012';
const fsServer = rawFsServer || 'wwstest.glagol.ai';
const worker   = rawWorker   || '1.fs@akc24.ru';

// Настройка базового URL для axios
axios.defaults.baseURL = `https://${fsServer}`;

// Сохранить креды в Redux
store.dispatch(setCredentials({
    sessionKey: rawSessionKey || '',
    sipLogin,
    fsServer,
    worker,
}));

// --- SSE: подписка единожды при старте приложения ---
const sseUrl = `https://${fsServer}/api/v1/fs_data?sip_login=${encodeURIComponent(sipLogin)}`;
// const evtSource = new EventSource(sseUrl);

// При каждом новом сообщении парсим и диспатчим в стор
// evtSource.onmessage = (e) => {
//     try {
//         const { fs_calls, fs_status, other_users } = JSON.parse(e.data);
//         console.log("e.data: ", e.data)
//         store.dispatch(setFsStatus(fs_status));
//         store.dispatch(setActiveCalls(fs_calls));
//         store.dispatch(setUserStatuses(other_users));
//         // При shutdown корректно закрываем стрим
//         if (fs_status?.status === 'shutdown') {
//             evtSource.close();
//         }
//     } catch (err) {
//         console.error('Failed to parse SSE data:', err);
//     }
// };

// Логируем ошибки (EventSource по дефолту переподключится)
// evtSource.onerror = (err) => {
//     console.error('SSE connection error:', err);
// };
const { ha1, turnCreds } = store.getState().operator;
console.log("555ha1: ",ha1)
console.log("555turnCreds: ",turnCreds)

// --- Рендер React-приложения ---
const root = ReactDOM.createRoot(container);
root.render(
    <Provider store={store}>
        <App />
    </Provider>
);

// Замер производительности
reportWebVitals();
