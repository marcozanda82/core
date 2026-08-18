import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import WeeklyPlannerPage from './pages/WeeklyPlannerPage';
import CentroAnalisiPage from './pages/CentroAnalisiPage';
import { ChatOverlayProvider } from './contexts/ChatOverlayContext';
import GlobalChatOverlay from './components/GlobalChatOverlay';

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
            {/* Centro Analisi: scheletro isolato, non tocca Storico / Timeline. */}
            <Route path="/centro-analisi" element={<CentroAnalisiPage />} />
            <Route path="/analisi" element={<CentroAnalisiPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <GlobalChatOverlay />
    </ChatOverlayProvider>
  );
}
