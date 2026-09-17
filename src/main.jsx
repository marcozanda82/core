import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx';
import './index.css';

// ============================================================
// PERFORMANCE PROFILING: App Start
// ============================================================
performance.mark('app-start');
console.log('[PERF] APP START marked at', performance.now());

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
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
);
