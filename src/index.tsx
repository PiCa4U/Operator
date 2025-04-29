import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import {store} from "./redux/store";
import {Provider} from "react-redux";
import './socket'

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

document.cookie = "sip_login=1000; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT";
document.cookie = "worker=1.fs@akc24.ru; path=/; expires=Fri, 31 Dec 9999 23:59:59 GMT";

root.render(
    <Provider store={store}>
        <App />
    </Provider>
);

reportWebVitals();
