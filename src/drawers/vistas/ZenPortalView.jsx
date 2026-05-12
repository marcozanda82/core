import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { NEURAL_RESET_PATTERNS, ZEN_SESSION_DURATION_OPTIONS, getNeuralResetZenStep } from './neuralResetZenModel';

const ZEN_AMBIENT_TARGET_VOL = 0.35;
const ZEN_AMBIENT_FADE_MS = 2000;

export default function ZenPortalView({
  onBack,
  neuralResetAudioRef,
  neuralResetBellRef,
  zenAmbientForestRef,
  clearZenAmbientFade,
  fadeZenAmbientVolume,
  zenBreathPatternId,
  setZenBreathPatternId,
  zenSessionDurationKey,
  setZenSessionDurationKey,
  isZenActive,
  setIsZenActive,
  zenGracefulEnd,
  setZenGracefulEnd,
  zenForestAmbientOn,
  setZenForestAmbientOn,
  zenBreathPhase,
  zenSunScale,
  zenSessionRemainingSec,
  audioMode,
  setAudioMode,
}) {
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

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100dvw',
        height: '100dvh',
        maxHeight: '100dvh',
        margin: 0,
        padding: 0,
        borderRadius: 0,
        zIndex: 100000,
        boxSizing: 'border-box',
        background: 'radial-gradient(circle at center, #00e5ff 0%, #004d66 60%, #000000 100%)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <audio
        ref={neuralResetAudioRef}
        loop
        preload="auto"
        aria-hidden
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
      <audio
        ref={neuralResetBellRef}
        src="/campana.mp3"
        preload="auto"
        aria-hidden
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
      <audio
        ref={zenAmbientForestRef}
        src="/foresta.mp3"
        loop
        preload="auto"
        aria-hidden
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 18px', gap: '12px', position: 'relative', zIndex: 30 }}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}
        >
          &lt; INDIETRO
        </button>
        <h2 style={{ fontSize: '0.85rem', color: '#FFD700', letterSpacing: '2px', margin: 0, textShadow: '0 0 12px rgba(255,215,0,0.35)', flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <img
            src="/nuovo%20logo%20trasparente2.png"
            alt="Kentuos Logo"
            decoding="async"
            style={{ maxHeight: 26, width: 'auto', maxWidth: 'min(140px, 38vw)', objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.45))' }}
          />
          <span style={{ whiteSpace: 'nowrap' }}>NEURAL RESET</span>
        </h2>
        <div style={{ width: '48px', height: '48px', flexShrink: 0 }} aria-hidden />
      </div>
      <div style={{ flexShrink: 0, padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '420px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Pattern di respirazione
          <select
            value={zenBreathPatternId}
            onChange={(e) => setZenBreathPatternId(e.target.value)}
            disabled={isZenActive}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.35)',
              color: '#fff',
              fontSize: '0.8rem',
              cursor: isZenActive ? 'not-allowed' : 'pointer',
              opacity: isZenActive ? 0.55 : 1,
            }}
          >
            {Object.values(NEURAL_RESET_PATTERNS).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Durata sessione
          <select
            value={zenSessionDurationKey}
            onChange={(e) => setZenSessionDurationKey(e.target.value)}
            disabled={isZenActive}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(0,0,0,0.35)',
              color: '#fff',
              fontSize: '0.8rem',
              cursor: isZenActive ? 'not-allowed' : 'pointer',
              opacity: isZenActive ? 0.55 : 1,
            }}
          >
            {ZEN_SESSION_DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
      <p style={{ flexShrink: 0, textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', margin: '0 20px 24px', lineHeight: 1.5 }}>
        {NEURAL_RESET_PATTERNS[zenBreathPatternId]?.hint ?? ''}
      </p>
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 'clamp(32px, 7.5vh, 56px)',
          paddingBottom: 'clamp(28px, 6.5vh, 48px)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '80px',
            height: '80px',
            marginLeft: '-40px',
            marginTop: '-40px',
            transform: 'scale(1.25)',
            transformOrigin: 'center center',
            zIndex: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              flexShrink: 0,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${zenSunScale})`,
              transformOrigin: 'center center',
              transition: `transform ${zenSunTransitionMs}ms ease-in-out, opacity ${zenSunTransitionMs}ms ease-in-out`,
              opacity: isZenActive && zenSunDimHold ? 0.07 : 1,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: '-6px',
                borderRadius: '50%',
                border: '1px solid rgba(255, 215, 0, 0.45)',
                boxShadow: '0 0 24px rgba(255, 215, 0, 0.2)',
              }}
            />
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: '#FFD700',
                boxShadow: '0 0 40px 18px rgba(255, 215, 0, 0.55), 0 0 80px 36px rgba(255, 200, 80, 0.22)',
              }}
            />
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 'max(24px, env(safe-area-inset-bottom))',
            left: '20px',
            right: '20px',
            textAlign: 'center',
            fontSize: '0.9rem',
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#fff',
            textShadow: '0 2px 12px rgba(0,0,0,0.65)',
          }}
        >
          <span>{isZenActive && zenBreathPhase ? zenBreathPhase : zenGracefulEnd ? 'Completamento…' : 'In attesa'}</span>
          {zenTimerLine && (
            <div style={{ marginTop: '8px', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.35em', color: 'rgba(255,215,0,0.85)' }}>
              {zenTimerLine}
            </div>
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: '12px 20px max(20px, env(safe-area-inset-bottom))' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '14px',
          }}
        >
          <button
            type="button"
            onClick={() => setAudioMode((m) => (m === 'sea' ? 'muted' : 'sea'))}
            title="Suono mare"
            aria-label="Suono mare"
            aria-pressed={audioMode === 'sea'}
            style={{
              width: '52px',
              height: '52px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '14px',
              border: `1px solid ${audioMode === 'sea' ? 'rgba(0,229,255,0.55)' : 'rgba(255,255,255,0.12)'}`,
              background: audioMode === 'sea' ? 'rgba(0,229,255,0.1)' : 'rgba(0,0,0,0.2)',
              cursor: 'pointer',
              transition: 'filter 0.25s ease, opacity 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease',
              filter: audioMode === 'sea' ? 'none' : 'grayscale(100%)',
              opacity: audioMode === 'sea' ? 1 : 0.4,
              boxShadow: audioMode === 'sea' ? '0 0 18px rgba(0, 229, 255, 0.5), 0 0 32px rgba(0, 229, 255, 0.2)' : 'none',
              color: '#00e5ff',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 12c1.5 0 2.5-2 4-2s2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2" />
              <path d="M2 16c1.5 0 2.5-2 4-2s2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2" />
              <path d="M2 8c1.5 0 2.5-2 4-2s2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
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
            }}
            title={zenForestAmbientOn ? 'Spegni paesaggio foresta' : 'Accendi paesaggio foresta'}
            aria-label={zenForestAmbientOn ? 'Spegni paesaggio sonoro foresta' : 'Accendi paesaggio sonoro foresta'}
            aria-pressed={zenForestAmbientOn}
            style={{
              width: '52px',
              height: '52px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '14px',
              border: `1px solid ${zenForestAmbientOn ? 'rgba(0,255,136,0.55)' : 'rgba(255,255,255,0.12)'}`,
              background: zenForestAmbientOn ? 'rgba(0,255,136,0.08)' : 'rgba(0,0,0,0.2)',
              cursor: 'pointer',
              transition: 'filter 0.25s ease, opacity 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease',
              filter: zenForestAmbientOn ? 'none' : 'grayscale(100%)',
              opacity: zenForestAmbientOn ? 1 : 0.4,
              boxShadow: zenForestAmbientOn ? '0 0 18px rgba(0, 255, 136, 0.45), 0 0 32px rgba(0, 255, 136, 0.18)' : 'none',
              color: '#00ff88',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2.5L7.2 11.2h9.6L12 2.5z" />
              <path d="M12 7.5L5.5 16.5h13L12 7.5z" />
              <rect x="10" y="16.2" width="4" height="6.3" rx="0.45" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          disabled={zenGracefulEnd}
          onClick={() => {
            if (zenGracefulEnd) return;
            setIsZenActive(!isZenActive);
          }}
          style={{
            width: '100%',
            padding: '18px',
            backgroundColor: zenGracefulEnd ? 'rgba(0,0,0,0.25)' : isZenActive ? 'rgba(0,0,0,0.35)' : '#FFD700',
            color: zenGracefulEnd ? 'rgba(255,215,0,0.5)' : isZenActive ? '#FFD700' : '#000',
            border: isZenActive || zenGracefulEnd ? '1px solid #FFD700' : 'none',
            borderRadius: '15px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            letterSpacing: '2px',
            cursor: zenGracefulEnd ? 'default' : 'pointer',
            transition: '0.3s',
            boxShadow: isZenActive || zenGracefulEnd ? 'none' : '0 0 24px rgba(255, 215, 0, 0.35)',
            opacity: zenGracefulEnd ? 0.85 : 1,
          }}
        >
          {zenGracefulEnd ? 'Completamento…' : isZenActive ? 'TERMINA SESSIONE' : 'AVVIA CICLO'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
