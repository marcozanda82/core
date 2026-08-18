import React from 'react';

const ROOM_GRADIENT = {
  sonno: 'from-indigo-900 via-purple-900 to-slate-900',
  metabolismo: 'from-orange-900 via-amber-900 to-slate-900',
  recupero: 'from-emerald-900 via-teal-900 to-slate-900',
  nutrizione: 'from-amber-900 via-orange-900 to-slate-900',
  allenamento: 'from-lime-900 via-emerald-900 to-slate-900',
  biometrie: 'from-cyan-900 via-slate-800 to-slate-900',
  clinica: 'from-blue-900 via-slate-800 to-slate-900',
  bussola: 'from-blue-900 via-slate-800 to-slate-900',
  mappa: 'from-teal-900 via-sky-900 to-slate-900',
  radar: 'from-indigo-900 via-slate-800 to-slate-900',
};

const DEFAULT_GRADIENT = 'from-blue-900 via-slate-800 to-slate-900';

/**
 * Sfondo Mobile-Premium: blob GPU (transform) + palette per stanza.
 * Nessun mouse tracking. pointer-events-none.
 */
export default function PremiumAmbientBackground({ activeRoomId = null } = {}) {
  const gradient = ROOM_GRADIENT[activeRoomId] || DEFAULT_GRADIENT;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black"
      aria-hidden
    >
      <style>{`
        @keyframes ca-ambient-drift-a {
          0%, 100% { transform: translate3d(-8%, -4%, 0) scale(1); }
          50% { transform: translate3d(10%, 8%, 0) scale(1.08); }
        }
        @keyframes ca-ambient-drift-b {
          0%, 100% { transform: translate3d(6%, 10%, 0) scale(1.05); }
          50% { transform: translate3d(-12%, -6%, 0) scale(0.94); }
        }
        @keyframes ca-ambient-drift-c {
          0%, 100% { transform: translate3d(0%, 8%, 0) rotate(0deg); }
          50% { transform: translate3d(-6%, -10%, 0) rotate(18deg); }
        }
        .ca-ambient-blob-a { animation: ca-ambient-drift-a 28s ease-in-out infinite; }
        .ca-ambient-blob-b { animation: ca-ambient-drift-b 36s ease-in-out infinite; }
        .ca-ambient-blob-c { animation: ca-ambient-drift-c 42s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ca-ambient-blob-a,
          .ca-ambient-blob-b,
          .ca-ambient-blob-c { animation: none; }
        }
      `}</style>

      <div
        className={`ca-ambient-blob-a absolute -left-[35vw] -top-[30vw] h-[150vw] w-[150vw] max-h-[42rem] max-w-[42rem] rounded-full bg-gradient-to-br ${gradient} opacity-40 blur-[100px] will-change-transform transition-colors duration-1000`}
      />
      <div
        className={`ca-ambient-blob-b absolute -bottom-[28vw] -right-[32vw] h-[140vw] w-[140vw] max-h-[38rem] max-w-[38rem] rounded-full bg-gradient-to-tl ${gradient} opacity-40 blur-[110px] will-change-transform transition-colors duration-1000`}
      />
      <div
        className={`ca-ambient-blob-c absolute left-[18%] top-[38%] h-96 w-96 rounded-full bg-gradient-to-r ${gradient} opacity-30 blur-[100px] will-change-transform transition-colors duration-1000`}
      />
    </div>
  );
}
