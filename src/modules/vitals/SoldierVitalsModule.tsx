import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Heart,
  Thermometer,
  Wind,
  ShieldCheck,
  Search,
  PlusCircle,
  Clock,
  UserCheck,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { SoldierProfile, SoldierVitalsRecord, CreateSoldierVitalsInput } from '@shared/types';
import { api } from '../../services/api/apiClient';
import { authService } from '../../services/auth/authService';

export const SoldierVitalsModule: React.FC = () => {
  const [soldiers, setSoldiers] = useState<SoldierProfile[]>([]);
  const [selectedSoldierId, setSelectedSoldierId] = useState<string>('SOL-001');
  const [vitalsHistory, setVitalsHistory] = useState<SoldierVitalsRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State initialized to match the detected operational anomaly
  const [heartRate, setHeartRate] = useState<string>('136');
  const [bpSystolic, setBpSystolic] = useState<string>('88');
  const [bpDiastolic, setBpDiastolic] = useState<string>('54');
  const [temperature, setTemperature] = useState<string>('37.8');
  const [oxygenSaturation, setOxygenSaturation] = useState<string>('88');
  const [respiratoryRate, setRespiratoryRate] = useState<string>('34');
  const [clinicalNotes, setClinicalNotes] = useState<string>(
    'SpO2 dropped to 88% and RR increased to 34/min. Triage level escalated to Immediate (Red).'
  );

  // Role permissions
  const currentUser = authService.getUser();
  const canRecordVitals = authService.hasRole(['administrator', 'medical_officer']);

  // Load soldiers roster
  const loadSoldiers = async () => {
    setIsLoading(true);
    try {
      const roster = await api.getSoldiers();
      setSoldiers(roster);
      if (roster.length > 0 && !roster.some((s) => s.id === selectedSoldierId)) {
        setSelectedSoldierId(roster[0].id);
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to load soldiers' });
    } finally {
      setIsLoading(false);
    }
  };

  // Load vitals history for selected soldier
  const loadVitalsHistory = async (soldierId: string) => {
    try {
      const records = await api.getSoldierVitals(soldierId);
      setVitalsHistory(records);
      if (records.length > 0) {
        const latest = records[0];
        if (latest.heartRateBpm) setHeartRate(String(latest.heartRateBpm));
        if (latest.bloodPressureSystolic) setBpSystolic(String(latest.bloodPressureSystolic));
        if (latest.bloodPressureDiastolic) setBpDiastolic(String(latest.bloodPressureDiastolic));
        if (latest.temperatureCelsius) setTemperature(String(latest.temperatureCelsius));
        if (latest.oxygenSaturationPct) setOxygenSaturation(String(latest.oxygenSaturationPct));
        if (latest.respiratoryRateBpm) setRespiratoryRate(String(latest.respiratoryRateBpm));
        if (latest.clinicalNotes) setClinicalNotes(latest.clinicalNotes);
      }
    } catch (err: any) {
      console.warn('[SoldierVitals] History fetch error:', err);
    }
  };

  useEffect(() => {
    loadSoldiers();
  }, []);

  useEffect(() => {
    if (selectedSoldierId) {
      loadVitalsHistory(selectedSoldierId);
    }
  }, [selectedSoldierId]);

  const filteredSoldiers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return soldiers;
    return soldiers.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.callsign.toLowerCase().includes(q) ||
        s.unit.toLowerCase().includes(q)
    );
  }, [soldiers, searchQuery]);

  const selectedSoldier = useMemo(
    () => soldiers.find((s) => s.id === selectedSoldierId) || null,
    [soldiers, selectedSoldierId]
  );

  const handleSubmitVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSoldierId) return;

    if (!canRecordVitals) {
      setFeedbackMessage({
        type: 'error',
        text: 'Access Denied: Requires Medical Officer or Administrator role clearance.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMessage(null);

    try {
      const payload: CreateSoldierVitalsInput = {
        soldierId: selectedSoldierId,
        heartRateBpm: heartRate ? Number(heartRate) : undefined,
        bloodPressureSystolic: bpSystolic ? Number(bpSystolic) : undefined,
        bloodPressureDiastolic: bpDiastolic ? Number(bpDiastolic) : undefined,
        temperatureCelsius: temperature ? Number(temperature) : undefined,
        oxygenSaturationPct: oxygenSaturation ? Number(oxygenSaturation) : undefined,
        respiratoryRateBpm: respiratoryRate ? Number(respiratoryRate) : undefined,
        clinicalNotes: clinicalNotes.trim() || undefined,
        timestamp: new Date().toISOString(),
      };

      const saved = await api.recordSoldierVitals(payload);
      setVitalsHistory((prev) => [saved, ...prev]);
      setFeedbackMessage({
        type: 'success',
        text: `Vitals recorded for ${selectedSoldier?.callsign || selectedSoldierId} at ${new Date().toLocaleTimeString()}.`,
      });
      setClinicalNotes('');
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Failed to submit vitals measurement.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="tactical-grid-bg tactical-scanlines"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '16px 20px',
        minHeight: '100%',
        backgroundColor: 'var(--bg-canvas, #121614)',
        color: 'var(--text-primary, #e9ece9)',
        overflowY: 'auto',
      }}
    >
      {/* 1. Header Banner */}
      <div
        style={{
          background: 'var(--bg-card, #181d1a)',
          border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
          borderRadius: 'var(--radius-sm, 6px)',
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={20} color="var(--accent-sage, #738a65)" />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', letterSpacing: '-0.01em', fontFamily: 'var(--font-heading)' }}>
                Soldier Vitals & Health Monitoring
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a192)', fontFamily: 'var(--font-mono)' }}>
                Operational physiological tracking and historical health telemetry
              </span>
            </div>
          </div>

          {/* Active Clearance Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '4px 10px',
                borderRadius: '4px',
                border: canRecordVitals ? '1px solid rgba(88, 129, 87, 0.4)' : '1px solid rgba(212, 163, 115, 0.4)',
                background: canRecordVitals ? 'rgba(88, 129, 87, 0.2)' : 'rgba(212, 163, 115, 0.2)',
                color: canRecordVitals ? 'var(--status-safe, #588157)' : 'var(--status-warning, #d4a373)',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {canRecordVitals ? <UserCheck size={13} /> : <Lock size={13} />}
              {canRecordVitals ? 'MEDICAL CLEARANCE ACTIVE' : 'READ-ONLY VIEWER'}
            </span>

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                loadSoldiers();
                if (selectedSoldierId) loadVitalsHistory(selectedSoldierId);
              }}
              style={{
                background: 'var(--bg-control, #161c18)',
                border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                color: 'var(--text-secondary, #94a192)',
                borderRadius: '4px',
                padding: '5px 10px',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontFamily: 'var(--font-mono)',
              }}
              title="Refresh soldier roster and history"
            >
              <RefreshCw size={12} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Feedback Banners */}
      {feedbackMessage && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '6px',
            fontSize: '0.78rem',
            fontWeight: 600,
            border: feedbackMessage.type === 'success' ? '1px solid rgba(88, 129, 87, 0.4)' : '1px solid rgba(200, 90, 83, 0.4)',
            background: feedbackMessage.type === 'success' ? 'rgba(88, 129, 87, 0.2)' : 'rgba(200, 90, 83, 0.2)',
            color: feedbackMessage.type === 'success' ? 'var(--status-safe, #588157)' : 'var(--status-critical, #c85a53)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {feedbackMessage.text}
        </div>
      )}

      {/* 3. Main Split View: Left Roster / Center History / Right Entry Form */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          alignItems: 'start',
        }}
        className="vitals-grid-layout"
      >
        {/* Column A: Permitted Soldier Roster */}
        <div
          style={{
            background: 'var(--bg-card, #181d1a)',
            border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-primary, #e9ece9)', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
              Personnel Roster
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #667564)', fontFamily: 'var(--font-mono)' }}>
              {filteredSoldiers.length} units
            </span>
          </div>

          {/* Search box */}
          <div style={{ position: 'relative' }}>
            <Search size={13} color="var(--text-muted, #667564)" style={{ position: 'absolute', left: '10px', top: '9px' }} />
            <input
              type="text"
              placeholder="Search callsign / ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                background: 'var(--bg-control, #161c18)',
                border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                borderRadius: '4px',
                color: 'var(--text-primary, #e9ece9)',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '520px', overflowY: 'auto' }}>
            {filteredSoldiers.map((soldier) => {
              const isSelected = soldier.id === selectedSoldierId;
              return (
                <div
                  key={soldier.id}
                  onClick={() => setSelectedSoldierId(soldier.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    background: isSelected ? 'var(--bg-elevated, #1f2622)' : 'transparent',
                    border: isSelected ? '1px solid var(--accent-sage, #738a65)' : '1px solid var(--border-card, rgba(115, 138, 101, 0.12))',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.82rem', color: isSelected ? 'var(--accent-sage, #738a65)' : 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-mono)' }}>
                      {soldier.callsign}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #667564)', fontFamily: 'var(--font-mono)' }}>{soldier.id}</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #94a192)', marginTop: '2px' }}>{soldier.unit}</div>
                  <div style={{ marginTop: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background:
                          soldier.status === 'active'
                            ? 'rgba(88, 129, 87, 0.2)'
                            : soldier.status === 'in_transit'
                            ? 'rgba(212, 163, 115, 0.2)'
                            : 'rgba(100, 116, 139, 0.2)',
                        color:
                          soldier.status === 'active'
                            ? 'var(--status-safe, #588157)'
                            : soldier.status === 'in_transit'
                            ? 'var(--status-warning, #d4a373)'
                            : 'var(--text-muted, #667564)',
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {soldier.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column B: Selected Soldier Physiological Telemetry & History */}
        <div
          style={{
            background: 'var(--bg-card, #181d1a)',
            border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {selectedSoldier ? (
            <>
              {/* Profile Card */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border-card, rgba(115, 138, 101, 0.15))',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary, #e9ece9)', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
                    {selectedSoldier.callsign}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a192)', fontFamily: 'var(--font-mono)' }}>
                    {selectedSoldier.id} &bull; {selectedSoldier.unit}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted, #667564)', fontFamily: 'var(--font-mono)' }}>Readings Count</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-sage, #738a65)', fontFamily: 'var(--font-mono)' }}>
                    {vitalsHistory.length} Recorded
                  </div>
                </div>
              </div>

              {/* Latest Quick Vitals Bar (if records exist) */}
              {vitalsHistory.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                    gap: '8px',
                  }}
                >
                  <div style={{ background: 'var(--bg-elevated, #1f2622)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-grid, rgba(115, 138, 101, 0.15))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--status-critical, #c85a53)', fontFamily: 'var(--font-mono)' }}>
                      <Heart size={12} /> Heart Rate
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                      {vitalsHistory[0].heartRateBpm ?? '--'} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #667564)' }}>BPM</span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-elevated, #1f2622)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-grid, rgba(115, 138, 101, 0.15))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--accent-sage, #738a65)', fontFamily: 'var(--font-mono)' }}>
                      <Activity size={12} /> Blood Pressure
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                      {vitalsHistory[0].bloodPressureSystolic ?? '--'}/{vitalsHistory[0].bloodPressureDiastolic ?? '--'}{' '}
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #667564)' }}>mmHg</span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-elevated, #1f2622)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-grid, rgba(115, 138, 101, 0.15))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--status-warning, #d4a373)', fontFamily: 'var(--font-mono)' }}>
                      <Thermometer size={12} /> Temp
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                      {vitalsHistory[0].temperatureCelsius ?? '--'} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #667564)' }}>°C</span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-elevated, #1f2622)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-grid, rgba(115, 138, 101, 0.15))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--status-safe, #588157)', fontFamily: 'var(--font-mono)' }}>
                      <Wind size={12} /> SpO₂
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                      {vitalsHistory[0].oxygenSaturationPct ?? '--'} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #667564)' }}>%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* History Timeline */}
              <div style={{ marginTop: '8px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'var(--text-primary, #e9ece9)', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                  Measurement History & Clinical Timeline
                </h4>

                {vitalsHistory.length === 0 ? (
                  <div
                    style={{
                      padding: '30px',
                      textAlign: 'center',
                      color: 'var(--text-muted, #667564)',
                      border: '1px dashed var(--border-card, rgba(115, 138, 101, 0.20))',
                      borderRadius: '4px',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    No physiological measurement logs on file for this soldier. Use the intake form to record baseline vitals.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                    {vitalsHistory.map((rec) => (
                      <div
                        key={rec.id}
                        style={{
                          background: 'var(--bg-elevated, #1f2622)',
                          border: '1px solid var(--border-card, rgba(115, 138, 101, 0.15))',
                          borderRadius: '4px',
                          padding: '10px 14px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-sage, #738a65)', fontFamily: 'var(--font-mono)' }}>{rec.id}</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #667564)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)' }}>
                            <Clock size={11} />
                            {new Date(rec.timestamp).toLocaleString()}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '14px', marginTop: '6px', flexWrap: 'wrap', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                          {rec.heartRateBpm && (
                            <span style={{ color: 'var(--text-primary, #e9ece9)' }}>
                              HR: <strong>{rec.heartRateBpm}</strong> bpm
                            </span>
                          )}
                          {rec.bloodPressureSystolic && rec.bloodPressureDiastolic && (
                            <span style={{ color: 'var(--text-primary, #e9ece9)' }}>
                              BP: <strong>{rec.bloodPressureSystolic}/{rec.bloodPressureDiastolic}</strong> mmHg
                            </span>
                          )}
                          {rec.temperatureCelsius && (
                            <span style={{ color: 'var(--text-primary, #e9ece9)' }}>
                              Temp: <strong>{rec.temperatureCelsius}</strong> °C
                            </span>
                          )}
                          {rec.oxygenSaturationPct && (
                            <span style={{ color: 'var(--text-primary, #e9ece9)' }}>
                              SpO₂: <strong>{rec.oxygenSaturationPct}%</strong>
                            </span>
                          )}
                          {rec.respiratoryRateBpm && (
                            <span style={{ color: 'var(--text-primary, #e9ece9)' }}>
                              RR: <strong>{rec.respiratoryRateBpm}</strong> br/m
                            </span>
                          )}
                        </div>

                        {rec.clinicalNotes && (
                          <div style={{ marginTop: '6px', fontSize: '0.72rem', color: 'var(--text-secondary, #94a192)', fontStyle: 'italic' }}>
                            &ldquo;{rec.clinicalNotes}&rdquo;
                          </div>
                        )}

                        <div style={{ marginTop: '4px', fontSize: '0.65rem', color: 'var(--text-muted, #667564)', fontFamily: 'var(--font-mono)' }}>
                          Recorded By: {rec.recordedBy}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted, #667564)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
              Select a soldier from the roster
            </div>
          )}
        </div>

        {/* Column C: Validated Entry Form */}
        <div
          style={{
            background: 'var(--bg-card, #181d1a)',
            border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlusCircle size={16} color="var(--accent-sage, #738a65)" />
            <h3 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-primary, #e9ece9)', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
              Record Vitals Intake
            </h3>
          </div>

          {!canRecordVitals ? (
            <div
              style={{
                padding: '14px',
                background: 'rgba(212, 163, 115, 0.15)',
                border: '1px solid rgba(212, 163, 115, 0.35)',
                borderRadius: '4px',
                fontSize: '0.75rem',
                color: 'var(--status-warning, #d4a373)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Lock size={15} style={{ marginBottom: '6px' }} />
              <div>
                <strong>Read-Only Access:</strong> You are currently authenticated as <em>{currentUser?.role || 'Viewer'}</em>.
                Recording new physiological measurements requires <strong>Medical Officer</strong> or <strong>Administrator</strong> clearance.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitVitals} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                  Target Soldier
                </label>
                <select
                  value={selectedSoldierId}
                  onChange={(e) => setSelectedSoldierId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'var(--bg-control, #161c18)',
                    border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                    borderRadius: '4px',
                    color: 'var(--text-primary, #e9ece9)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {soldiers.map((s) => (
                    <option key={s.id} value={s.id} style={{ background: '#161c18', color: '#e9ece9' }}>
                      {s.callsign} ({s.id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                    Heart Rate (BPM)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="250"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: 'var(--bg-control, #161c18)',
                      border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                      borderRadius: '4px',
                      color: 'var(--text-primary, #e9ece9)',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                    SpO₂ Saturation (%)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={oxygenSaturation}
                    onChange={(e) => setOxygenSaturation(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: 'var(--bg-control, #161c18)',
                      border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                      borderRadius: '4px',
                      color: 'var(--text-primary, #e9ece9)',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                    BP Systolic (mmHg)
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="260"
                    value={bpSystolic}
                    onChange={(e) => setBpSystolic(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: 'var(--bg-control, #161c18)',
                      border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                      borderRadius: '4px',
                      color: 'var(--text-primary, #e9ece9)',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                    BP Diastolic (mmHg)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="160"
                    value={bpDiastolic}
                    onChange={(e) => setBpDiastolic(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: 'var(--bg-control, #161c18)',
                      border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                      borderRadius: '4px',
                      color: 'var(--text-primary, #e9ece9)',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                    Body Temp (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="30"
                    max="45"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: 'var(--bg-control, #161c18)',
                      border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                      borderRadius: '4px',
                      color: 'var(--text-primary, #e9ece9)',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                    Resp Rate (br/min)
                  </label>
                  <input
                    type="number"
                    min="4"
                    max="60"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: 'var(--bg-control, #161c18)',
                      border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                      borderRadius: '4px',
                      color: 'var(--text-primary, #e9ece9)',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                  Clinical Assessment / Notes
                </label>
                <textarea
                  rows={3}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="Record objective observations..."
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: 'var(--bg-control, #161c18)',
                    border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))',
                    borderRadius: '4px',
                    color: 'var(--text-primary, #e9ece9)',
                    fontSize: '0.75rem',
                    resize: 'vertical',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  marginTop: '6px',
                  padding: '8px 12px',
                  background: isSubmitting ? 'var(--bg-control, #161c18)' : 'var(--accent-sage, #738a65)',
                  color: isSubmitting ? 'var(--text-muted, #667564)' : '#0e1210',
                  border: isSubmitting ? '1px solid var(--border-tactical, rgba(115, 138, 101, 0.20))' : 'none',
                  borderRadius: '4px',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: isSubmitting ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontFamily: 'var(--font-mono)',
                  transition: 'opacity 0.15s ease',
                }}
              >
                <ShieldCheck size={14} />
                <span>{isSubmitting ? 'Submitting to Supabase...' : 'Save Vitals Entry'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
