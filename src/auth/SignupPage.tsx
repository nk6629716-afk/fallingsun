import React, { useState } from 'react';
import { UserPlus, Shield, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { authService } from '../services/auth/authService';

interface SignupPageProps {
  onSuccess?: () => void;
}

export const SignupPage: React.FC<SignupPageProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [badgeName, setBadgeName] = useState('');
  const [regimentNo, setRegimentNo] = useState('');
  const [heightCm, setHeightCm] = useState('178');
  const [weightKg, setWeightKg] = useState('74');
  const [ageYears, setAgeYears] = useState('26');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client validation
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (!badgeName.trim()) {
      setErrorMessage('Badge name is required.');
      return;
    }

    if (!regimentNo.trim()) {
      setErrorMessage('Regiment number is required.');
      return;
    }

    const h = Number(heightCm);
    const w = Number(weightKg);
    const a = Number(ageYears);

    if (isNaN(h) || h < 50 || h > 260) {
      setErrorMessage('Please enter a valid height between 50 and 260 cm.');
      return;
    }

    if (isNaN(w) || w < 20 || w > 300) {
      setErrorMessage('Please enter a valid weight between 20 and 300 kg.');
      return;
    }

    if (isNaN(a) || !Number.isInteger(a) || a < 16 || a > 100) {
      setErrorMessage('Please enter a valid age between 16 and 100 years.');
      return;
    }

    setIsLoading(true);

    try {
      await authService.signup({
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        badgeName: badgeName.trim(),
        regimentNo: regimentNo.trim(),
        heightCm: h,
        weightKg: w,
        ageYears: a,
      });

      if (typeof window !== 'undefined') {
        window.location.hash = '#pending';
      }
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#121614',
        padding: '24px',
        color: '#e9ece9',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: '#181d1a',
          border: '1px solid rgba(115, 138, 101, 0.35)',
          borderRadius: '8px',
          padding: '28px 24px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '10px',
              borderRadius: '50%',
              background: 'rgba(115, 138, 101, 0.15)',
              border: '1px solid rgba(115, 138, 101, 0.4)',
              marginBottom: '10px',
            }}
          >
            <UserPlus size={28} color="#738a65" />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.2rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#e9ece9',
            }}
          >
            PERSONNEL INTAKE REGISTRATION
          </h1>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: '0.72rem',
              color: '#94a192',
              letterSpacing: '0.03em',
            }}
          >
            ALL NEW ACCOUNTS REQUIRE ADMINISTRATOR ACCESS APPROVAL
          </p>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div
            style={{
              padding: '8px 12px',
              background: 'rgba(200, 90, 83, 0.15)',
              border: '1px solid rgba(200, 90, 83, 0.4)',
              borderRadius: '4px',
              color: '#c85a53',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Credentials */}
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a192', marginBottom: '4px' }}>
              OFFICIAL EMAIL ADDRESS *
            </label>
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cadet@sentinel.mil"
              style={{
                width: '100%',
                padding: '7px 10px',
                background: '#161c18',
                border: '1px solid rgba(115, 138, 101, 0.3)',
                borderRadius: '4px',
                color: '#e9ece9',
                fontSize: '0.78rem',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a192', marginBottom: '4px' }}>
                PASSWORD (MIN 8) *
              </label>
              <input
                id="signup-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#161c18',
                  border: '1px solid rgba(115, 138, 101, 0.3)',
                  borderRadius: '4px',
                  color: '#e9ece9',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a192', marginBottom: '4px' }}>
                CONFIRM PASSWORD *
              </label>
              <input
                id="signup-confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#161c18',
                  border: '1px solid rgba(115, 138, 101, 0.3)',
                  borderRadius: '4px',
                  color: '#e9ece9',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Personnel identifiers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a192', marginBottom: '4px' }}>
                BADGE NAME / CALLSIGN *
              </label>
              <input
                id="signup-badge-name"
                type="text"
                required
                value={badgeName}
                onChange={(e) => setBadgeName(e.target.value)}
                placeholder="e.g. SGT Miller / Falcon-7"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#161c18',
                  border: '1px solid rgba(115, 138, 101, 0.3)',
                  borderRadius: '4px',
                  color: '#e9ece9',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a192', marginBottom: '4px' }}>
                REGIMENT NO. (PRESERVES ZEROS) *
              </label>
              <input
                id="signup-regiment-no"
                type="text"
                required
                value={regimentNo}
                onChange={(e) => setRegimentNo(e.target.value)}
                placeholder="e.g. 0042-B"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#161c18',
                  border: '1px solid rgba(115, 138, 101, 0.3)',
                  borderRadius: '4px',
                  color: '#e9ece9',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Physiological Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a192', marginBottom: '4px' }}>
                HEIGHT *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  id="signup-height-cm"
                  type="number"
                  required
                  min="50"
                  max="260"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: '#161c18',
                    border: '1px solid rgba(115, 138, 101, 0.3)',
                    borderRadius: '4px',
                    color: '#e9ece9',
                    fontSize: '0.78rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#738a65', fontWeight: 700 }}>cm</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a192', marginBottom: '4px' }}>
                WEIGHT *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  id="signup-weight-kg"
                  type="number"
                  required
                  min="20"
                  max="300"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: '#161c18',
                    border: '1px solid rgba(115, 138, 101, 0.3)',
                    borderRadius: '4px',
                    color: '#e9ece9',
                    fontSize: '0.78rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#738a65', fontWeight: 700 }}>kg</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a192', marginBottom: '4px' }}>
                AGE *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  id="signup-age-years"
                  type="number"
                  required
                  min="16"
                  max="100"
                  value={ageYears}
                  onChange={(e) => setAgeYears(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: '#161c18',
                    border: '1px solid rgba(115, 138, 101, 0.3)',
                    borderRadius: '4px',
                    color: '#e9ece9',
                    fontSize: '0.78rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#738a65', fontWeight: 700 }}>yrs</span>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '8px 10px',
              borderRadius: '4px',
              background: 'rgba(212, 163, 115, 0.1)',
              border: '1px solid rgba(212, 163, 115, 0.25)',
              fontSize: '0.68rem',
              color: '#d4a373',
            }}
          >
            Notice: Account access approval is administrative clearance to operate the platform, not medical fitness-for-duty certification.
          </div>

          <button
            id="signup-submit-btn"
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: '4px',
              padding: '10px 16px',
              background: '#738a65',
              border: 'none',
              borderRadius: '4px',
              color: '#0e1210',
              fontWeight: 700,
              fontSize: '0.82rem',
              letterSpacing: '0.04em',
              cursor: isLoading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: 'inherit',
            }}
          >
            <span>{isLoading ? 'SUBMITTING PROFILE...' : 'SUBMIT REGISTRATION FOR REVIEW'}</span>
            <ArrowRight size={14} />
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a192' }}>
          Already registered?{' '}
          <a
            href="#login"
            style={{
              color: '#738a65',
              fontWeight: 700,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Return to Login Gate
          </a>
        </div>
      </div>
    </div>
  );
};
