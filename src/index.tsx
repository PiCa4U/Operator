import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import {store} from "./redux/store";
import {Provider} from "react-redux";
import './socket'
import { setCredentials } from './redux/credentialsSlice';
import axios from "axios";


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

const sipLogin   = rawSipLogin   || '1000';
const fsServer   = rawFsServer   || 'wwstest.glagol.ai';
const worker     = rawWorker     || '4.fs@akc24.ru';

// axios.defaults.baseURL = `http://${fsServer}:8000`;
axios.defaults.baseURL = `https://${fsServer}`;


store.dispatch(setCredentials({
    sessionKey: "",
    sipLogin,
    fsServer: "",
    worker,
}));

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

root.render(
    <Provider store={store}>
        <App />
    </Provider>
);

reportWebVitals();
