import React from 'react';
import MenuDrawerShell from '../features/salaComandi/MenuDrawerShell';

/**
 * Scheletro drawer globale (FAB / menu). Il contenuto delle viste (PastoDrawer, WorkoutView, …)
 * resta nel genitore come children per non duplicare centinaia di props.
 */
export default function GlobalMenuDrawer({ isDrawerOpen, onClose, children }) {
  return (
    <MenuDrawerShell isDrawerOpen={isDrawerOpen} onClose={onClose}>
      {children}
    </MenuDrawerShell>
  );
}
