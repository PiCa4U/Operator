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
const fromDsOrDefault = (dsVal: string | undefined, defVal: string) => pick(dsVal) || defVal;

/* ====================== Profiles ====================== */

type CommonConfig = Readonly<{
    fsServer: string;
    glagolParent: string;
    webrtcUrl: string;
    chatServer: string;
    codeServer: string;
}>;

const DEV_COMMON = {
    fsServer: "wwstest.glagol.ai",
    glagolParent: "fs.at.akc24.ru",
    webrtcUrl: "wss://24webrtc.ru/ws",
    chatServer: "wwstest.glagol.ai/chat",
    codeServer: "wwstest.glagol.ai/code",
} as const satisfies CommonConfig;

const PROD_COMMON = {
    fsServer: "pmpbx.glagol.ai",
    glagolParent: "privet.at.pm.ru",
    webrtcUrl: "wss://pm.24webrtc.ru/ws",
    chatServer: "pmpbx.glagol.ai/chat",
    codeServer: "pmpbx.glagol.ai/code",
} as const satisfies CommonConfig;

type EnvName = "dev" | "prod";

const COMMON_BY_ENV: Record<EnvName, CommonConfig> = {
    dev: DEV_COMMON,
    prod: PROD_COMMON,
};

/* ====================== Users presets ====================== */

const DEV_USERS = [
    {
        id: "1012",
        label: "1012 / 1.fs@akc24.ru",
        sipLogin: "1012",
        worker: "1.fs@akc24.ru",
        sessionKey: "s:1.fs@akc24.ru:b705ae573eeac790b9cad531e867c04b96515a98084fe574",
    },
    {
        id: "1000",
        label: "1000 / 4.fs@akc24.ru",
        sipLogin: "1000",
        worker: "4.fs@akc24.ru",
        sessionKey: "s:4.fs@akc24.ru:91a2eb8fc8ac469a8300f2e3118b93d7ec41357d2f7f6947",
    },
    {
        id: "1014",
        label: "1014 / 3.fs@akc24.ru",
        sipLogin: "1014",
        worker: "3.fs@akc24.ru",
        sessionKey: "s:3.fs@akc24.ru:b163dd22b6fa52c343d431088f16003958675fa2ff095f40",

    }
] as const;

type DevUser = (typeof DEV_USERS)[number];
type DevUserId = DevUser["id"];

const PROD_USERS = [
    {
        id: "1112",
        label: "1112 / 113.privet@pm.ru",
        sipLogin: "1112",
        worker: "113.privet@pm.ru",
        sessionKey: "s:113.privet@pm.ru:fe09fdfc58454897df7d4eb2602ffed2c3bc8fff02165bb8",
    },
] as const;

type ProdUser = (typeof PROD_USERS)[number];
type ProdUserId = ProdUser["id"];

/* ====================== LocalStorage keys ====================== */

const LS_ENV = "glagol:env:v1";
const LS_DEV_USER = "glagol:devUser:v1";
const LS_PROD_USER = "glagol:prodUser:v1";

/* ====================== Env selection ====================== */

function getSelectedEnv(): EnvName {
    // В production всегда prod (и без переключателя)
    if (process.env.NODE_ENV === "production") return "prod";

    const sp = new URLSearchParams(window.location.search);
    const fromQuery = pick(sp.get("env") || undefined) as EnvName;
    if (fromQuery === "dev" || fromQuery === "prod") return fromQuery;

    const fromLs = pick(localStorage.getItem(LS_ENV) || undefined) as EnvName;
    if (fromLs === "dev" || fromLs === "prod") return fromLs;

    return "dev";
}

function getSelectedDevUserId(): DevUserId {
    const sp = new URLSearchParams(window.location.search);

    const fromQuery = pick(sp.get("devUser") || undefined) as DevUserId;
    if (DEV_USERS.some((u) => u.id === fromQuery)) return fromQuery;

    const fromLs = pick(localStorage.getItem(LS_DEV_USER) || undefined) as DevUserId;
    if (DEV_USERS.some((u) => u.id === fromLs)) return fromLs;

    return DEV_USERS[0].id;
}

