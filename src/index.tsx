// src/index.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

import { Provider } from "react-redux";
import { store } from "./redux/store";

import "./socket";

import { setCredentials } from "./redux/credentialsSlice";
import { setSessionKey as setOpSessionKey } from "./redux/operatorSlice";

import axios from "axios";

import "react-datepicker/dist/react-datepicker.css";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container not found");

const isProd = process.env.NODE_ENV === "production";

const ds = container.dataset as Partial<Record<string, string>>;

const pick = (v: string | undefined, fallback = "") => {
    const s = (v ?? "").trim();
    return s || fallback;
};

const sipLogin = pick(ds.sipLogin);
const worker = pick(ds.worker);
const sessionKey = pick(ds.sessionKey);

const fsServer = pick(ds.fsServer);
const glagolParent = pick(ds.glagolParent);
const webrtcUrl = pick(ds.webrtc); // data-webrtc
const chatServer = pick(ds.chatServer);
const codeServer = pick(ds.codeServer);

// В проде — обязательно требуем все атрибуты, чтобы билд не “уехал” на пустые значения
if (isProd) {
    const missing: string[] = [];
    if (!sipLogin) missing.push("data-sip-login");
    if (!worker) missing.push("data-worker");
    if (!sessionKey) missing.push("data-session-key");
    if (!fsServer) missing.push("data-fs-server");
    if (!glagolParent) missing.push("data-glagol-parent");
    if (!webrtcUrl) missing.push("data-webrtc");
    if (!chatServer) missing.push("data-chat-server");
    if (!codeServer) missing.push("data-code-server");

    if (missing.length) {
        throw new Error(
            `[BOOT] Missing required attributes on #root: ${missing.join(", ")}`
        );
    }
}

if (fsServer) {
    axios.defaults.baseURL = `https://${fsServer}`;
}
if (sessionKey) {
    axios.defaults.headers.common["Authorization"] = `Bearer ${sessionKey}`;
}

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

const root = ReactDOM.createRoot(container);

root.render(
    <Provider store={store}>
        <App />
    </Provider>
);

reportWebVitals();
