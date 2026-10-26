import React, { useState } from 'react';
import { Shield, Lock, Mail, AlertTriangle, ArrowRight, UserCheck } from 'lucide-react';
import { authService } from '../services/auth/authService';
import { UserRole } from '@shared/types';

interface LoginPageProps {
  onSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      await authService.loginWithSupabase(email, password);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = (role: UserRole) => {
    authService.demoLogin(role);
    if (onSuccess) onSuccess();
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
          maxWidth: '440px',
          background: '#181d1a',
          border: '1px solid rgba(115, 138, 101, 0.35)',
          borderRadius: '8px',
          padding: '32px 28px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
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
              marginBottom: '12px',
            }}
          >
            <Shield size={32} color="#738a65" />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#e9ece9',
            }}
          >
            SENTINEL ACCESS GATE
          </h1>
          <p
            style={{
              margin: '6px 0 0 0',
              fontSize: '0.75rem',
              color: '#94a192',
              letterSpacing: '0.04em',
            }}
          >
            OPERATIONAL CLEARANCE & AUTHENTICATION
          </p>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
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
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: '#94a192', marginBottom: '6px' }}>
              OPERATIONAL EMAIL
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={14} color="#738a65" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@sentinel.mil"
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  background: '#161c18',
                  border: '1px solid rgba(115, 138, 101, 0.3)',
                  borderRadius: '4px',
                  color: '#e9ece9',
                  fontSize: '0.82rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', color: '#94a192', marginBottom: '6px' }}>
              SECURITY PASSWORD
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} color="#738a65" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  background: '#161c18',
                  border: '1px solid rgba(115, 138, 101, 0.3)',
                  borderRadius: '4px',
                  color: '#e9ece9',
                  fontSize: '0.82rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: '8px',
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
            <span>{isLoading ? 'VERIFYING CREDENTIALS...' : 'AUTHENTICATE & ENTER'}</span>
            <ArrowRight size={14} />
          </button>
        </form>

        {/* Link to Signup */}
        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a192' }}>
          New personnel intake?{' '}
          <a
            href="#signup"
            style={{
              color: '#738a65',
              fontWeight: 700,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Submit Registration Profile
          </a>
        </div>

        {/* Tactical Air-Gap Demo Roles Strip */}
        <div
          style={{
            marginTop: '10px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(115, 138, 101, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#667564', textAlign: 'center' }}>
            LOCAL AIR-GAP DEMO CLEARANCE (STANDALONE)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button
              type="button"
              onClick={() => handleDemoLogin('administrator')}
              style={{
                padding: '6px 8px',
                background: 'rgba(115, 138, 101, 0.1)',
                border: '1px solid rgba(115, 138, 101, 0.3)',
                borderRadius: '4px',
                color: '#e9ece9',
                fontSize: '0.7rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <UserCheck size={12} color="#738a65" />
              <span>Admin Demo</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('medical_officer')}
              style={{
                padding: '6px 8px',
                background: 'rgba(115, 138, 101, 0.1)',
                border: '1px solid rgba(115, 138, 101, 0.3)',
                borderRadius: '4px',
                color: '#e9ece9',
                fontSize: '0.7rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <UserCheck size={12} color="#588157" />
              <span>Medical Demo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
