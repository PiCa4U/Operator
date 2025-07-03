import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import {store} from "./redux/store";
import {Provider} from "react-redux";
import './socket'
import { setCredentials } from './redux/credentialsSlice';


const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

const {
    sessionKey: rawSessionKey,
    sipLogin: rawSipLogin,
    fsServer: rawFsServer,
    worker: rawWorker,
} = container.dataset as Partial<Record<string, string>>;

//TODO TEST MOCKs
// const sessionKey = rawSessionKey || 'fdsakr2349fnewrnk23le0fw8er';
// const sipLogin   = rawSipLogin   || '1003';
// const fsServer   = rawFsServer   || '158.160.64.67';
// const worker     = rawWorker     || '10.lotus.at.glagol.ai';

const sessionKey = rawSessionKey || 'fdsakr2349fnewrnk23le0fw8er';
const sipLogin   = rawSipLogin   || '1012';
const fsServer   = rawFsServer   || '85.193.89.178';
const worker     = rawWorker     || '1.fs.at.akc24.ru';

store.dispatch(setCredentials({
    sessionKey,
    sipLogin,
    fsServer,
    worker,
}));


const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// document.cookie = "session_key=fdsakr2349fnewrnk23le0fw8er; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT";
// document.cookie = "fs_server=85.193.89.178; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT";
// document.cookie = "sip_login=1012; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT";
// document.cookie = "worker=1.fs.at.akc24.ru; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT";

root.render(
    <Provider store={store}>
        <App />
    </Provider>
);

reportWebVitals();
