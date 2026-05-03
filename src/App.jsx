import React from 'react';

import SalaComandi from './SalaComandi';
import SleepCoachDebug from './dev/SleepCoachDebug';

/** Solo debug: rimetti `false` o rimuovi il ramo prima del merge. */
const DEBUG_SLEEP_COACH = true;

export default function App() {
  if (DEBUG_SLEEP_COACH) {
    return <SleepCoachDebug />;
  }

  return <SalaComandi />;
}
