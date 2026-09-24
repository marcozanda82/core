/** Chiude gli overlay Attività/Cruscotto montati nella pulsantiera (Home e Chat). */
export const SESSION_NAV_DISMISS_EVENT = 'kentu:dismiss-session-nav';

export function dismissSessionNavStack() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_NAV_DISMISS_EVENT));
}
