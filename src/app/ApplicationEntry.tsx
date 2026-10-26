import React, { useEffect, useState } from 'react';
import { UserProfile } from '@shared/types';
import { App } from './App';
import { AuthPage } from '../modules/auth/AuthPage';
import { authService } from '../services/api/authService';
import '../styles/auth.css';

/** Keep all operational effects outside the signed-out application. */
export const ApplicationEntry: React.FC = () => {
  const [starting, setStarting] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>(() =>
    window.location.hash === '#signup' ? 'signup' : 'login');

  useEffect(() => {
    const timer = window.setTimeout(() => setStarting(false), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    const refreshSession = async () => {
      const request = ++latestRequest;
      const token = authService.getToken();
      setCheckingSession(true);
      const restored = await authService.restoreSession();
      if (!active || request !== latestRequest) return;
      if (authService.getToken() === token || !authService.getToken()) {
        setUser(restored);
        setCheckingSession(false);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'sentinel_auth_token' || event.key === null) void refreshSession();
    };
    void refreshSession();
    window.addEventListener('storage', onStorage);
    return () => { active = false; window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    const onHashChange = () => setMode(window.location.hash === '#signup' ? 'signup' : 'login');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const signOut = () => {
    // Clear identity before any asynchronous request; unmount App and its subscriptions immediately.
    void authService.signOut();
    setUser(null);
    setMode('login');
    window.location.hash = '#login';
  };

  if (starting) {
    return (
      <main className="auth-viewport" role="status" aria-label="Loading sign in">
        <div className="auth-container auth-card" aria-hidden="true">
          <div className="auth-skeleton-container">
            {[40, 80, 52, 52, 44].map((height, index) => (
              <div key={index} className="skeleton-shimmer" style={{ height, margin: '10px 0' }} />
            ))}
          </div>
        </div>
        <span className="auth-loading-label">Loading SENTINEL…</span>
      </main>
    );
  }

  if (checkingSession) return <main className="auth-viewport" role="status">Checking session…</main>;

  if (!user || user.status !== 'approved') {
    return <AuthPage currentUser={user} initialMode={mode} showInitialWireframe={false}
      onSignOut={signOut} onAuthenticated={(authenticated) => {
        if (authenticated.status !== 'approved') return;
        window.location.hash = '#dashboard';
        setUser(authenticated);
      }} />;
  }

  return <App currentUser={user} onSignOut={signOut} />;
};
