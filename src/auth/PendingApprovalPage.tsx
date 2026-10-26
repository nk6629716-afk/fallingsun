import React, { useState, useEffect } from 'react';
import { Clock, RefreshCw, LogOut, ShieldAlert, XCircle, Ban, CheckCircle2 } from 'lucide-react';
import { authService } from '../services/auth/authService';
import { UserProfile, ApprovalStatus } from '@shared/types';

interface PendingApprovalPageProps {
  onLogout?: () => void;
  onApproved?: () => void;
}

export const PendingApprovalPage: React.FC<PendingApprovalPageProps> = ({ onLogout, onApproved }) => {
  const [user, setUser] = useState<UserProfile | null>(() => authService.getUser());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const status: ApprovalStatus = user?.approvalStatus || 'pending';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      const refreshed = await authService.refreshSession();
      if (refreshed?.user) {
        setUser(refreshed.user);
        if (refreshed.user.approvalStatus === 'approved') {
          setStatusMessage('Account approved! Entering operational console...');
          if (onApproved) onApproved();
        } else {
          const statusText = refreshed.user.approvalStatus?.toUpperCase() || 'PENDING';
          setStatusMessage(`Status checked at ${new Date().toLocaleTimeString()}: ${statusText}`);
        }
      }
    } catch (err: any) {
      setStatusMessage('Failed to reach server. Please check connection.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    if (onLogout) onLogout();
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
          maxWidth: '480px',
          background: '#181d1a',
          border: '1px solid rgba(115, 138, 101, 0.35)',
          borderRadius: '8px',
          padding: '32px 28px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          textAlign: 'center',
        }}
      >
        {/* Status Icon */}
        <div>
          <div
            style={{
              display: 'inline-flex',
              padding: '16px',
              borderRadius: '50%',
              background:
                status === 'approved'
                  ? 'rgba(88, 129, 87, 0.2)'
                  : status === 'rejected' || status === 'suspended'
                  ? 'rgba(200, 90, 83, 0.2)'
                  : 'rgba(212, 163, 115, 0.2)',
              border:
                status === 'approved'
                  ? '1px solid rgba(88, 129, 87, 0.5)'
                  : status === 'rejected' || status === 'suspended'
                  ? '1px solid rgba(200, 90, 83, 0.5)'
                  : '1px solid rgba(212, 163, 115, 0.5)',
              marginBottom: '12px',
            }}
          >
            {status === 'approved' && <CheckCircle2 size={36} color="#588157" />}
            {status === 'rejected' && <XCircle size={36} color="#c85a53" />}
            {status === 'suspended' && <Ban size={36} color="#c85a53" />}
            {status === 'pending' && <Clock size={36} color="#d4a373" />}
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color:
                status === 'approved'
                  ? '#588157'
                  : status === 'rejected' || status === 'suspended'
                  ? '#c85a53'
                  : '#d4a373',
            }}
          >
            {status === 'pending' && 'REGISTRATION PENDING REVIEW'}
            {status === 'approved' && 'ACCOUNT APPROVED'}
            {status === 'rejected' && 'ACCESS REGISTRATION REJECTED'}
            {status === 'suspended' && 'ACCOUNT ACCESS SUSPENDED'}
          </h1>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.78rem', color: '#94a192' }}>
            {status === 'pending' &&
              'Your profile has been submitted and is awaiting administrative clearance before operational access can be granted.'}
            {status === 'rejected' &&
              'Your registration request was not approved by the system administrator. Operational data is restricted.'}
            {status === 'suspended' &&
              'This account has been administratively suspended from operational duties and data streams.'}
            {status === 'approved' && 'Clearance confirmed. Proceeding to operational dashboard.'}
          </p>
        </div>

        {/* User Card */}
        {user && (
          <div
            style={{
              background: '#161c18',
              border: '1px solid rgba(115, 138, 101, 0.2)',
              borderRadius: '6px',
              padding: '12px 16px',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a192' }}>Applicant:</span>
              <span style={{ color: '#e9ece9', fontWeight: 700 }}>{user.badgeName || user.email}</span>
            </div>
            {user.soldierId && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a192' }}>Assigned ID:</span>
                <span style={{ color: '#738a65', fontWeight: 700 }}>{user.soldierId}</span>
              </div>
            )}
            {user.regimentNo && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a192' }}>Regiment:</span>
                <span style={{ color: '#e9ece9' }}>{user.regimentNo}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a192' }}>Status:</span>
              <span
                style={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color:
                    status === 'approved'
                      ? '#588157'
                      : status === 'rejected' || status === 'suspended'
                      ? '#c85a53'
                      : '#d4a373',
                }}
              >
                {status}
              </span>
            </div>
          </div>
        )}

        {/* Status Message feedback */}
        {statusMessage && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              background: 'rgba(115, 138, 101, 0.1)',
              border: '1px solid rgba(115, 138, 101, 0.3)',
              fontSize: '0.72rem',
              color: '#738a65',
            }}
          >
            {statusMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            id="pending-refresh-btn"
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              flex: 1,
              padding: '10px 14px',
              background: '#738a65',
              border: 'none',
              borderRadius: '4px',
              color: '#0e1210',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: isRefreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'CHECKING...' : 'REFRESH STATUS'}</span>
          </button>

          <button
            id="pending-logout-btn"
            type="button"
            onClick={handleLogout}
            style={{
              padding: '10px 14px',
              background: 'transparent',
              border: '1px solid rgba(200, 90, 83, 0.4)',
              borderRadius: '4px',
              color: '#c85a53',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontFamily: 'inherit',
            }}
          >
            <LogOut size={13} />
            <span>LOGOUT</span>
          </button>
        </div>
      </div>
    </div>
  );
};
