import React, { useState } from 'react';
import SalaComandi from './SalaComandi';
import KentuOSBootVideo from './KentuOSBootVideo';

export default function App() {
  const [bootComplete, setBootComplete] = useState(false);

  if (!bootComplete) {
    return <KentuOSBootVideo onComplete={() => setBootComplete(true)} />;
  }

  return <SalaComandi />;
}
