import React, { useState } from 'react';
import { loginWithGoogle } from '../../services/firebaseAuth';
import { takeNextKentuIntroPhrase } from '../../kentuIntroPhrases';
import LegalTextModal from '../legal/LegalTextModal.jsx';
import {
  MEDICAL_DISCLAIMER_BODY,
  MEDICAL_DISCLAIMER_TITLE,
  PRIVACY_POLICY_SUMMARY,
  PRIVACY_POLICY_TITLE,
} from '../../constants/legalContent.js';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginScreen() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalModal, setLegalModal] = useState(null);
  const [introPhrase] = useState(() => takeNextKentuIntroPhrase());

  const handleGoogleLogin = async () => {
    if (isSigningIn || !legalAccepted) return;
    setIsSigningIn(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err) {
      const code = err?.code || '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        console.warn('[Auth] Google sign-in failed', err);
        setError('Accesso non riuscito. Verifica la connessione e riprova.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const loginDisabled = isSigningIn || !legalAccepted;

  return (
    <div
      style={{
        backgroundColor: '#050a12',
        color: '#e2e8f0',
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <style>
        {`
          .kentu-login-card {
            background: rgba(8, 12, 20, 0.92);
            border: 1px solid rgba(255, 255, 255, 0.08);
            padding: 36px 32px;
            border-radius: 16px;
            z-index: 10;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
            position: relative;
          }
          .kentu-login-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 56px;
            height: 2px;
            background: #22d3ee;
            box-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
          }
          .kentu-google-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            background: #0f172a;
            border: 1px solid rgba(255, 255, 255, 0.14);
            color: #f1f5f9;
            padding: 14px 16px;
            font-size: 0.9rem;
            font-weight: 600;
            letter-spacing: 0.02em;
            cursor: pointer;
            transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s;
            border-radius: 10px;
            margin-top: 8px;
          }
          .kentu-google-btn:hover:not(:disabled) {
            background: #1e293b;
            border-color: rgba(34, 211, 238, 0.35);
            box-shadow: 0 0 20px rgba(34, 211, 238, 0.12);
          }
          .kentu-google-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
          }
          .kentu-auth-spinner {
            border: 2px solid transparent;
            border-top-color: #22d3ee;
            border-radius: 50%;
            width: 28px;
            height: 28px;
            animation: kentu-auth-spin 0.8s linear infinite;
            margin: 0 auto 12px auto;
          }
          @keyframes kentu-auth-spin { to { transform: rotate(360deg); } }
          .kentu-legal-link {
            background: none;
            border: none;
            padding: 0;
            margin: 0;
            color: #22d3ee;
            font: inherit;
            font-weight: 600;
            text-decoration: underline;
            text-underline-offset: 2px;
            cursor: pointer;
          }
          .kentu-legal-link:hover {
            color: #67e8f9;
          }
        `}
      </style>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 30%, rgba(34, 211, 238, 0.06) 0%, transparent 55%)',
          pointerEvents: 'none',
        }}
      />

      <div className="kentu-login-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <img
            src="/nuovo%20logo%20trasparente2.png"
            alt="KentuOS"
            decoding="async"
            style={{
              maxHeight: 52,
              width: 'auto',
              maxWidth: 'min(280px, 88vw)',
              objectFit: 'contain',
            }}
          />
        </div>

        <p
          className="kentu-intro-phrase-text kentu-intro-phrase-text--glow"
          style={{
            textAlign: 'center',
            fontSize: '0.72rem',
            fontWeight: 300,
            letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.42)',
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          {introPhrase}
        </p>

        <p
          style={{
            textAlign: 'center',
            fontSize: '0.68rem',
            color: '#64748b',
            marginBottom: 20,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Beta · Accedi con il tuo account Google
        </p>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 16,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={legalAccepted}
            onChange={(e) => setLegalAccepted(e.target.checked)}
            style={{
              marginTop: 3,
              width: 16,
              height: 16,
              accentColor: '#22d3ee',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: '0.72rem', lineHeight: 1.45, color: '#94a3b8' }}>
            Ho letto e accetto la{' '}
            <button
              type="button"
              className="kentu-legal-link"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLegalModal('privacy');
              }}
            >
              Privacy Policy
            </button>
            {' '}
            e dichiaro di aver compreso il{' '}
            <button
              type="button"
              className="kentu-legal-link"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLegalModal('disclaimer');
              }}
            >
              Disclaimer Medico
            </button>
            .
          </span>
        </label>

        <button
          type="button"
          className="kentu-google-btn"
          onClick={handleGoogleLogin}
          disabled={loginDisabled}
          aria-disabled={loginDisabled}
        >
          {isSigningIn ? (
            <>
              <div className="kentu-auth-spinner" style={{ width: 18, height: 18, margin: 0 }} />
              Connessione in corso…
            </>
          ) : (
            <>
              <GoogleIcon />
              Accedi con Google
            </>
          )}
        </button>

        {!legalAccepted ? (
          <p
            style={{
              marginTop: 10,
              textAlign: 'center',
              fontSize: '0.68rem',
              color: '#64748b',
            }}
          >
            Spunta l&apos;accettazione per abilitare l&apos;accesso.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            style={{
              marginTop: 14,
              textAlign: 'center',
              fontSize: '0.75rem',
              color: '#f87171',
            }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <LegalTextModal
        open={legalModal === 'disclaimer'}
        title={MEDICAL_DISCLAIMER_TITLE}
        body={MEDICAL_DISCLAIMER_BODY}
        onClose={() => setLegalModal(null)}
      />
      <LegalTextModal
        open={legalModal === 'privacy'}
        title={PRIVACY_POLICY_TITLE}
        body={PRIVACY_POLICY_SUMMARY}
        showExternalPrivacyLink
        onClose={() => setLegalModal(null)}
      />
    </div>
  );
}
