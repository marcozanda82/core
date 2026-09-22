import { useCallback, useEffect, useRef } from 'react';
import { getTodayString } from '../coreEngine';
import { AI_WORKOUT_PROPOSAL_SOURCE } from '../features/workout/activityDrafts';
import { buildAiWorkoutDraftProposals } from '../features/workout/aiWorkoutDraftEngine';

/**
 * Semina le Proposte AI del giorno (Sessioni) e le rinfresca all'apertura della pagina.
 */
export function useAiWorkoutDrafts({
  enabled = false,
  sessionsOpen = false,
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activityDrafts = [],
  addActivityDraft = null,
  purgeStaleActivityDrafts = null,
  markAiProposalSeed = null,
  hasAiProposalSeed = false,
  isSimulationMode = false,
} = {}) {
  const inFlightRef = useRef(false);
  const lastDayRef = useRef('');
  const contextRef = useRef({});
  contextRef.current = {
    fourCylinder,
    fullHistory,
    activeLog,
    activityDrafts,
    hasAiProposalSeed,
  };

  const ensure = useCallback(async () => {
    if (!enabled || isSimulationMode) return;
    if (typeof addActivityDraft !== 'function') return;
    if (inFlightRef.current) return;

    const today = getTodayString();
    const ctx = contextRef.current;
    inFlightRef.current = true;
    try {
      if (typeof purgeStaleActivityDrafts === 'function') {
        await purgeStaleActivityDrafts(today);
      }
      const drafts = Array.isArray(ctx.activityDrafts) ? ctx.activityDrafts : [];
      const alreadySeeded = Boolean(ctx.hasAiProposalSeed)
        || drafts.some((item) => (
          item?.source === AI_WORKOUT_PROPOSAL_SOURCE
          || String(item?.id || '').startsWith('ai_proposal_')
        ));
      if (alreadySeeded) {
        lastDayRef.current = today;
        return;
      }

      const result = buildAiWorkoutDraftProposals({
        todayIso: today,
        fourCylinder: ctx.fourCylinder,
        fullHistory: ctx.fullHistory,
        activeLog: ctx.activeLog,
        nowMs: Date.now(),
      });
      (result.payloads || []).forEach((payload) => {
        addActivityDraft(payload, {
          source: AI_WORKOUT_PROPOSAL_SOURCE,
          date: today,
          id: payload.id,
        });
      });
      markAiProposalSeed?.(today);
      lastDayRef.current = today;
    } catch (error) {
      console.warn('[useAiWorkoutDrafts] ensure failed', error);
    } finally {
      inFlightRef.current = false;
    }
  }, [
    enabled,
    isSimulationMode,
    addActivityDraft,
    purgeStaleActivityDrafts,
    markAiProposalSeed,
  ]);

  useEffect(() => {
    if (!enabled) return undefined;
    void ensure();
    return undefined;
  }, [enabled, ensure]);

  useEffect(() => {
    if (!enabled || !sessionsOpen) return undefined;
    void ensure();
    return undefined;
  }, [enabled, sessionsOpen, ensure]);
}

export default useAiWorkoutDrafts;
