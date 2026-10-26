import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, XCircle, Ban, RefreshCw, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { authService } from '../services/auth/authService';
import { AccountProfile, UserRole, ApprovalStatus } from '@shared/types';

interface AdminApprovalPageProps {
  onBackToApp: () => void;
}

export const AdminApprovalPage: React.FC<AdminApprovalPageProps> = ({ onBackToApp }) => {
  const [registrations, setRegistrations] = useState<AccountProfile[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Decision modal state
  const [activeReg, setActiveReg] = useState<AccountProfile | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [assignedRole, setAssignedRole] = useState<UserRole>('read_only_viewer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRegistrations = async () => {
    setIsLoading(true);
    try {
      const token = authService.getToken();
      const url = statusFilter === 'all'
        ? '/api/admin/registrations'
        : `/api/admin/registrations?status=${encodeURIComponent(statusFilter)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setRegistrations(json.data || []);
      }
    } catch (err: any) {
      console.warn('[AdminApprovalPage] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, [statusFilter]);

  const handleDecision = async (decision: 'approved' | 'rejected' | 'suspended') => {
    if (!activeReg) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const token = authService.getToken();
      const res = await fetch(`/api/admin/registrations/${activeReg.id}/decision`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          decision,
          reason: decisionReason.trim() || undefined,
          role: decision === 'approved' ? assignedRole : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to submit decision');
      }

      setFeedback(`Decision recorded: ${activeReg.badgeName} is now ${decision.toUpperCase()}.`);
      setActiveReg(null);
      setDecisionReason('');
      fetchRegistrations();
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#121614',
        padding: '24px',
        color: '#e9ece9',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#181d1a',
            border: '1px solid rgba(115, 138, 101, 0.3)',
            borderRadius: '6px',
            padding: '16px 20px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={onBackToApp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                background: '#161c18',
                border: '1px solid rgba(115, 138, 101, 0.3)',
                borderRadius: '4px',
                color: '#738a65',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <ArrowLeft size={14} />
              <span>Back to Console</span>
            </button>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#e9ece9' }}>
              ADMINISTRATIVE CLEARANCE & INTAKE APPROVALS
            </h1>
          </div>

          <button
            type="button"
            onClick={fetchRegistrations}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#161c18',
              border: '1px solid rgba(115, 138, 101, 0.3)',
              borderRadius: '4px',
              color: '#e9ece9',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh Roster</span>
          </button>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '4px',
              background: feedback.startsWith('Error') ? 'rgba(200, 90, 83, 0.15)' : 'rgba(88, 129, 87, 0.2)',
              border: feedback.startsWith('Error') ? '1px solid rgba(200, 90, 83, 0.4)' : '1px solid rgba(88, 129, 87, 0.4)',
              color: feedback.startsWith('Error') ? '#c85a53' : '#588157',
              fontSize: '0.78rem',
            }}
          >
            {feedback}
          </div>
        )}

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(115, 138, 101, 0.2)', paddingBottom: '10px' }}>
          {['pending', 'approved', 'rejected', 'suspended', 'all'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              style={{
                padding: '6px 14px',
                background: statusFilter === tab ? 'rgba(115, 138, 101, 0.25)' : 'transparent',
                border: statusFilter === tab ? '1px solid #738a65' : '1px solid rgba(115, 138, 101, 0.15)',
                borderRadius: '4px',
                color: statusFilter === tab ? '#738a65' : '#94a192',
                fontWeight: 700,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Registrations List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {registrations.length === 0 ? (
            <div
              style={{
                padding: '40px',
                textAlign: 'center',
                color: '#667564',
                background: '#181d1a',
                border: '1px dashed rgba(115, 138, 101, 0.2)',
                borderRadius: '6px',
                fontSize: '0.8rem',
              }}
            >
              No registrations found under status filter &lsquo;{statusFilter.toUpperCase()}&rsquo;.
            </div>
          ) : (
            registrations.map((reg) => (
              <div
                key={reg.id}
                style={{
                  background: '#181d1a',
                  border: '1px solid rgba(115, 138, 101, 0.25)',
                  borderRadius: '6px',
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#e9ece9' }}>
                      {reg.badgeName}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#738a65', background: 'rgba(115, 138, 101, 0.15)', padding: '2px 6px', borderRadius: '3px' }}>
                      {reg.soldierId}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '3px',
                        textTransform: 'uppercase',
                        background:
                          reg.approvalStatus === 'approved'
                            ? 'rgba(88, 129, 87, 0.2)'
                            : reg.approvalStatus === 'pending'
                            ? 'rgba(212, 163, 115, 0.2)'
                            : 'rgba(200, 90, 83, 0.2)',
                        color:
                          reg.approvalStatus === 'approved'
                            ? '#588157'
                            : reg.approvalStatus === 'pending'
                            ? '#d4a373'
                            : '#c85a53',
                      }}
                    >
                      {reg.approvalStatus}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#94a192' }}>
                    Email: {reg.email} &bull; Regiment: {reg.regimentNo}
                  </div>

                  <div style={{ fontSize: '0.72rem', color: '#667564', marginTop: '2px' }}>
                    Height: {reg.heightCm} cm &bull; Weight: {reg.weightKg} kg &bull; Age: {reg.ageYears} yrs &bull; Submitted: {new Date(reg.submittedAt).toLocaleString()}
                  </div>

                  {reg.decisionReason && (
                    <div style={{ fontSize: '0.72rem', color: '#d4a373', fontStyle: 'italic', marginTop: '2px' }}>
                      Reason: &ldquo;{reg.decisionReason}&rdquo; (by {reg.reviewedBy})
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setActiveReg(reg)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(115, 138, 101, 0.2)',
                      border: '1px solid #738a65',
                      borderRadius: '4px',
                      color: '#e9ece9',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: 700,
                    }}
                  >
                    Review / Action
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal for Decision */}
        {activeReg && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 300,
              padding: '20px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '480px',
                background: '#181d1a',
                border: '1px solid rgba(115, 138, 101, 0.4)',
                borderRadius: '8px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1rem', color: '#e9ece9', fontWeight: 800 }}>
                DECISION FOR {activeReg.badgeName.toUpperCase()} ({activeReg.soldierId})
              </h2>

              <div style={{ fontSize: '0.75rem', color: '#94a192' }}>
                Regiment: {activeReg.regimentNo} &bull; Email: {activeReg.email}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#94a192', marginBottom: '4px' }}>
                  Assign Operational Role (if approving)
                </label>
                <select
                  value={assignedRole}
                  onChange={(e) => setAssignedRole(e.target.value as UserRole)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#161c18',
                    border: '1px solid rgba(115, 138, 101, 0.3)',
                    borderRadius: '4px',
                    color: '#e9ece9',
                    fontSize: '0.78rem',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="read_only_viewer">Read-Only Viewer (Standard Soldier)</option>
                  <option value="medical_officer">Medical Officer (Triage & Vitals Intake)</option>
                  <option value="operations_officer">Operations Officer (Incidents & SkyWatch)</option>
                  <option value="administrator">Administrator (Full Access)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#94a192', marginBottom: '4px' }}>
                  Administrative Note / Reason (Optional)
                </label>
                <textarea
                  rows={2}
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  placeholder="Record justification for audit trail..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#161c18',
                    border: '1px solid rgba(115, 138, 101, 0.3)',
                    borderRadius: '4px',
                    color: '#e9ece9',
                    fontSize: '0.75rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveReg(null)}
                  style={{
                    padding: '8px 12px',
                    background: 'transparent',
                    border: '1px solid rgba(115, 138, 101, 0.3)',
                    borderRadius: '4px',
                    color: '#94a192',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDecision('rejected')}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(200, 90, 83, 0.2)',
                    border: '1px solid #c85a53',
                    borderRadius: '4px',
                    color: '#c85a53',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 700,
                  }}
                >
                  Reject
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDecision('suspended')}
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(212, 163, 115, 0.2)',
                    border: '1px solid #d4a373',
                    borderRadius: '4px',
                    color: '#d4a373',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 700,
                  }}
                >
                  Suspend
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDecision('approved')}
                  style={{
                    padding: '8px 14px',
                    background: '#588157',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#0e1210',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 700,
                  }}
                >
                  Approve Clearance
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
