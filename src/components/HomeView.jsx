import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TimelineNodi from '../TimelineNodi';

const SECTION_GAP = 22; // vertical rhythm between main blocks (18–24px)

const getColor = (value) => {
  if (value >= 75) return '#22c55e';
  if (value >= 50) return '#facc15';
  return '#ef4444';
};

const getScoreGlow = (value) => {
  if (value >= 75) return '0 0 25px rgba(34,197,94,0.5)';
  if (value >= 50) return '0 0 20px rgba(250,204,21,0.4)';
  return '0 0 20px rgba(239,68,68,0.4)';
};

const COUNT_UP_MS = 800;

/**
 * Layout home: longevity hero, grafico energetico, timeline nodi, CTA.
 * `longevity`: output di computeLongevityScore (score, priorityFocus, …).
 * `chart`: nodo React (es. ResponsiveContainer + grafico) dal genitore.
 * `timelineProps`: spread su TimelineNodi (stessi props di SalaComandi).
 * `onFocusClick`: opzionale — click / Invio / Spazio sulla card Priority Focus.
 */
export default function HomeView({
  longevity,
  chart,
  timelineProps,
  onAddEvent,
  onFocusClick
}) {
  const score =
    longevity != null && typeof longevity.score === 'number' && !Number.isNaN(longevity.score)
      ? longevity.score
      : 0;

  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    if (longevity == null) {
      setDisplayScore(0);
      return undefined;
    }

    let cancelled = false;
    const target = score;
    const t0 = performance.now();

    const tick = (now) => {
      if (cancelled) return;
      const t = Math.min(1, (now - t0) / COUNT_UP_MS);
      const eased = 1 - (1 - t) ** 3;
      setDisplayScore(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
    };

    const rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [longevity, score]);

  if (!longevity) return null;

  const { priorityFocus } = longevity;
  const scoreGlow = getScoreGlow(score);
  const focusInteractive = typeof onFocusClick === 'function';

  const handleFocusKeyDown = (e) => {
    if (!focusInteractive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onFocusClick();
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 700, margin: '0 auto' }}>

      {/* SCORE */}
      <motion.div
        style={{ marginBottom: SECTION_GAP }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{
          fontSize: 52,
          fontWeight: 'bold',
          color: getColor(score),
          textShadow: scoreGlow
        }}>
          {displayScore}
        </div>
        <div style={{
          opacity: 0.65,
          letterSpacing: '0.5px',
          color: '#e8e8e8'
        }}>
          Longevity Score
        </div>
      </motion.div>

      {/* FOCUS (HERO) */}
      {priorityFocus && (
        <motion.div
          role={focusInteractive ? 'button' : undefined}
          tabIndex={focusInteractive ? 0 : undefined}
          aria-label={focusInteractive ? 'Longevity focus — show details' : undefined}
          onClick={focusInteractive ? () => onFocusClick() : undefined}
          onKeyDown={focusInteractive ? handleFocusKeyDown : undefined}
          whileHover={focusInteractive ? { scale: 1.015 } : undefined}
          style={{
            marginBottom: SECTION_GAP,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.8), rgba(2,6,23,0.9))',
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 28px 56px rgba(0,0,0,0.55), 0 10px 24px rgba(0,0,0,0.35)',
            padding: 18,
            color: '#e8e8e8',
            cursor: focusInteractive ? 'pointer' : undefined,
            outlineOffset: 4
          }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div style={{
            fontSize: 12,
            opacity: 0.65,
            letterSpacing: '0.5px',
            color: '#e8e8e8'
          }}>
            TODAY FOCUS
          </div>

          <div style={{
            fontSize: 21,
            fontWeight: 'bold',
            marginTop: 4,
            color: '#e8e8e8',
            opacity: 1
          }}>
            {priorityFocus.title}
          </div>

          <div style={{
            marginTop: 10,
            color: '#22c55e',
            fontWeight: 500,
            opacity: 1
          }}>
            → {priorityFocus.action}
          </div>
        </motion.div>
      )}

      {/* ENERGY CHART */}
      <motion.div
        style={{
          marginBottom: SECTION_GAP,
          background: 'rgba(2,6,23,0.85)',
          borderRadius: 18,
          padding: 16,
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 14px 36px rgba(0,0,0,0.42)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {chart}
      </motion.div>

      {/* TIMELINE */}
      <motion.div
        style={{
          marginBottom: SECTION_GAP,
          borderRadius: 18,
          padding: 8,
          background: 'rgba(2,6,23,0.4)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)'
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.95 }}
        transition={{ delay: 0.3 }}
      >
        <TimelineNodi {...timelineProps} />
      </motion.div>

      {/* CTA */}
      <motion.button
        type="button"
        onClick={(e) => {
          navigator.vibrate?.(10);
          onAddEvent(e);
        }}
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.02 }}
        style={{
          width: '100%',
          padding: 16,
          borderRadius: 16,
          background: 'linear-gradient(135deg, #22c55e, #4ade80)',
          border: 'none',
          fontWeight: 'bold',
          cursor: 'pointer',
          color: '#020617',
          boxShadow: '0 10px 25px rgba(34,197,94,0.3)'
        }}
      >
        + Add Event
      </motion.button>

    </div>
  );
}
