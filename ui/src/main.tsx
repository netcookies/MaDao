import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './design-system/theme.css';
import './base.css';
import './shell.css';
import './shared-bridge.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