function getSelectedProdUserId(): ProdUserId {
    const sp = new URLSearchParams(window.location.search);

    const fromQuery = pick(sp.get("prodUser") || undefined) as ProdUserId;
    if (PROD_USERS.some((u) => u.id === fromQuery)) return fromQuery;

    const fromLs = pick(localStorage.getItem(LS_PROD_USER) || undefined) as ProdUserId;
    if (PROD_USERS.some((u) => u.id === fromLs)) return fromLs;

    return PROD_USERS[0].id;
}

/* ====================== Resolve config ====================== */

const activeEnv = getSelectedEnv();
const common = COMMON_BY_ENV[activeEnv];

const selectedDevUserId = getSelectedDevUserId();
const selectedProdUserId = getSelectedProdUserId();

const selectedDevUser = DEV_USERS.find((u) => u.id === selectedDevUserId) || DEV_USERS[0];
const selectedProdUser = PROD_USERS.find((u) => u.id === selectedProdUserId) || PROD_USERS[0];

const fallbackUser = activeEnv === "dev" ? selectedDevUser : selectedProdUser;

// user creds (data-* имеет приоритет!)
const sipLogin = fromDsOrDefault(ds.sipLogin, fallbackUser.sipLogin);
const worker = fromDsOrDefault(ds.worker, fallbackUser.worker);
const sessionKey = fromDsOrDefault(ds.sessionKey, fallbackUser.sessionKey);

// servers (data-* имеет приоритет!)
const fsServer = fromDsOrDefault(ds.fsServer, common.fsServer);
const glagolParent = fromDsOrDefault(ds.glagolParent, common.glagolParent);
const webrtcUrl = fromDsOrDefault(ds.webrtc, common.webrtcUrl);
const chatServer = fromDsOrDefault(ds.chatServer, common.chatServer);
const codeServer = fromDsOrDefault(ds.codeServer, common.codeServer);

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

/* ====================== Simple DEV Config UI ====================== */

function DevConfigPicker() {
    const [env, setEnv] = React.useState<EnvName>(activeEnv);
    const [devUserId, setDevUserId] = React.useState<DevUserId>(selectedDevUserId);
    const [prodUserId, setProdUserId] = React.useState<ProdUserId>(selectedProdUserId);

    const apply = () => {
        localStorage.setItem(LS_ENV, env);

        if (env === "dev") {
            localStorage.setItem(LS_DEV_USER, devUserId);
        } else {
            localStorage.setItem(LS_PROD_USER, prodUserId);
        }

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
                borderRadius: 12,
                background: "rgba(255,255,255,0.96)",
                border: "1px solid rgba(0,0,0,0.12)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                width: 420,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.75 }}>ENV</div>

                <select
                    className="form-control form-control-sm"
                    style={{ width: 120 }}
                    value={env}
                    onChange={(e) => setEnv(e.target.value as EnvName)}
                >
                    <option value="dev">dev</option>
                    <option value="prod">prod</option>
                </select>

                <div style={{ flex: 1 }} />

                <button className="btn btn-sm btn-primary" onClick={apply}>
                    Apply
                </button>
            </div>

            {env === "dev" ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, opacity: 0.7, minWidth: 86 }}>DEV USER</div>

                    <select
                        className="form-control form-control-sm"
                        style={{ flex: 1 }}
                        value={devUserId}
                        onChange={(e) => setDevUserId(e.target.value as DevUserId)}
                    >
                        {DEV_USERS.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.label}
                            </option>
                        ))}
                    </select>
                </div>
            ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, opacity: 0.7, minWidth: 86 }}>PROD USER</div>

                    <select
                        className="form-control form-control-sm"
                        style={{ flex: 1 }}
                        value={prodUserId}
                        onChange={(e) => setProdUserId(e.target.value as ProdUserId)}
                    >
                        {PROD_USERS.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.label}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6 }}>
                Итоговые значения: <br />
                <b>sipLogin</b>: {sipLogin} <br />
                <b>worker</b>: {worker} <br />
                <b>fsServer</b>: {fsServer} <br />
                <b>webrtc</b>: {webrtcUrl} <br />
                <b>chat</b>: {chatServer} <br />
            </div>
        </div>
    );
}

