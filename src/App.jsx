import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import WeeklyPlannerPage from './pages/WeeklyPlannerPage';
import { ChatOverlayProvider } from './contexts/ChatOverlayContext';

const SalaComandi = lazy(() => import('./SalaComandi'));

function AppBootFallback() {
  return (
    <div
      style={{ minHeight: '100dvh', width: '100%', background: '#050a12' }}
      aria-busy
      aria-label="Caricamento KentuOS"
    />
  );
}

export default function App() {
  return (
    <ChatOverlayProvider>
      <BrowserRouter>
        <Suspense fallback={<AppBootFallback />}>
          <Routes>
            <Route path="/" element={<SalaComandi />} />
            {/* Legacy deep-link: `/planner` → home (WeeklyBuilder smantellato). */}
            <Route path="/planner" element={<WeeklyPlannerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ChatOverlayProvider>
  );
}
