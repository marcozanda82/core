/**
 * Sessione Neural Reset (Zen): stato UI, timer, Web Audio e ambient.
 * Isolato da SalaComandi — riceve solo activeAction / isDrawerOpen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NEURAL_RESET_PATTERNS,
  ZEN_SESSION_DURATION_OPTIONS,
  getNeuralResetZenStep,
  getZenBreathAudioFade,
} from '../../drawers/vistas/neuralResetZenModel';

export const ZEN_AMBIENT_TARGET_VOL = 0.35;
export const ZEN_AMBIENT_FADE_MS = 2000;

/**
 * @param {{ activeAction?: string|null, isDrawerOpen?: boolean }} [opts]
 */
export function useNeuralResetSession({
  activeAction = null,
  isDrawerOpen = false,
} = {}) {
  const [isZenActive, setIsZenActive] = useState(false);
  const [zenBreathPhase, setZenBreathPhase] = useState(null);
  const [zenSunScale, setZenSunScale] = useState(1);
  const [audioMode, setAudioMode] = useState('muted');
  const [zenForestAmbientOn, setZenForestAmbientOn] = useState(false);
  const [zenBreathPatternId, setZenBreathPatternId] = useState('square');
  const [zenSessionDurationKey, setZenSessionDurationKey] = useState('3');
  const [zenSessionRemainingSec, setZenSessionRemainingSec] = useState(null);
  const [zenGracefulEnd, setZenGracefulEnd] = useState(false);

  const neuralResetAudioRef = useRef(null);
  const neuralResetBellRef = useRef(null);
  const zenAmbientForestRef = useRef(null);
  const zenAmbientFadeIntervalRef = useRef(null);
  const neuralResetFadeIntervalRef = useRef(null);
  const zenSessionEndTriggeredRef = useRef(false);
  const zenEndSessionTimeoutRef = useRef(null);
  const neuralResetAudioContextRef = useRef(null);
  const neuralResetGainRef = useRef(null);
  const neuralResetMediaSourceCreatedRef = useRef(false);

  const clearNeuralResetFades = useCallback(() => {
    if (neuralResetFadeIntervalRef.current != null) {
      clearInterval(neuralResetFadeIntervalRef.current);
      neuralResetFadeIntervalRef.current = null;
    }
    const ctx = neuralResetAudioContextRef.current;
    const gain = neuralResetGainRef.current;
    if (ctx && gain) {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
      } catch {
        /* noop */
      }
    }
  }, []);

  const ensureNeuralResetWebAudio = useCallback(() => {
    const el = neuralResetAudioRef.current;
    if (!el) return null;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    if (!neuralResetAudioContextRef.current) {
      neuralResetAudioContextRef.current = new AC();
    }
    const ctx = neuralResetAudioContextRef.current;
    if (!neuralResetGainRef.current) {
      const g = ctx.createGain();
      g.connect(ctx.destination);
      neuralResetGainRef.current = g;
    }
    const gain = neuralResetGainRef.current;
    if (!neuralResetMediaSourceCreatedRef.current) {
      try {
        const src = ctx.createMediaElementSource(el);
        src.connect(gain);
        neuralResetMediaSourceCreatedRef.current = true;
        const v = el.volume;
        el.volume = 1;
        gain.gain.value = v > 0 ? v : 1;
      } catch {
        return null;
      }
    }
    return { ctx, gain };
  }, []);

  const clearZenAmbientFade = useCallback(() => {
    if (zenAmbientFadeIntervalRef.current != null) {
      clearInterval(zenAmbientFadeIntervalRef.current);
      zenAmbientFadeIntervalRef.current = null;
    }
  }, []);

  const fadeZenAmbientVolume = useCallback((targetVol, durationMs, onComplete) => {
    const el = zenAmbientForestRef.current;
    if (!el) {
      onComplete?.();
      return;
    }
    clearZenAmbientFade();
    const safeTarget = Math.max(0, Math.min(1, targetVol));
    const startVol = el.volume;
    const tickMs = 32;
    const t0 = performance.now();
    const dur = Math.max(1, durationMs);
    const easeInOut = (u) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const w = easeInOut(t);
      el.volume = startVol + (safeTarget - startVol) * w;
      if (t >= 1) {
        el.volume = safeTarget;
        clearInterval(id);
        zenAmbientFadeIntervalRef.current = null;
        onComplete?.();
      }
    }, tickMs);
    zenAmbientFadeIntervalRef.current = id;
  }, [clearZenAmbientFade]);

  const fadeAudio = useCallback((targetVolume, durationMs) => {
    const el = neuralResetAudioRef.current;
    if (!el) return;
    clearNeuralResetFades();
    const safeTarget = Math.max(0, Math.min(1, targetVolume));
    const floor = 0.0001;
    const rampEnd = Math.max(floor, safeTarget);
    const durationSec = Math.max(0.02, durationMs / 1000);

    const graph = ensureNeuralResetWebAudio();
    if (graph) {
      const { ctx, gain } = graph;
      ctx.resume().catch(() => {});
      const param = gain.gain;
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      if (safeTarget <= 0) {
        const cur = Math.max(param.value, 0);
        param.setValueAtTime(cur, now);
        param.linearRampToValueAtTime(0, now + durationSec);
        return;
      }
      const current = Math.max(param.value, floor);
      param.setValueAtTime(current, now);
      try {
        param.exponentialRampToValueAtTime(rampEnd, now + durationSec);
      } catch {
        param.linearRampToValueAtTime(safeTarget, now + durationSec);
      }
      return;
    }

    const startVol = Math.max(el.volume, safeTarget <= 0 ? 0 : floor);
    const endVol = safeTarget <= 0 ? 0 : rampEnd;
    const tickMs = 32;
    const startTime = performance.now();
    const safeDur = Math.max(1, durationMs);
    const id = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / safeDur);
      let v;
      if (safeTarget <= 0) {
        v = startVol * (1 - t);
      } else {
        v = startVol * (endVol / Math.max(startVol, floor)) ** t;
      }
      el.volume = Math.min(1, Math.max(0, v));
      if (t >= 1) {
        el.volume = safeTarget;
        clearInterval(id);
        if (neuralResetFadeIntervalRef.current === id) neuralResetFadeIntervalRef.current = null;
      }
    }, tickMs);
    neuralResetFadeIntervalRef.current = id;
  }, [clearNeuralResetFades, ensureNeuralResetWebAudio]);

  const endZenSessionGracefully = useCallback(() => {
    setZenGracefulEnd(true);
    if (zenSessionDurationKey !== 'infinite') {
      setZenSessionRemainingSec(0);
    }
    setZenBreathPhase(null);
    setZenSunScale(1);
    const bell = neuralResetBellRef.current;
    if (bell) {
      bell.currentTime = 0;
      bell.volume = 1;
      bell.play().catch(() => {});
    }
    fadeAudio(0, 2600);
    fadeZenAmbientVolume(0, 2600, () => {
      const amb = zenAmbientForestRef.current;
      if (amb) {
        amb.pause();
        amb.currentTime = 0;
      }
      setZenForestAmbientOn(false);
    });
    if (zenEndSessionTimeoutRef.current) {
      clearTimeout(zenEndSessionTimeoutRef.current);
      zenEndSessionTimeoutRef.current = null;
    }
    zenEndSessionTimeoutRef.current = window.setTimeout(() => {
      zenEndSessionTimeoutRef.current = null;
      setIsZenActive(false);
      setZenGracefulEnd(false);
      setZenSessionRemainingSec(null);
      const el = neuralResetAudioRef.current;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
      clearNeuralResetFades();
      const g = neuralResetGainRef.current;
      const ctx = neuralResetAudioContextRef.current;
      if (ctx && g) {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.value = 1;
        } catch {
          /* noop */
        }
      }
      if (el) el.volume = 1;
      zenSessionEndTriggeredRef.current = false;
      clearZenAmbientFade();
      const amb = zenAmbientForestRef.current;
      if (amb) {
        amb.pause();
        amb.currentTime = 0;
        amb.volume = 0;
      }
    }, 2800);
  }, [clearNeuralResetFades, clearZenAmbientFade, fadeAudio, fadeZenAmbientVolume, zenSessionDurationKey]);

  const zenSunTransitionMs = useMemo(() => {
    if (zenGracefulEnd && !zenBreathPhase) return 2500;
    if (!zenBreathPhase) return 4000;
    return getNeuralResetZenStep(zenBreathPatternId, zenBreathPhase)?.ms ?? 4000;
  }, [zenBreathPatternId, zenBreathPhase, zenGracefulEnd]);

  const zenSunDimHold = useMemo(() => {
    const step = zenBreathPhase ? getNeuralResetZenStep(zenBreathPatternId, zenBreathPhase) : null;
    return !!step?.dimHold;
  }, [zenBreathPatternId, zenBreathPhase]);

  const zenTimerLine = useMemo(() => {
    if (!isZenActive) return null;
    if (zenGracefulEnd) return '00:00';
    if (zenSessionDurationKey === 'infinite') return 'Senza limite';
    if (zenSessionRemainingSec == null) return null;
    if (zenSessionRemainingSec <= 0) return '00:00';
    const m = Math.floor(zenSessionRemainingSec / 60);
    const s = Math.max(0, zenSessionRemainingSec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [isZenActive, zenGracefulEnd, zenSessionDurationKey, zenSessionRemainingSec]);

  useEffect(() => {
    if (!isDrawerOpen) setIsZenActive(false);
  }, [isDrawerOpen]);

  useEffect(() => {
    if (isZenActive) zenSessionEndTriggeredRef.current = false;
  }, [isZenActive]);

  useEffect(() => {
    if (!isZenActive) {
      setZenBreathPhase(null);
      setZenSunScale(1);
      return undefined;
    }
    if (zenGracefulEnd) return undefined;

    const pattern = NEURAL_RESET_PATTERNS[zenBreathPatternId];
    if (!pattern?.steps?.length) return undefined;

    const timeouts = [];
    let cancelled = false;
    const after = (ms, fn) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeouts.push(id);
    };

    const runStep = (stepIndex) => {
      if (cancelled) return;
      const { steps } = pattern;
      const step = steps[stepIndex];
      if (!step) return;
      setZenBreathPhase(step.phase);
      setZenSunScale(step.sunTarget);
      after(step.ms, () => {
        if (cancelled) return;
        runStep((stepIndex + 1) % steps.length);
      });
    };

    runStep(0);
    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [isZenActive, zenBreathPatternId, zenGracefulEnd]);

  useEffect(() => {
    if (!isZenActive || zenGracefulEnd || zenSessionDurationKey === 'infinite') {
      if (!isZenActive) setZenSessionRemainingSec(null);
      return undefined;
    }
    const opt = ZEN_SESSION_DURATION_OPTIONS.find((o) => o?.value === zenSessionDurationKey);
    const total = opt?.sec;
    if (total == null) return undefined;
    setZenSessionRemainingSec(total);
    const id = window.setInterval(() => {
      setZenSessionRemainingSec((r) => {
        if (r === null || r <= 0) return 0;
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isZenActive, zenSessionDurationKey, zenGracefulEnd]);

  useEffect(() => {
    if (zenSessionDurationKey === 'infinite' || !isZenActive || zenGracefulEnd) return;
    if (zenSessionRemainingSec !== 0) return;
    if (zenSessionEndTriggeredRef.current) return;
    zenSessionEndTriggeredRef.current = true;
    endZenSessionGracefully();
  }, [zenSessionRemainingSec, zenSessionDurationKey, isZenActive, zenGracefulEnd, endZenSessionGracefully]);

  useEffect(() => {
    if (activeAction !== 'focus') return undefined;
    return () => {
      clearNeuralResetFades();
      const el = neuralResetAudioRef.current;
      if (el) {
        el.pause();
        el.currentTime = 0;
      }
      const bell = neuralResetBellRef.current;
      if (bell) {
        bell.pause();
        bell.currentTime = 0;
      }
      clearZenAmbientFade();
      const amb = zenAmbientForestRef.current;
      if (amb) {
        amb.pause();
        amb.currentTime = 0;
        amb.volume = 0;
      }
      setZenForestAmbientOn(false);
    };
  }, [activeAction, clearNeuralResetFades, clearZenAmbientFade]);

  useEffect(() => {
    if (activeAction === 'focus') return;
    clearZenAmbientFade();
    const amb = zenAmbientForestRef.current;
    if (amb) {
      amb.pause();
      amb.currentTime = 0;
      amb.volume = 0;
    }
    setZenForestAmbientOn(false);
    setAudioMode('muted');
  }, [activeAction, clearZenAmbientFade]);

  useEffect(() => {
    if (activeAction !== 'focus') return;
    const el = neuralResetAudioRef.current;
    if (!el) return;

    if (audioMode === 'muted' || !isZenActive) {
      clearNeuralResetFades();
      el.pause();
      el.currentTime = 0;
      return;
    }

    const nextSrc = '/onde-mare.mp3';
    const tail = nextSrc.replace(/^\//, '');
    let pathMatches = false;
    try {
      if (el.src) pathMatches = new URL(el.src, window.location.href).pathname.endsWith(tail);
    } catch {
      pathMatches = false;
    }
    if (!pathMatches) {
      clearNeuralResetFades();
      el.pause();
      el.src = nextSrc;
      el.load();
    }

    el.play().catch(() => {});
  }, [activeAction, audioMode, isZenActive, clearNeuralResetFades]);

  useEffect(() => {
    if (activeAction !== 'focus' || !isZenActive || audioMode === 'muted' || zenGracefulEnd) return;
    if (!zenBreathPhase) return;
    const step = getNeuralResetZenStep(zenBreathPatternId, zenBreathPhase);
    if (!step) return;
    const fade = getZenBreathAudioFade(zenBreathPhase, step.ms);
    if (fade) fadeAudio(fade.target, fade.duration);
  }, [zenBreathPhase, zenBreathPatternId, activeAction, isZenActive, audioMode, zenGracefulEnd, fadeAudio]);

  const toggleSeaAudio = useCallback(() => {
    setAudioMode((m) => (m === 'sea' ? 'muted' : 'sea'));
  }, []);

  const toggleForestAmbient = useCallback(() => {
    const el = zenAmbientForestRef.current;
    if (!el) return;
    if (zenForestAmbientOn) {
      fadeZenAmbientVolume(0, ZEN_AMBIENT_FADE_MS, () => {
        el.pause();
        el.currentTime = 0;
        setZenForestAmbientOn(false);
      });
    } else {
      setZenForestAmbientOn(true);
      el.volume = 0;
      el.play().catch(() => {
        setZenForestAmbientOn(false);
      });
      fadeZenAmbientVolume(ZEN_AMBIENT_TARGET_VOL, ZEN_AMBIENT_FADE_MS, null);
    }
  }, [fadeZenAmbientVolume, zenForestAmbientOn]);

  const toggleZenSession = useCallback(() => {
    if (zenGracefulEnd) return;
    setIsZenActive((prev) => !prev);
  }, [zenGracefulEnd]);

  /** Uscita vista (INDIETRO): stop immediato senza completamento grazioso. */
  const exitZenView = useCallback(() => {
    if (zenEndSessionTimeoutRef.current) {
      clearTimeout(zenEndSessionTimeoutRef.current);
      zenEndSessionTimeoutRef.current = null;
    }
    clearZenAmbientFade();
    const amb = zenAmbientForestRef.current;
    if (amb) {
      amb.pause();
      amb.currentTime = 0;
      amb.volume = 0;
    }
    setZenForestAmbientOn(false);
    setZenGracefulEnd(false);
    setIsZenActive(false);
  }, [clearZenAmbientFade]);

  return {
    isZenActive,
    zenBreathPhase,
    zenSunScale,
    audioMode,
    zenForestAmbientOn,
    zenBreathPatternId,
    setZenBreathPatternId,
    zenSessionDurationKey,
    setZenSessionDurationKey,
    zenGracefulEnd,
    zenSunTransitionMs,
    zenSunDimHold,
    zenTimerLine,
    neuralResetAudioRef,
    neuralResetBellRef,
    zenAmbientForestRef,
    toggleSeaAudio,
    toggleForestAmbient,
    toggleZenSession,
    exitZenView,
    patterns: NEURAL_RESET_PATTERNS,
    durationOptions: ZEN_SESSION_DURATION_OPTIONS,
  };
}
