import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  loginWithGoogle,
  logout,
  subscribeToAuth,
} from '../services/firebaseAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    return subscribeToAuth((firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      authReady,
      uid: user?.uid ?? null,
      loginWithGoogle,
      logout,
    }),
    [user, authReady],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
