import { useCallback, useEffect, useRef } from 'react';
import { getTodayString } from '../coreEngine';
import { AI_WORKOUT_PROPOSAL_SOURCE, isAiProposalSeed } from '../features/workout/activityDrafts';
import {
  buildAiWorkoutDraftProposals,
  hasCompletedStrengthWorkoutToday,
} from '../features/workout/aiWorkoutDraftEngine';

function isAutoAiProposal(item) {
  if (!item || typeof item !== 'object' || isAiProposalSeed(item)) return false;
  if (item.source === AI_WORKOUT_PROPOSAL_SOURCE) return true;
  return String(item.id || '').startsWith('ai_proposal_');
}

/**
 * Semina le Proposte AI del giorno (Sessioni) e le rinfresca all'apertura della pagina.
 * Se oggi è già stata completata una Forza, toglie/non crea la bozza muscolare.
 */
export function useAiWorkoutDrafts({
  enabled = false,
  sessionsOpen = false,
  fourCylinder = null,
  fullHistory = null,
  activeLog = null,
  activityDrafts = [],
  addActivityDraft = null,
  removeActivityDraft = null,
  purgeStaleActivityDrafts = null,
  markAiProposalSeed = null,
  hasAiProposalSeed = false,
  isSimulationMode = false,
} = {}) {
  const inFlightRef = useRef(false);
  const lastDayRef = useRef('');
  const contextRef = useRef({});
  const strengthDoneToday = hasCompletedStrengthWorkoutToday({
    fullHistory,
    activeLog,
    todayIso: getTodayString(),
  });
  contextRef.current = {
    fourCylinder,
    fullHistory,
    activeLog,
    activityDrafts,
    hasAiProposalSeed,
    strengthDoneToday,
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

      const result = buildAiWorkoutDraftProposals({
        todayIso: today,
        fourCylinder: ctx.fourCylinder,
        fullHistory: ctx.fullHistory,
        activeLog: ctx.activeLog,
        nowMs: Date.now(),
      });
      const desired = Array.isArray(result.payloads) ? result.payloads : [];
      const desiredIds = new Set(desired.map((payload) => String(payload.id)));
      const drafts = Array.isArray(ctx.activityDrafts) ? ctx.activityDrafts : [];

      drafts.forEach((item) => {
        if (!isAutoAiProposal(item)) return;
        if (desiredIds.has(String(item.id))) return;
        if (typeof removeActivityDraft === 'function') {
          removeActivityDraft(item.id);
        }
      });

      const existingIds = new Set(drafts.map((item) => String(item?.id || '')));
      desired.forEach((payload) => {
        if (!payload?.id || existingIds.has(String(payload.id))) return;
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
    removeActivityDraft,
    purgeStaleActivityDrafts,
    markAiProposalSeed,
  ]);

  useEffect(() => {
    if (!enabled) return undefined;
    void ensure();
    return undefined;
  }, [enabled, ensure, strengthDoneToday]);

  useEffect(() => {
    if (!enabled || !sessionsOpen) return undefined;
    void ensure();
    return undefined;
  }, [enabled, sessionsOpen, ensure]);
}

export default useAiWorkoutDrafts;