/* ====================== render ====================== */

const root = ReactDOM.createRoot(container);

root.render(
    <Provider store={store}>
        <>
            {process.env.NODE_ENV !== "production" && <DevConfigPicker/>}
            <App/>
        </>
    </Provider>
);

reportWebVitals();

// src/index.tsx
//  import React from "react";
//  import ReactDOM from "react-dom/client";
//  import "./index.css";
//  import App from "./App";
//  import reportWebVitals from "./reportWebVitals";
//
//  import { Provider } from "react-redux";
//  import { store } from "./redux/store";
//
//  import "./socket";
//
//  import { setCredentials } from "./redux/credentialsSlice";
//  import { setSessionKey as setOpSessionKey } from "./redux/operatorSlice";
//
//  import axios from "axios";
//
//  import "react-datepicker/dist/react-datepicker.css";
//  import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
//
//  const container = document.getElementById("root");
//  if (!container) throw new Error("Root container not found");
//
//  const ds = container.dataset as Partial<Record<string, string>>;
//
//  const pick = (v: string | undefined) => {
//      const s = (v ?? "").trim();
//      return s || "";
//  };
//
//  /** Берём значение из data-атрибута, а если оно пустое/не задано — из дефолта. */
//  const fromDsOrDefault = (dsVal: string | undefined, defVal: string) =>
//      pick(dsVal) || defVal;
//
//  /* ====================== Final config (ТОЛЬКО data-атрибуты) ====================== */
//  /**
//   * Ожидаемые data-* на #root (пример):
//   *  data-sip-login="1012"
//   *  data-worker="1.fs@akc24.ru"
//   *  data-session-key="s:..."
//   *  data-fs-server="wwstest.glagol.ai"
//   *  data-glagol-parent="fs.at.akc24.ru"
//   *  data-webrtc="wss://24webrtc.ru/ws"
//   *  data-chat-server="wwstest.glagol.ai/chat"
//   *  data-code-server="wwstest.glagol.ai/code"
//   *
//   * В React это читается как:
//   *  ds.sipLogin, ds.worker, ds.sessionKey, ds.fsServer, ds.glagolParent, ds.webrtc, ds.chatServer, ds.codeServer
//   */
//
//  const sipLogin = pick(ds.sipLogin);
//  const worker = pick(ds.worker);
//  const sessionKey = pick(ds.sessionKey);
//
//  const fsServer = pick(ds.fsServer);
//  const glagolParent = pick(ds.glagolParent);
//  const webrtcUrl = pick(ds.webrtc);
//  const chatServer = pick(ds.chatServer);
//  const codeServer = pick(ds.codeServer);
//
//  // Если хочешь СТРОГО без дефолтов — оставь так.
//  // Если надо "минимальные дефолты" (например, пустая строка), можно:
//  // const sipLogin = fromDsOrDefault(ds.sipLogin, "");
//  // ... и т.д.
//
//  /* ====================== axios ====================== */
//
//  // baseURL ставим только если есть fsServer
//  if (fsServer) {
//      // если передали уже с протоколом — не ломаем
//      const hasProto = /^[a-zA-Z][\w+.-]*:\/\//.test(fsServer);
//      axios.defaults.baseURL = hasProto ? fsServer : `https://${fsServer}`;
//  }
//
//  // Authorization ставим только если есть sessionKey
//  if (sessionKey) {
//      axios.defaults.headers.common["Authorization"] = `Bearer ${sessionKey}`;
//  } else {
//      // на всякий случай не тащим старый заголовок
//      delete axios.defaults.headers.common["Authorization"];
//  }
//
//  /* ====================== Redux bootstrap ====================== */
//
//  store.dispatch(
//      setCredentials({
//          sessionKey,
//          sipLogin,
//          fsServer,
//          worker,
//          chatServer,
//          codeServer,
//          glagolParent,
//          webrtcUrl,
//      })
//  );
//
//  store.dispatch(setOpSessionKey(sessionKey));
//
//  /* ====================== render ====================== */
//
//  const root = ReactDOM.createRoot(container);
//
//  root.render(
//      <Provider store={store}>
//          <App />
//      </Provider>
//  );
//
//  reportWebVitals();
