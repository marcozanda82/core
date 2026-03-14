import React, { useState, useEffect } from 'react';
import SalaComandi from './SalaComandi';
import ReadyCoreSplash from './ReadyCoreSplash';

export default function App() {
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    if (isBooting) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isBooting]);

  if (isBooting) {
    return <ReadyCoreSplash onComplete={() => setIsBooting(false)} />;
  }

  return <SalaComandi />;
}