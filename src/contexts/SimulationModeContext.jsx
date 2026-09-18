import { createContext, useContext } from 'react';

const SimulationModeContext = createContext(false);

/**
 * Stesso flag della barra viola «MODALITÀ SIMULAZIONE ATTIVA» (tap sul logo).
 */
export function SimulationModeProvider({ value = false, children }) {
  return (
    <SimulationModeContext.Provider value={value === true}>
      {children}
    </SimulationModeContext.Provider>
  );
}

export function useSimulationMode() {
  return useContext(SimulationModeContext) === true;
}
