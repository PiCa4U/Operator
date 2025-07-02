import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { store } from "./redux/store";
import { Provider } from "react-redux";
import './socket';
import { setCredentials } from './redux/credentialsSlice';

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

// ---- Mocked options ----
const mockOptions = [
    {
        name: 'Operator 1000',
        sipLogin: '1000',
        worker: '4.fs@akc24.ru',
        fsServer: '85.193.89.178',
        sessionKey: 'fdsakr2349fnewrnk23le0fw8er',
    },
    {
        name: 'Operator 1001',
        sipLogin: '1001',
        worker: '2.fs@akc24.ru',
        fsServer: '85.193.89.179',
        sessionKey: 'testsessionkey1001',
    },
    {
        name: 'Manager 1013',
        sipLogin: '1013',
        worker: '26.fs@akc24.ru',
        fsServer: '85.193.89.179',
        sessionKey: 'testsessionkey2000dsda',
    },
    {
        name: 'Operator 1012',
        sipLogin: '1012',
        worker: '1.fs@akc24.ru',
        fsServer: '85.193.89.179',
        sessionKey: 'testsessionkey2000dsda',
    }
];

// ---- Main wrapper ----
function MockSelector() {
    const [selected, setSelected] = useState<null | typeof mockOptions[0]>(null);

    if (!selected) {
        return (
            <div style={{ padding: 20 }}>
                <h3>Select mock credentials</h3>
                {mockOptions.map((opt) => (
                    <button
                        key={opt.name}
                        style={{ display: 'block', margin: '10px 0', padding: '10px 20px' }}
                        onClick={() => {
                            store.dispatch(setCredentials({
                                sessionKey: opt.sessionKey,
                                sipLogin: opt.sipLogin,
                                fsServer: opt.fsServer,
                                worker: opt.worker,
                            }));
                            setSelected(opt);
                        }}
                    >
                        {opt.name}
                    </button>
                ))}
            </div>
        );
    }

    return (
        <Provider store={store}>
            <App />
        </Provider>
    );
}

// ---- Render ----
const root = ReactDOM.createRoot(container);
root.render(<MockSelector />);
reportWebVitals();
