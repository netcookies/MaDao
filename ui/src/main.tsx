import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { getScreenshotTarget, ScreenshotScene } from './testing/ScreenshotScene';
import './design-system/theme.css';
import './tailwind.css';
import './base.css';

const screenshotTarget = getScreenshotTarget();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {screenshotTarget ? <ScreenshotScene /> : <App />}
  </React.StrictMode>
);
