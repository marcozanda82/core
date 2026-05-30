import React, { useEffect, useState } from 'react';
import { takeNextKentuIntroPhrase } from './kentuIntroPhrases';

export default function ProjectedAgeInsightModal({ open, onClose, contextBlock, callGeminiAPIWithRotation }) {
  const [loadingPhrase] = useState(() => takeNextKentuIntroPhrase());
  const [phase, setPhase] = useState('loading');
  const [text, setText] = useState('');

  useEffect(() => {
    if (!open) {
      setPhase('loading');
      setText('');
      return undefined;
    }
    if (!contextBlock || typeof callGeminiAPIWithRotation !== 'function') {
      setPhase('error');
      setText('Contesto non disponibile.');
      return undefined;
    }
    let cancelled = false;
    setPhase('loading');
    setText('');
    const prompt = `Sei KentuOS. Contesto dati utente (sintesi):
${contextBlock}

L'utente ha appena cliccato sulla sua Età Biologica Proiettata, che è variata rispetto al periodo precedente. Analizza i dati recenti (sonno, variazioni di peso/grasso, allenamenti). Spiega in MODO SECCO e in 3 punti elenco PERCHÉ c'è stato questo miglioramento o peggioramento. Lo scopo è confermare le buone abitudini o evidenziare gli errori. Non superare le 4 righe totali. Rispondi in italiano.`;
    (async () => {
      try {
        const res = await callGeminiAPIWithRotation(prompt);
        if (!cancelled) {
          setText((res || '').trim());
          setPhase('done');
        }
      } catch {
        if (!cancelled) {
          setText("Impossibile completare l'analisi. Verifica la connessione e riprova.");
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contextBlock, callGeminiAPIWithRotation]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100030,
        background: 'rgba(8,8,12,0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        boxSizing: 'border-box',
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="projected-age-insight-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'linear-gradient(165deg, #16161c 0%, #0c0c10 100%)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          borderRadius: 18,
          padding: '22px 22px 20px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
          <h2 id="projected-age-insight-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.04em' }}>
            Età proiettata — insight
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: '#94a3b8',
              fontSize: '1.1rem',
              cursor: 'pointer',
            }}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>
        {phase === 'loading' ? (
          <p
            className="kentu-intro-phrase-text kentu-intro-phrase-text--glow"
            style={{
              margin: 0,
              fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
              fontWeight: 300,
              fontSize: '0.9rem',
              letterSpacing: '0.06em',
              lineHeight: 1.55,
              color: 'rgba(226, 232, 240, 0.92)',
            }}
          >
            {loadingPhrase}
          </p>
        ) : (
          <div
            style={{
              color: '#e5e5e5',
              fontSize: '0.88rem',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              maxHeight: 'min(52vh, 320px)',
              overflowY: 'auto',
            }}
          >
            {text}
          </div>
        )}
      </div>
    </div>
  );
}
