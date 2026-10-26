import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '@shared/types';
import { authService, SignUpPayload } from '../../services/api/authService';
import { Shield, Eye, EyeOff, Lock, Check, AlertCircle, Clock, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import { AddPersonnelModal } from './AddPersonnelModal';
import '../../styles/auth.css';

interface AuthPageProps {
  onAuthenticated: (user: UserProfile) => void;
  currentUser?: UserProfile | null;
  onSignOut?: () => void;
  initialMode?: 'login' | 'signup';
  showInitialWireframe?: boolean;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onAuthenticated,
  currentUser,
  onSignOut,
  initialMode = 'login',
  showInitialWireframe = true,
}) => {
  const [demoEnabled, setDemoEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    authService.getOptions().then(options => { if (active) setDemoEnabled(options.demoEnabled); });
    return () => { active = false; };
  }, []);

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);

  // Wireframe transition: one second on first mount, revealed over ~380ms, never replayed on mode toggle
  const [isWireframeSkeleton, setIsWireframeSkeleton] = useState<boolean>(showInitialWireframe);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [requestedRole, setRequestedRole] = useState<UserRole>('operator');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordActive, setForgotPasswordActive] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState<string | null>(null);

  // Button submission & morph states
  // 'idle' | 'morphing' | 'loading' | 'success' | 'error'
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAccount, setPendingAccount] = useState<UserProfile | null>(() => {
    if (currentUser && currentUser.status === 'pending') {
      return currentUser;
    }
    return null;
  });

  // Admin Personnel Registration Modal
  const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);
  const [approvalCheckMessage, setApprovalCheckMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!showInitialWireframe) return;
    const timer = window.setTimeout(() => setIsWireframeSkeleton(false), 1000);
    return () => window.clearTimeout(timer);
  }, [showInitialWireframe]);

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitState !== 'idle') return; // prevent duplicate submission

    // Form validation
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('A valid tactical or personnel email is required.');
      return;
    }
    if (!password) {
      setErrorMessage('Password is required.');
      return;
    }

    setErrorMessage(null);
    setSubmitState('loading'); // morphs rectangular button into circle with spinner

    try {
      const res = await authService.signIn(email.trim(), password);

      if (!res.success) {
        // Failed: restore original button and show real error
        setSubmitState('idle');
        if (res.status === 'pending') {
          setPendingAccount({
            id: 'PENDING-USER',
            email: email.trim(),
            name: email.split('@')[0],
            role: 'operator',
            status: 'pending',
            createdAt: new Date().toISOString(),
          });
        }
        setErrorMessage(res.error || 'Authentication denied. Verify credentials.');
        return;
      }

      if (res.user?.status === 'pending') {
        setSubmitState('idle');
        setPendingAccount(res.user);
        return;
      }

      // Success: morph to success icon briefly, then navigate
      setSubmitState('success');
      setTimeout(() => {
        if (res.user) {
          onAuthenticated(res.user);
        }
      }, 450);
    } catch (err) {
      setSubmitState('idle');
      setErrorMessage((err as Error).message || 'Connection failure during authentication.');
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitState !== 'idle') return;

    if (!fullName.trim()) {
      setErrorMessage('Full personnel name is required.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('A valid email address is required.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Password confirmation does not match.');
      return;
    }

    setErrorMessage(null);
    setSubmitState('loading');

    const payload: SignUpPayload = {
      name: fullName.trim(),
      email: email.trim(),
      password,
      callsign: callsign.trim() || undefined,
      role: requestedRole,
      teamId: 'ALPHA-SQUAD',
      teamName: 'Alpha Quick Reaction Team',
      missionId: 'MSN-FALLING-SUN',
      missionName: 'Operation Falling Sun',
    };

    try {
      const res = await authService.signUp(payload);

      if (!res.success) {
        setSubmitState('idle');
        setErrorMessage(res.error || 'Signup could not be processed.');
        return;
      }

      setSubmitState('success');
      setTimeout(() => {
        // Enforce mandatory approval: all public signups default to pending
        const registeredUser = res.user || {
          id: 'NEW-REGISTRATION',
          email: payload.email,
          name: payload.name,
          role: 'operator',
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        };
        setPendingAccount(registeredUser);
        setSubmitState('idle');
      }, 450);
    } catch (err) {
      setSubmitState('idle');
      setErrorMessage((err as Error).message || 'Network exception during signup.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Enter your registered email address first.');
      return;
    }
    setErrorMessage(null);
    const res = await authService.forgotPassword(email.trim());
    if (res.success) {
      setForgotPasswordMessage(res.message || 'Password reset instructions have been dispatched.');
    } else {
      setErrorMessage(res.error || 'Failed to dispatch password reset request.');
    }
  };

  const handleRecheckApproval = async () => {
    if (!pendingAccount || !password) {
      setApprovalCheckMessage('Sign in again to check your approval status.');
      return;
    }
    setApprovalCheckMessage('Checking approval…');
    const result = await authService.signIn(pendingAccount.email, password);
    if (result.success && result.user?.status === 'approved') {
      onAuthenticated(result.user);
      return;
    }
    setApprovalCheckMessage(result.error || 'Account remains pending approval.');
  };

  // If user is pending approval, render the locked pending screen
  if (pendingAccount) {
    return (
      <div className="auth-viewport">
        <div className="auth-container">
          <div className="auth-pending-card">
            <div style={{ display: 'inline-flex', padding: '0.85rem', borderRadius: '50%', backgroundColor: 'rgba(255, 179, 0, 0.12)', marginBottom: '1rem' }}>
              <Clock size={36} color="var(--status-warning, #FFB300)" />
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.75rem',
                color: 'var(--status-warning, #FFB300)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 700,
                marginBottom: '0.4rem',
              }}
            >
              Access Restricted // Pending Approval
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
              Account Verification In Progress
            </h2>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Your account has been registered in the SENTINEL directory. In accordance with security protocol, all personnel profiles must be authorized by an administrator before access to live mission data, telemetry, and health records is granted.
            </p>

            {/* Profile summary */}
            <div
              style={{
                backgroundColor: 'var(--bg-elevated, #1A2925)',
                border: '1px solid var(--border-grid, #14221E)',
                padding: '0.85rem 1rem',
                borderRadius: '3px',
                textAlign: 'left',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono, monospace)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                marginBottom: '1.25rem',
              }}
            >
              <div>Personnel: <strong style={{ color: 'var(--text-primary)' }}>{pendingAccount.name}</strong></div>
              <div>Email: <span style={{ color: 'var(--text-secondary)' }}>{pendingAccount.email}</span></div>
              <div>Status: <span style={{ color: 'var(--status-warning, #FFB300)', fontWeight: 600 }}>PENDING OFFICER APPROVAL</span></div>
              <div>Operational Data: <span style={{ color: 'var(--status-critical, #FF3B5C)' }}>LOCKED</span></div>
            </div>

            {approvalCheckMessage && (
              <div
                style={{
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--accent-primary, #00E676)',
                  marginBottom: '1rem',
                }}
              >
                {approvalCheckMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleRecheckApproval}
                style={{
                  flex: 1,
                  padding: '0.65rem',
                  background: 'var(--bg-elevated, #1A2925)',
                  border: '1px solid var(--border-card, #263D37)',
                  color: 'var(--text-primary, #F0FDF4)',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                }}
              >
                <RefreshCw size={14} />
                <span>Check Status</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingAccount(null);
                  authService.clearCurrentUser();
                  if (onSignOut) onSignOut();
                }}
                style={{
                  flex: 1,
                  padding: '0.65rem',
                  background: 'transparent',
                  border: '1px solid var(--border-card, #263D37)',
                  color: 'var(--text-secondary, #869E96)',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                }}
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-viewport">
      <div className="auth-container">
        <div className="auth-card">
          {/* SKELETON / WIREFRAME (one second on initial load) */}
          {isWireframeSkeleton ? (
            <div className="auth-skeleton-container" aria-hidden="true">
              {/* Header skeleton */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div className="skeleton-shimmer" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                  <div className="skeleton-shimmer" style={{ width: '180px', height: '14px' }} />
                </div>
                <div className="skeleton-shimmer" style={{ width: '220px', height: '26px', marginBottom: '0.5rem' }} />
                <div className="skeleton-shimmer" style={{ width: '100%', height: '14px', marginBottom: '1.5rem' }} />
              </div>

              {/* Form fields skeleton */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', margin: '1rem 0' }}>
                <div>
                  <div className="skeleton-shimmer" style={{ width: '80px', height: '12px', marginBottom: '0.4rem' }} />
                  <div className="skeleton-shimmer" style={{ width: '100%', height: '40px' }} />
                </div>
                <div>
                  <div className="skeleton-shimmer" style={{ width: '70px', height: '12px', marginBottom: '0.4rem' }} />
                  <div className="skeleton-shimmer" style={{ width: '100%', height: '40px' }} />
                </div>
              </div>

              {/* Submit button skeleton */}
              <div style={{ marginTop: '1.5rem' }}>
                <div className="skeleton-shimmer" style={{ width: '100%', height: '44px', borderRadius: '3px' }} />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.25rem' }}>
                  <div className="skeleton-shimmer" style={{ width: '160px', height: '14px' }} />
                </div>
              </div>
            </div>
          ) : (
            /* REAL INTERFACE (revealed smoothly without layout shift) */
            <div className="auth-form-reveal">
              {/* Header & Branding */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.72rem',
                    color: 'var(--accent-primary, #00E676)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: '0.35rem',
                  }}
                >
                  <Shield size={16} />
                  <span>SENTINEL v2.6 // C4ISR AUTHENTICATION</span>
                </div>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
                  {mode === 'login' ? 'Sign in to SENTINEL' : 'Register for SENTINEL'}
                </h1>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #869E96)', marginTop: '0.3rem', margin: '0.3rem 0 0 0' }}>
                  {mode === 'login'
                    ? 'Authenticate to access tactical command and telemetry.'
                    : 'Personnel self-registration. New profiles default to pending review.'}
                </p>
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 59, 92, 0.1)',
                    border: '1px solid rgba(255, 59, 92, 0.3)',
                    color: 'var(--status-critical, #FF3B5C)',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.8rem',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <div>{errorMessage}</div>
                </div>
              )}

              {/* Forgot password success */}
              {forgotPasswordMessage && (
                <div
                  style={{
                    backgroundColor: 'rgba(0, 230, 118, 0.08)',
                    border: '1px solid var(--accent-primary, #00E676)',
                    color: 'var(--text-primary)',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.8rem',
                    borderRadius: '3px',
                    marginBottom: '1rem',
                  }}
                >
                  {forgotPasswordMessage}
                </div>
              )}

              {/* Form Content */}
              {mode === 'login' ? (
                /* LOGIN FORM */
                <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label className="auth-label" htmlFor="sentinel-login-email">
                      <span>Personnel Email</span>
                      <span style={{ color: 'var(--text-muted)' }}>MIL-AUTH</span>
                    </label>
                    <div className="auth-input-group">
                      <input
                        id="sentinel-login-email"
                        type="email"
                        required
                        autoComplete="username"
                        placeholder="operator@sentinel.mil"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="auth-input"
                      />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label className="auth-label" htmlFor="sentinel-login-pwd" style={{ margin: 0 }}>
                        <span>Passcode</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setForgotPasswordActive(!forgotPasswordActive)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-secondary, #2DD4BF)',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>

                    <div className="auth-input-group">
                      <input
                        id="sentinel-login-pwd"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="auth-input"
                        style={{ paddingRight: '2.5rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="auth-toggle-pwd"
                        title={showPassword ? 'Hide password' : 'Show password'}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Inline Forgot Password Action */}
                  {forgotPasswordActive && (
                    <div
                      style={{
                        backgroundColor: 'var(--bg-elevated, #1A2925)',
                        border: '1px solid var(--border-grid, #14221E)',
                        padding: '0.75rem',
                        borderRadius: '3px',
                      }}
                    >
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Dispatch recovery instructions to the specified email:
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          style={{
                            padding: '0.4rem 0.8rem',
                            background: 'var(--bg-control, #172622)',
                            border: '1px solid var(--border-card, #263D37)',
                            color: 'var(--accent-secondary, #2DD4BF)',
                            borderRadius: '3px',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Send Reset Link
                        </button>
                        <button
                          type="button"
                          onClick={() => setForgotPasswordActive(false)}
                          style={{
                            padding: '0.4rem 0.6rem',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Submit Button Morphing into Circle */}
                  <div className="auth-btn-wrapper">
                    <button
                      type="submit"
                      disabled={submitState !== 'idle'}
                      className={`auth-submit-btn ${
                        submitState === 'loading'
                          ? 'btn-morphed-loading'
                          : submitState === 'success'
                          ? 'btn-morphed-success'
                          : ''
                      }`}
                    >
                      {submitState === 'loading' ? (
                        <div className="auth-spinner" />
                      ) : submitState === 'success' ? (
                        <Check size={20} />
                      ) : (
                        <>
                          <Lock size={15} />
                          <span>Sign In to SENTINEL</span>
                        </>
                      )}
                    </button>
                  </div>

                  {demoEnabled && <button type="button" className="btn" disabled={submitState !== 'idle'} onClick={async () => {
                    setSubmitState('loading'); setErrorMessage(null);
                    const result = await authService.signInDemo();
                    if (result.success && result.user?.status === 'approved') onAuthenticated(result.user);
                    else { setSubmitState('idle'); setErrorMessage(result.error || 'Demo sign in failed.'); }
                  }}>Explore simulated demo</button>}

                  {/* Toggle Mode */}
                  <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    New personnel profile?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        window.location.hash = '#signup';
                        setErrorMessage(null);
                        setForgotPasswordMessage(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-primary, #00E676)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        fontFamily: 'inherit',
                        textDecoration: 'underline',
                      }}
                    >
                      Create account
                    </button>
                  </div>
                </form>
              ) : (
                /* SIGNUP FORM */
                <form onSubmit={handleSignupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  <div>
                    <label className="auth-label" htmlFor="sentinel-signup-name">
                      <span>Full Personnel Name *</span>
                    </label>
                    <input
                      id="sentinel-signup-name"
                      type="text"
                      required
                      placeholder="e.g. Sgt. Sarah Miller"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="auth-input"
                    />
                  </div>

                  <div>
                    <label className="auth-label" htmlFor="sentinel-signup-email">
                      <span>Official Email *</span>
                    </label>
                    <input
                      id="sentinel-signup-email"
                      type="email"
                      required
                      placeholder="sarah.miller@sentinel.mil"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="auth-input"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <div>
                      <label className="auth-label" htmlFor="sentinel-signup-callsign">
                        <span>Callsign (Optional)</span>
                      </label>
                      <input
                        id="sentinel-signup-callsign"
                        type="text"
                        placeholder="e.g. VALKYRIE"
                        value={callsign}
                        onChange={(e) => setCallsign(e.target.value)}
                        className="auth-input"
                      />
                    </div>

                    <div>
                      <label className="auth-label" htmlFor="sentinel-signup-role">
                        <span>Primary Specialty</span>
                      </label>
                      <select
                        id="sentinel-signup-role"
                        value={requestedRole}
                        onChange={(e) => setRequestedRole(e.target.value as UserRole)}
                        className="auth-input"
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="operator">Operator</option>
                        <option value="medic">Medical Officer</option>
                        <option value="commander">Unit Commander</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <div>
                      <label className="auth-label" htmlFor="sentinel-signup-pwd">
                        <span>Password *</span>
                      </label>
                      <input
                        id="sentinel-signup-pwd"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        placeholder="Min 6 chars"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="auth-input"
                      />
                    </div>
                    <div>
                      <label className="auth-label" htmlFor="sentinel-signup-confirm">
                        <span>Confirm *</span>
                      </label>
                      <input
                        id="sentinel-signup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Re-enter"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="auth-input"
                      />
                    </div>
                  </div>

                  {/* Operational Security Notice */}
                  <div
                    style={{
                      backgroundColor: 'rgba(0, 230, 118, 0.05)',
                      border: '1px solid rgba(0, 230, 118, 0.2)',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '3px',
                      fontSize: '0.74rem',
                      color: 'var(--text-secondary, #869E96)',
                    }}
                  >
                    Note: Newly registered accounts default to <strong>PENDING</strong> status and require administrative confirmation prior to unlocking operational C4ISR feeds.
                  </div>

                  {/* Submit Button Morphing into Circle */}
                  <div className="auth-btn-wrapper">
                    <button
                      type="submit"
                      disabled={submitState !== 'idle'}
                      className={`auth-submit-btn ${
                        submitState === 'loading'
                          ? 'btn-morphed-loading'
                          : submitState === 'success'
                          ? 'btn-morphed-success'
                          : ''
                      }`}
                    >
                      {submitState === 'loading' ? (
                        <div className="auth-spinner" />
                      ) : submitState === 'success' ? (
                        <Check size={20} />
                      ) : (
                        <>
                          <UserPlus size={15} />
                          <span>Register Personnel Profile</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Link back to login */}
                  <div style={{ textAlign: 'center', marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Already have credentials?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        window.location.hash = '#login';
                        setErrorMessage(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-primary, #00E676)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        fontFamily: 'inherit',
                        textDecoration: 'underline',
                      }}
                    >
                      Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Admin Personnel Modal (available when triggered by senior officers) */}
      <AddPersonnelModal
        isOpen={isAddPersonnelOpen}
        onClose={() => setIsAddPersonnelOpen(false)}
        currentUserRole={currentUser?.role || 'admin'}
      />
    </div>
  );
};
