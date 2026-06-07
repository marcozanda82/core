import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import SalaComandi from './SalaComandi';
import WeeklyPlannerPage from './pages/WeeklyPlannerPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SalaComandi />} />
        <Route path="/planner" element={<WeeklyPlannerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
