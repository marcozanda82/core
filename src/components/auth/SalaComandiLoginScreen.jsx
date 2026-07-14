export default function SalaComandiLoginScreen({
  isBooting,
  introPhrase,
  loginEmail,
  setLoginEmail,
  loginPassword,
  setLoginPassword,
  onSubmit,
}) {
  return (
    <div style={{ backgroundColor: '#000', color: '#00e5ff', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', overflow: 'hidden', position: 'relative' }}>
      <style>
        {`
            .login-box { background: rgba(10,10,10,0.9); border: 1px solid #333; padding: 40px; border-radius: 15px; z-index: 10; width: 90%; max-width: 400px; box-shadow: 0 0 40px rgba(0, 229, 255, 0.1); position: relative; }
            .login-box::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 50px; height: 2px; background: #00e5ff; box-shadow: 0 0 10px #00e5ff; }
            .sys-title { text-align: center; letter-spacing: 4px; margin-bottom: 30px; font-size: 1.2rem; }
            .login-input { width: 100%; background: #050505; border: 1px solid #333; padding: 15px; color: #fff; font-family: monospace; margin-bottom: 15px; border-radius: 5px; outline: none; transition: 0.3s; }
            .login-input:focus { border-color: #00e5ff; box-shadow: inset 0 0 10px rgba(0,229,255,0.1); }
            .login-btn { width: 100%; background: transparent; border: 1px solid #00e5ff; color: #00e5ff; padding: 15px; font-family: monospace; font-weight: bold; letter-spacing: 2px; cursor: pointer; transition: 0.3s; border-radius: 5px; margin-top: 10px; }
            .login-btn:hover { background: #00e5ff; color: #000; box-shadow: 0 0 20px rgba(0,229,255,0.4); }
            .spinner { border: 2px solid transparent; border-top-color: #00e5ff; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto 20px auto; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}
      </style>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(circle at center, #050505 0%, #000 100%)', opacity: 0.8, pointerEvents: 'none' }} />
      {isBooting ? (
        <div className="login-box" style={{ textAlign: 'center', color: '#fff', fontSize: '0.8rem', lineHeight: '1.8' }}>
          <div className="spinner" />
          <div>VERIFICA CREDENZIALI...</div>
          <div style={{ color: '#888' }}>CONNESSIONE CLOUD [OK]</div>
          <div style={{ color: '#00e676', marginTop: '10px' }}>ACCESSO CONSENTITO</div>
        </div>
      ) : (
        <form className="login-box" onSubmit={onSubmit}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <img
              src="/nuovo%20logo%20trasparente2.png"
              alt="Kentuos Logo"
              decoding="async"
              style={{
                maxHeight: 52,
                width: 'auto',
                maxWidth: 'min(280px, 88vw)',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
          <p
            className="kentu-intro-phrase-text kentu-intro-phrase-text--glow"
            style={{
              textAlign: 'center',
              fontSize: '0.72rem',
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
              fontWeight: 300,
              letterSpacing: '0.06em',
              color: 'rgba(255,255,255,0.42)',
              marginBottom: '16px',
              lineHeight: 1.5,
            }}
          >
            {introPhrase}
          </p>
          <p style={{ textAlign: 'center', fontSize: '0.65rem', color: '#666', marginBottom: '20px' }}>SYSTEM ENCRYPTED. REQUIRE AUTHENTICATION.</p>
          <input type="email" placeholder="USER ID (EMAIL)" className="login-input" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
          <input type="password" placeholder="PASSWORD" className="login-input" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
          <button type="submit" className="login-btn">INIZIALIZZA</button>
        </form>
      )}
    </div>
  );
}
