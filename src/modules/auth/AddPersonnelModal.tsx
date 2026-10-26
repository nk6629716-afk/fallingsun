import React, { useState } from 'react';
import { UserRole } from '@shared/types';
import { authService, AddPersonnelPayload } from '../../services/api/authService';
import { Shield, UserPlus, CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react';

interface AddPersonnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserRole: UserRole | string;
  onPersonnelAdded?: (personnel: any) => void;
}

export const AddPersonnelModal: React.FC<AddPersonnelModalProps> = ({
  isOpen,
  onClose,
  currentUserRole,
  onPersonnelAdded,
}) => {
  const [personnelId, setPersonnelId] = useState('');
  const [name, setName] = useState('');
  const [callsign, setCallsign] = useState('');
  const [teamId, setTeamId] = useState('ALPHA-SQUAD');
  const [teamName, setTeamName] = useState('Alpha Quick Reaction Team');
  const [missionId, setMissionId] = useState('MSN-FALLING-SUN');
  const [missionName, setMissionName] = useState('Operation Falling Sun');
  const [role, setRole] = useState<UserRole>('operator');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    personnel: any;
    accountLinked: boolean;
    linkedUserEmail?: string;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const isAuthorizedOfficial = currentUserRole === 'admin' || currentUserRole === 'commander';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedOfficial) {
      setError('Access Denied: Only authorized senior officials (admin or commander) can register personnel.');
      return;
    }

    if (!personnelId.trim() || !name.trim()) {
      setError('Both Unique Personnel ID and Full Name are strictly required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessResult(null);

    const payload: AddPersonnelPayload = {
      id: personnelId.trim().toUpperCase(),
      name: name.trim(),
      callsign: callsign.trim() || personnelId.trim().toUpperCase(),
      teamId,
      teamName,
      missionId,
      missionName,
      role,
      isNewRegistration: true,
    };

    const res = await authService.addPersonnel(payload, currentUserRole);
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || 'Failed to register personnel.');
      return;
    }

    setSuccessResult({
      personnel: res.personnel,
      accountLinked: !!res.accountLinked,
      linkedUserEmail: res.linkedUserEmail,
      message: res.message || `Personnel ${payload.id} successfully registered.`,
    });

    if (onPersonnelAdded && res.personnel) {
      onPersonnelAdded(res.personnel);
    }
  };

  const handleReset = () => {
    setPersonnelId('');
    setName('');
    setCallsign('');
    setSuccessResult(null);
    setError(null);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(6, 10, 9, 0.85)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-card, #131E1B)',
          border: '1px solid var(--border-card, #263D37)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
          borderRadius: '4px',
          width: '100%',
          maxWidth: '520px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-grid, #14221E)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-shell, #0D1412)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Shield size={18} color="var(--accent-primary, #00E676)" />
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.7rem',
                  color: 'var(--accent-primary, #00E676)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Authorized Officer Protocol
              </div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Register Personnel Profile</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #869E96)',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem', maxHeight: '75vh', overflowY: 'auto' }}>
          {!isAuthorizedOfficial ? (
            <div
              style={{
                backgroundColor: 'rgba(255, 59, 92, 0.1)',
                border: '1px solid rgba(255, 59, 92, 0.3)',
                padding: '1rem',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                color: 'var(--status-critical, #FF3B5C)',
              }}
            >
              <AlertTriangle size={20} />
              <div style={{ fontSize: '0.85rem' }}>
                Access Restricted: Only active Administrators or Unit Commanders have authorization to provision personnel.
              </div>
            </div>
          ) : successResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  backgroundColor: 'rgba(0, 230, 118, 0.08)',
                  border: '1px solid var(--accent-primary, #00E676)',
                  padding: '1rem',
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                }}
              >
                <CheckCircle size={22} color="var(--accent-primary, #00E676)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary, #F0FDF4)' }}>
                    Personnel Profile Registered
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #869E96)', marginTop: '0.25rem' }}>
                    {successResult.message}
                  </div>
                </div>
              </div>

              {/* Status details */}
              <div
                style={{
                  backgroundColor: 'var(--bg-elevated, #1A2925)',
                  padding: '0.85rem',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.78rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                }}
              >
                <div>ID: <strong style={{ color: 'var(--text-primary)' }}>{successResult.personnel.id}</strong></div>
                <div>Name: <strong style={{ color: 'var(--text-primary)' }}>{successResult.personnel.name}</strong></div>
                <div>Unit: <span style={{ color: 'var(--text-secondary)' }}>{successResult.personnel.teamName}</span></div>
                <div>Account Link: {successResult.accountLinked ? (
                  <span style={{ color: 'var(--status-safe, #00E676)', fontWeight: 600 }}>
                    ACTIVE ({successResult.linkedUserEmail})
                  </span>
                ) : (
                  <span style={{ color: 'var(--status-warning, #FFB300)' }}>
                    AWAITING SIGNUP LINKAGE ({successResult.personnel.id.toLowerCase()}@sentinel.mil)
                  </span>
                )}</div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    background: 'var(--bg-elevated, #1A2925)',
                    border: '1px solid var(--border-card, #263D37)',
                    color: 'var(--text-primary, #F0FDF4)',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  Register Another
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    background: 'var(--accent-primary, #00E676)',
                    border: '1px solid var(--accent-primary, #00E676)',
                    color: '#060A09',
                    fontWeight: 700,
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {error && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 59, 92, 0.1)',
                    border: '1px solid rgba(255, 59, 92, 0.3)',
                    color: 'var(--status-critical, #FF3B5C)',
                    padding: '0.6rem 0.8rem',
                    fontSize: '0.8rem',
                    borderRadius: '3px',
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="auth-label">Unique Personnel ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. OP-704"
                    value={personnelId}
                    onChange={(e) => setPersonnelId(e.target.value)}
                    className="auth-input"
                  />
                </div>
                <div>
                  <label className="auth-label">Tactical Callsign</label>
                  <input
                    type="text"
                    placeholder="e.g. IRON-HORSE"
                    value={callsign}
                    onChange={(e) => setCallsign(e.target.value)}
                    className="auth-input"
                  />
                </div>
              </div>

              <div>
                <label className="auth-label">Full Personnel Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Staff Sgt. Johnathan Vance"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="auth-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="auth-label">Operational Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="auth-input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="operator">Operator (Field Personnel)</option>
                    <option value="medic">Medical Officer</option>
                    <option value="commander">Unit Commander</option>
                    {currentUserRole === 'admin' && <option value="admin">System Administrator</option>}
                  </select>
                </div>
                <div>
                  <label className="auth-label">Assigned Squad / Unit</label>
                  <select
                    value={teamId}
                    onChange={(e) => {
                      setTeamId(e.target.value);
                      if (e.target.value === 'ALPHA-SQUAD') setTeamName('Alpha Quick Reaction Team');
                      if (e.target.value === 'BRAVO-RECON') setTeamName('Bravo Reconnaissance Unit');
                      if (e.target.value === 'MEDIC-CHARLIE') setTeamName('Charlie Field Medical Detachment');
                    }}
                    className="auth-input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="ALPHA-SQUAD">Alpha Quick Reaction Team</option>
                    <option value="BRAVO-RECON">Bravo Reconnaissance Unit</option>
                    <option value="MEDIC-CHARLIE">Charlie Field Medical Detachment</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="auth-label">Assigned Operation</label>
                <input
                  type="text"
                  value={missionName}
                  onChange={(e) => setMissionName(e.target.value)}
                  className="auth-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '0.55rem 1rem',
                    background: 'transparent',
                    border: '1px solid var(--border-card, #263D37)',
                    color: 'var(--text-secondary, #869E96)',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '0.55rem 1.25rem',
                    background: 'var(--accent-primary, #00E676)',
                    border: '1px solid var(--accent-primary, #00E676)',
                    color: '#060A09',
                    borderRadius: '3px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="auth-spinner" />
                      <span>Writing Record...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      <span>Persist Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
