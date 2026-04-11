import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/** 1% of real inner height — fallback when `100dvh` alone is off (e.g. some iOS toolbars). */
function syncViewportHeightVar() {
  if (typeof window === 'undefined') return;
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
syncViewportHeightVar();
window.addEventListener('resize', syncViewportHeightVar);
window.visualViewport?.addEventListener('resize', syncViewportHeightVar);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
