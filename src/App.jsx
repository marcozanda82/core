import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import SalaComandi from './SalaComandi';
import WeeklyPlannerPage from './pages/WeeklyPlannerPage';
import { ChatOverlayProvider } from './contexts/ChatOverlayContext';
import GlobalChatOverlay from './components/GlobalChatOverlay';

export default function App() {
  return (
    <ChatOverlayProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SalaComandi />} />
          {/* Legacy deep-link: reindirizza a / con tab «Pianifica» (WeeklyBuilder in SalaComandi). */}
          <Route path="/planner" element={<WeeklyPlannerPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <GlobalChatOverlay />
    </ChatOverlayProvider>
  );
}
