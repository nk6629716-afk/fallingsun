import React, { useState } from 'react';
import {
  ExtendedCasualtyRecord,
  MediRouteSubTab,
} from '../medirouteTypes';
import { TriageCategory } from '@shared/types';
import {
  Stethoscope,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCw,
  Edit3,
  Search,
  X,
} from 'lucide-react';
import { calculateStartTriage } from '../MediRouteModule';

interface TriageBoardTabProps {
  casualties: ExtendedCasualtyRecord[];
  onUpdateTriage: (
    casualtyId: string,
    category: TriageCategory,
    overrideReason: string,
    isManualOverride: boolean
  ) => void;
  onNavigateTab?: (tab: MediRouteSubTab, targetId?: string) => void;
}

export const TriageBoardTab: React.FC<TriageBoardTabProps> = ({
  casualties,
  onUpdateTriage,
  onNavigateTab,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedCasualtyForOverride, setSelectedCasualtyForOverride] =
    useState<ExtendedCasualtyRecord | null>(null);
  const [overrideCategory, setOverrideCategory] = useState<TriageCategory>('immediate');
  const [overrideReason, setOverrideReason] = useState('');

  // Group casualties by triage category
  const immediateCasualties = casualties.filter((c) => c.triageCategory === 'immediate');
  const delayedCasualties = casualties.filter((c) => c.triageCategory === 'delayed');
  const minimalCasualties = casualties.filter((c) => c.triageCategory === 'minimal');
  const expectantCasualties = casualties.filter((c) => c.triageCategory === 'expectant');

  const filteredCasualties = (list: ExtendedCasualtyRecord[]) => {
    if (!filterQuery) return list;
    const q = filterQuery.toLowerCase();
    return list.filter(
      (c) =>
        c.patientCode?.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.triageReason?.toLowerCase().includes(q) ||
        c.location?.name?.toLowerCase().includes(q)
    );
  };

  const handleOpenOverride = (casualty: ExtendedCasualtyRecord) => {
    setSelectedCasualtyForOverride(casualty);
    setOverrideCategory(casualty.triageCategory || 'delayed');
    setOverrideReason(`Clinical re-assessment by field medic: vitals reviewed.`);
  };

  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCasualtyForOverride) return;
    onUpdateTriage(
      selectedCasualtyForOverride.id,
      overrideCategory,
      overrideReason,
      true
    );
    setSelectedCasualtyForOverride(null);
  };

  const handleRunAutoReevaluation = (casualty: ExtendedCasualtyRecord) => {
    const rawMental = casualty.vitals?.mentalStatus;
    const normalizedMental: 'can_follow_commands' | 'unresponsive' | 'altered' =
      rawMental === 'alert' || rawMental === 'can_follow_commands'
        ? 'can_follow_commands'
        : rawMental === 'unresponsive'
        ? 'unresponsive'
        : 'altered';

    // Re-run START evaluation based on latest vitals
    const result = calculateStartTriage({
      canWalk: casualty.vitals?.canWalk ?? casualty.canWalk ?? false,
      respiratoryRate: casualty.vitals?.respiratoryRate ?? casualty.respiratoryRate ?? 20,
      radialPulsePresent: casualty.vitals?.radialPulsePresent ?? casualty.radialPulsePresent ?? true,
      mentalStatus: normalizedMental,
      severeBleedingControlled: casualty.vitals?.severeBleedingControlled ?? true,
    });

    onUpdateTriage(casualty.id, result.category, result.reason, false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '10px 16px',
          background: 'var(--bg-card, #181d1a)',
          border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
          borderRadius: 'var(--radius-sm, 6px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Stethoscope size={17} color="var(--accent-sage, #738a65)" />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-heading)' }}>
            Automated Triage Board (START / SALT Protocol)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} color="var(--text-muted, #667564)" style={{ position: 'absolute', left: '8px', top: '7px' }} />
            <input
              type="text"
              placeholder="Search casualty..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                padding: '4px 10px 4px 26px',
                fontSize: '0.72rem',
                background: 'var(--bg-control, #161c18)',
                border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                borderRadius: '4px',
                color: 'var(--text-primary, #e9ece9)',
                outline: 'none',
                width: '160px',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
        </div>
      </div>

      {/* 4-Column Triage Board */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '14px',
        }}
      >
        {/* RED: Immediate */}
        <div
          style={{
            background: 'var(--bg-card, #181d1a)',
            borderTop: '3px solid var(--status-critical, #c85a53)',
            border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderTopWidth: '3px',
            borderRadius: 'var(--radius-sm, 6px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border-grid, rgba(115, 138, 101, 0.12))',
              background: 'rgba(200, 90, 83, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--status-critical, #c85a53)', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
                RED &bull; IMMEDIATE
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #94a192)' }}>
                Life-threatening; immediate care
              </div>
            </div>
            <span
              style={{
                fontSize: '1.1rem',
                fontWeight: 800,
                color: 'var(--text-primary, #e9ece9)',
                fontFamily: 'var(--font-mono)',
                background: 'rgba(200, 90, 83, 0.2)',
                padding: '2px 8px',
                borderRadius: '3px',
              }}
            >
              {immediateCasualties.length}
            </span>
          </div>

          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: '300px' }}>
            {filteredCasualties(immediateCasualties).map((casualty) => (
              <CasualtyTriageCard
                key={casualty.id}
                casualty={casualty}
                onOpenOverride={handleOpenOverride}
                onReevaluate={handleRunAutoReevaluation}
                categoryColor="var(--status-critical, #c85a53)"
              />
            ))}
            {filteredCasualties(immediateCasualties).length === 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #667564)', textAlign: 'center', padding: '24px 8px' }}>
                No casualties currently in Immediate category.
              </div>
            )}
          </div>
        </div>

        {/* YELLOW: Delayed */}
        <div
          style={{
            background: 'var(--bg-card, #181d1a)',
            borderTop: '3px solid var(--status-warning, #d4a373)',
            border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderTopWidth: '3px',
            borderRadius: 'var(--radius-sm, 6px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border-grid, rgba(115, 138, 101, 0.12))',
              background: 'rgba(212, 163, 115, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--status-warning, #d4a373)', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
                YELLOW &bull; DELAYED
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #94a192)' }}>
                Serious trauma; non-ambulatory
              </div>
            </div>
            <span
              style={{
                fontSize: '1.1rem',
                fontWeight: 800,
                color: 'var(--text-primary, #e9ece9)',
                fontFamily: 'var(--font-mono)',
                background: 'rgba(212, 163, 115, 0.2)',
                padding: '2px 8px',
                borderRadius: '3px',
              }}
            >
              {delayedCasualties.length}
            </span>
          </div>

          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: '300px' }}>
            {filteredCasualties(delayedCasualties).map((casualty) => (
              <CasualtyTriageCard
                key={casualty.id}
                casualty={casualty}
                onOpenOverride={handleOpenOverride}
                onReevaluate={handleRunAutoReevaluation}
                categoryColor="var(--status-warning, #d4a373)"
              />
            ))}
            {filteredCasualties(delayedCasualties).length === 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #667564)', textAlign: 'center', padding: '24px 8px' }}>
                No casualties currently in Delayed category.
              </div>
            )}
          </div>
        </div>

        {/* GREEN: Minimal */}
        <div
          style={{
            background: 'var(--bg-card, #181d1a)',
            borderTop: '3px solid var(--status-safe, #588157)',
            border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderTopWidth: '3px',
            borderRadius: 'var(--radius-sm, 6px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border-grid, rgba(115, 138, 101, 0.12))',
              background: 'rgba(88, 129, 87, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--status-safe, #588157)', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
                GREEN &bull; MINIMAL
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary, #94a192)' }}>
                Walking wounded; minor injury
              </div>
            </div>
            <span
              style={{
                fontSize: '1.1rem',
                fontWeight: 800,
                color: 'var(--text-primary, #e9ece9)',
                fontFamily: 'var(--font-mono)',
                background: 'rgba(88, 129, 87, 0.2)',
                padding: '2px 8px',
                borderRadius: '3px',
              }}
            >
              {minimalCasualties.length}
            </span>
          </div>

          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: '300px' }}>
            {filteredCasualties(minimalCasualties).map((casualty) => (
              <CasualtyTriageCard
                key={casualty.id}
                casualty={casualty}
                onOpenOverride={handleOpenOverride}
                onReevaluate={handleRunAutoReevaluation}
                categoryColor="var(--status-safe, #588157)"
              />
            ))}
            {filteredCasualties(minimalCasualties).length === 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #667564)', textAlign: 'center', padding: '24px 8px' }}>
                No casualties currently in Minimal category.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Operator Manual Override Modal */}
      {selectedCasualtyForOverride && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-card, #181d1a)',
              border: '1px solid var(--accent-sage, #738a65)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '20px',
              width: '100%',
              maxWidth: '480px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={16} color="var(--accent-sage, #738a65)" />
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-heading)' }}>
                  Operator Triage Override
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setSelectedCasualtyForOverride(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary, #94a192)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #94a192)', fontFamily: 'var(--font-mono)' }}>
              Subject: <strong style={{ color: 'var(--text-primary, #e9ece9)' }}>{selectedCasualtyForOverride.patientCode || selectedCasualtyForOverride.id}</strong> &bull; Current: {selectedCasualtyForOverride.triageCategory}
            </div>

            <form onSubmit={handleSaveOverride} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary, #94a192)', display: 'block', marginBottom: '6px' }}>
                  Target Triage Priority
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {(['immediate', 'delayed', 'minimal'] as TriageCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setOverrideCategory(cat)}
                      style={{
                        padding: '8px 4px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        borderRadius: '3px',
                        border: overrideCategory === cat ? '2px solid var(--accent-sage, #738a65)' : '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                        background:
                          cat === 'immediate'
                            ? 'rgba(200, 90, 83, 0.25)'
                            : cat === 'delayed'
                            ? 'rgba(212, 163, 115, 0.25)'
                            : 'rgba(88, 129, 87, 0.25)',
                        color: 'var(--text-primary, #e9ece9)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary, #94a192)', display: 'block', marginBottom: '6px' }}>
                  Clinical Justification & Audit Trail Note
                </label>
                <textarea
                  rows={3}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="State the observed physiological reason for manual re-classification..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '0.72rem',
                    background: 'var(--bg-control, #161c18)',
                    border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                    borderRadius: '4px',
                    color: 'var(--text-primary, #e9ece9)',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setSelectedCasualtyForOverride(null)}
                  style={{ background: 'var(--bg-control, #161c18)', color: 'var(--text-secondary, #94a192)', border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm"
                  style={{ background: 'var(--accent-sage, #738a65)', color: '#000', fontWeight: 700, border: 'none', fontFamily: 'var(--font-mono)' }}
                >
                  Confirm Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

interface CasualtyTriageCardProps {
  casualty: ExtendedCasualtyRecord;
  onOpenOverride: (casualty: ExtendedCasualtyRecord) => void;
  onReevaluate: (casualty: ExtendedCasualtyRecord) => void;
  categoryColor: string;
}

const CasualtyTriageCard: React.FC<CasualtyTriageCardProps> = ({
  casualty,
  onOpenOverride,
  onReevaluate,
  categoryColor,
}) => {
  return (
    <div
      style={{
        background: 'var(--bg-elevated, #1f2622)',
        border: '1px solid var(--border-grid, rgba(115, 138, 101, 0.12))',
        borderRadius: '4px',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-mono)' }}>
            {casualty.patientCode || casualty.id}
          </div>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary, #94a192)' }}>
            {casualty.location?.name || 'Field Sector'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onReevaluate(casualty)}
            title="Re-run START algorithm evaluation against latest vitals"
            style={{
              padding: '2px 6px',
              fontSize: '0.65rem',
              background: 'rgba(115, 138, 101, 0.15)',
              color: 'var(--accent-sage, #738a65)',
              border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.25))',
            }}
          >
            <RotateCw size={11} />
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onOpenOverride(casualty)}
            title="Manual operator override of triage classification"
            style={{
              padding: '2px 6px',
              fontSize: '0.65rem',
              background: 'var(--bg-control, #161c18)',
              color: 'var(--text-secondary, #94a192)',
              border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
            }}
          >
            <Edit3 size={11} />
          </button>
        </div>
      </div>

      {/* Vitals Snapshot */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '4px 6px',
          borderRadius: '3px',
          fontSize: '0.65rem',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div>
          <span style={{ color: 'var(--text-muted, #667564)' }}>HR: </span>
          <span style={{ color: 'var(--text-primary, #e9ece9)' }}>{casualty.heartRate ?? casualty.vitals?.respiratoryRate ?? '--'}</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted, #667564)' }}>SpO₂: </span>
          <span style={{ color: 'var(--text-primary, #e9ece9)' }}>{casualty.spo2 ?? '--'}%</span>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted, #667564)' }}>RR: </span>
          <span style={{ color: 'var(--text-primary, #e9ece9)' }}>{casualty.respiratoryRate ?? casualty.vitals?.respiratoryRate ?? '--'}</span>
        </div>
      </div>

      {/* Algorithmic Reason */}
      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #94a192)', lineHeight: 1.3 }}>
        {casualty.triageReason}
      </div>

      {/* Rule & Audit stamp */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', color: 'var(--text-muted, #667564)', fontFamily: 'var(--font-mono)' }}>
        <span>Rule: {casualty.ruleVersion || 'START-v1.4'}</span>
        <span>{new Date(casualty.updatedAt || casualty.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
};
