import React, { useState } from 'react';
import SalaComandi from './SalaComandi';
import BootMessage from './BootMessage';

export default function App() {
  const [bootComplete, setBootComplete] = useState(false);

  if (!bootComplete) {
    return <BootMessage onComplete={() => setBootComplete(true)} />;
  }

  return <SalaComandi />;
}
