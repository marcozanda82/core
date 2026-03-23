import React from 'react';
import { motion } from 'framer-motion';
import TimelineNodi from '../TimelineNodi';

const getColor = (value) => {
  if (value >= 75) return '#22c55e';
  if (value >= 50) return '#facc15';
  return '#ef4444';
};

/**
 * Layout home: longevity hero, grafico energetico, timeline nodi, CTA.
 * `longevity`: output di computeLongevityScore (score, priorityFocus, …).
 * `chart`: nodo React (es. ResponsiveContainer + grafico) dal genitore.
 * `timelineProps`: spread su TimelineNodi (stessi props di SalaComandi).
 */
export default function HomeView({
  longevity,
  chart,
  timelineProps,
  onAddEvent
}) {
  if (!longevity) return null;

  const { score, priorityFocus } = longevity;

  return (
    <div style={{ padding: 16, maxWidth: 700, margin: '0 auto' }}>

      {/* SCORE */}
      <motion.div
        style={{ marginBottom: 16 }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{
          fontSize: 52,
          fontWeight: 'bold',
          color: getColor(score),
          textShadow: '0 0 20px rgba(34,197,94,0.4)'
        }}>
          {score}
        </div>
        <div style={{ opacity: 0.6 }}>Longevity Score</div>
      </motion.div>

      {/* FOCUS (HERO) */}
      {priorityFocus && (
        <motion.div
          style={{
            marginBottom: 20,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.8), rgba(2,6,23,0.9))',
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            padding: 18,
            color: '#e8e8e8'
          }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div style={{ fontSize: 12, opacity: 0.6, color: '#e8e8e8' }}>
            TODAY FOCUS
          </div>

          <div style={{
            fontSize: 20,
            fontWeight: 'bold',
            marginTop: 4,
            color: '#e8e8e8'
          }}>
            {priorityFocus.title}
          </div>

          <div style={{
            marginTop: 10,
            color: '#22c55e',
            fontWeight: 500
          }}>
            → {priorityFocus.action}
          </div>
        </motion.div>
      )}

      {/* ENERGY CHART */}
      <motion.div
        style={{
          marginBottom: 20,
          background: 'rgba(2,6,23,0.85)',
          borderRadius: 18,
          padding: 16,
          border: '1px solid rgba(255,255,255,0.05)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
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
      <div style={{ marginBottom: 20 }}>
        <TimelineNodi {...timelineProps} />
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onAddEvent}
        style={{
          width: '100%',
          padding: 14,
          borderRadius: 12,
          background: '#22c55e',
          border: 'none',
          fontWeight: 'bold',
          cursor: 'pointer',
          color: '#020617'
        }}
      >
        + Add Event
      </button>

    </div>
  );
}
