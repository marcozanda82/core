import { Navigate } from 'react-router-dom';
import { ACTIVE_BOTTOM_TAB_LS_KEY } from '../constants/salaComandiConstants';

/** Deep-link legacy `/planner` → home con tab Pianifica attiva (bottom nav visibile). */
export default function WeeklyPlannerPage() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(ACTIVE_BOTTOM_TAB_LS_KEY, 'pianifica');
    } catch {
      /* ignore */
    }
  }

  return <Navigate to="/" replace />;
}
