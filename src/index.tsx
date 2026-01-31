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

const ds = container.dataset as Partial<Record<string, string>>;

const pick = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s || "";
};

/** Берём значение из data-атрибута, а если оно пустое/не задано — из дефолта. */
const fromDsOrDefault = (dsVal: string | undefined, defVal: string) =>
    pick(dsVal) || defVal;

/* ====================== DEV mocks (только тест) ====================== */

const DEV_COMMON = {
    fsServer: "wwstest.glagol.ai",
    glagolParent: "fs.at.akc24.ru",
    webrtcUrl: "wss://24webrtc.ru/ws",

    chatServer: "wwstest.glagol.ai/chat",
    codeServer: "wwstest.glagol.ai/code",
} as const;

type DevUser = {
    id: "1012" | "1000";
    label: string;
    sipLogin: string;
    worker: string;
    sessionKey: string;
};

const DEV_USERS: DevUser[] = [
    {
        id: "1012",
        label: "1012 / 1.fs@akc24.ru",
        sipLogin: "1012",
        worker: "1.fs@akc24.ru",
        sessionKey: "s:1.fs@akc24.ru:a2a12459a7432c79002292ec82272189687ee95a94e84e1e",
    },
    {
        id: "1000",
        label: "1000 / 4.fs@akc24.ru",
        sipLogin: "1000",
        worker: "4.fs@akc24.ru",
        sessionKey: "s:4.fs@akc24.ru:3d8686d906d9700d0a4e04e9d8b5f2f60f9e4b725fc35d9d",
    },
];

const LS_DEV_USER = "glagol:devUser:v1";

function getSelectedUserId(): DevUser["id"] {
    const sp = new URLSearchParams(window.location.search);
    const fromQuery = pick(sp.get("devUser") || undefined) as DevUser["id"];
    if (fromQuery === "1012" || fromQuery === "1000") return fromQuery;

    const fromLs = pick(localStorage.getItem(LS_DEV_USER) || undefined) as DevUser["id"];
    if (fromLs === "1012" || fromLs === "1000") return fromLs;

    return "1012";
}

const selectedUserId = getSelectedUserId();
const selectedUser = DEV_USERS.find((u) => u.id === selectedUserId) || DEV_USERS[0];

/* ====================== Final config ====================== */

const sipLogin = fromDsOrDefault(ds.sipLogin, selectedUser.sipLogin);
const worker = fromDsOrDefault(ds.worker, selectedUser.worker);
const sessionKey = fromDsOrDefault(ds.sessionKey, selectedUser.sessionKey);

const fsServer = fromDsOrDefault(ds.fsServer, DEV_COMMON.fsServer);
const glagolParent = fromDsOrDefault(ds.glagolParent, DEV_COMMON.glagolParent);
const webrtcUrl = fromDsOrDefault(ds.webrtc, DEV_COMMON.webrtcUrl);
const chatServer = fromDsOrDefault(ds.chatServer, DEV_COMMON.chatServer);
const codeServer = fromDsOrDefault(ds.codeServer, DEV_COMMON.codeServer);

/* ====================== axios ====================== */

if (fsServer) axios.defaults.baseURL = `https://${fsServer}`;
if (sessionKey) axios.defaults.headers.common["Authorization"] = `Bearer ${sessionKey}`;

/* ====================== Redux bootstrap ====================== */

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

/* ====================== Simple DEV picker UI ====================== */

function DevUserPicker() {
    const [val, setVal] = React.useState<DevUser["id"]>(selectedUserId);

    if (process.env.NODE_ENV === "production") return null;

    const apply = () => {
        localStorage.setItem(LS_DEV_USER, val);
        window.location.reload();
    };

    return (
        <div
            style={{
                position: "fixed",
                left: 12,
                bottom: 12,
                zIndex: 9999,
                padding: 10,
                borderRadius: 10,
                background: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(0,0,0,0.12)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                display: "flex",
                gap: 8,
                alignItems: "center",
            }}
        >
            <div style={{ fontWeight: 700, fontSize: 12, opacity: 0.7 }}>DEV USER</div>

            <select
                className="form-control form-control-sm"
                style={{ minWidth: 220 }}
                value={val}
                onChange={(e) => setVal(e.target.value as DevUser["id"])}
            >
                {DEV_USERS.map((u) => (
                    <option key={u.id} value={u.id}>
                        {u.label}
                    </option>
                ))}
            </select>

            <button className="btn btn-sm btn-primary" onClick={apply}>
                Apply
            </button>
        </div>
    );
}

/* ====================== render ====================== */

const root = ReactDOM.createRoot(container);

root.render(
    <Provider store={store}>
        <>
            <DevUserPicker />
            <App />
        </>
    </Provider>
);

reportWebVitals();
