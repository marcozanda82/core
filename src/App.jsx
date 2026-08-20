import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import WeeklyPlannerPage from './pages/WeeklyPlannerPage';
import CentroAnalisiPage from './pages/CentroAnalisiPage';
import ConsultoPreview from './pages/ConsultoPreview';
import { ChatOverlayProvider } from './contexts/ChatOverlayContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import GlobalChatOverlay from './components/GlobalChatOverlay';
import LoginScreen from './components/auth/LoginScreen';
import AuthLoadingScreen from './components/auth/AuthLoadingScreen';
import UserOnboardingWizard from './components/onboarding/UserOnboardingWizard';
import { db } from './firebaseConfig';

const SalaComandi = lazy(() => import('./SalaComandi'));

function AppBootFallback() {
  return (
    <div
      style={{ minHeight: '100dvh', width: '100%', background: '#050a12' }}
      aria-busy
      aria-label="Caricamento KentuOS"
    />
  );
}

/**
 * Dopo login: se `profile.firstSetupCompleted !== true`, mostra il Battesimo
 * al posto dell'app principale. Al submit smonta il wizard e rivela SalaComandi.
 */
function AuthenticatedApp() {
  const { user, authReady } = useAuth();
  const [profileCheckReady, setProfileCheckReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [seedProfile, setSeedProfile] = useState(null);
  const [seedTargets, setSeedTargets] = useState(null);

  useEffect(() => {
    if (!authReady) return undefined;
    if (!user?.uid) {
      setProfileCheckReady(false);
      setNeedsOnboarding(false);
      setSeedProfile(null);
      setSeedTargets(null);
      return undefined;
    }

    let cancelled = false;
    setProfileCheckReady(false);

    get(ref(db, `users/${user.uid}/profile_targets`))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.exists() ? snap.val() : null;
        const profile = data?.profile && typeof data.profile === 'object' ? data.profile : null;
        const targets = data?.targets && typeof data.targets === 'object' ? data.targets : null;
        setSeedProfile(profile);
        setSeedTargets(targets);
        setNeedsOnboarding(profile?.firstSetupCompleted !== true);
        setProfileCheckReady(true);
      })
      .catch((err) => {
        console.warn('[Onboarding] lettura profile_targets fallita', err);
        if (cancelled) return;
        // Fail-open verso onboarding: meglio calibrare che restare sui fallback.
        setSeedProfile(null);
        setSeedTargets(null);
        setNeedsOnboarding(true);
        setProfileCheckReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user?.uid]);

  const handleOnboardingCompleted = useCallback((payload) => {
    setSeedProfile(payload?.profile ?? null);
    setSeedTargets(payload?.targets ?? null);
    setNeedsOnboarding(false);
  }, []);

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!profileCheckReady) {
    return <AuthLoadingScreen />;
  }

  if (needsOnboarding) {
    return (
      <UserOnboardingWizard
        uid={user.uid}
        displayName={user.displayName || ''}
        initialProfile={seedProfile}
        initialTargets={seedTargets}
        onCompleted={handleOnboardingCompleted}
      />
    );
  }

  return (
    <>
      <Suspense fallback={<AppBootFallback />}>
        <Routes>
          <Route path="/" element={<SalaComandi />} />
          {/* Preview Battesimo: non scrive firstSetupCompleted su Firebase. */}
          <Route
            path="/nuovoutente"
            element={
              <UserOnboardingWizard
                uid={user.uid}
                displayName={user.displayName || ''}
                isSimulationMode
              />
            }
          />
          {/* Legacy deep-link: `/planner` → home (WeeklyBuilder smantellato). */}
          <Route path="/planner" element={<WeeklyPlannerPage />} />
          {/* Centro Analisi: scheletro isolato, non tocca Storico / Timeline. */}
          <Route path="/centro-analisi" element={<CentroAnalisiPage />} />
          <Route path="/analisi" element={<CentroAnalisiPage />} />
          <Route path="/consulto" element={<ConsultoPreview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <GlobalChatOverlay />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ChatOverlayProvider>
        <BrowserRouter>
          <AuthenticatedApp />
        </BrowserRouter>
      </ChatOverlayProvider>
    </AuthProvider>
  );
}
