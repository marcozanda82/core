import React from 'react';
import SalaComandi from './SalaComandi';
import { DailyDataProvider } from './context/DailyDataContext';

export default function App() {
  return (
    <DailyDataProvider>
      <SalaComandi />
    </DailyDataProvider>
  );
}
