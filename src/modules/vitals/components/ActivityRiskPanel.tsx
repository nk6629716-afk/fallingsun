import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  PlusCircle,
  ShieldAlert,
  Info,
} from 'lucide-react';
import {
  SoldierProfile,
  SoldierActivity,
  ActivityRiskReview,
  ActivityType,
  ActivityIntensity,
  CreateSoldierActivityInput,
} from '@shared/types';
import { authService } from '../../../services/auth/authService';

interface ActivityRiskPanelProps {
  soldier: SoldierProfile | null;
}

export const ActivityRiskPanel: React.FC<ActivityRiskPanelProps> = ({ soldier }) => {
  const [activities, setActivities] = useState<SoldierActivity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [review, setReview] = useState<ActivityRiskReview | null>(null);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Activity Form State
  const [activityType, setActivityType] = useState<ActivityType>('marching');
  const [durationMinutes, setDurationMinutes] = useState('45');
  const [intensity, setIntensity] = useState<ActivityIntensity>('moderate');
  const [carriedLoadKg, setCarriedLoadKg] = useState('18');
  const [restRecoveryInfo, setRestRecoveryInfo] = useState('6 hours sleep, hydrated');
  const [temperatureCelsius, setTemperatureCelsius] = useState('28');
  const [humidityPct, setHumidityPct] = useState('65');
  const [terrain, setTerrain] = useState('Rough gravel incline');
  const [notes, setNotes] = useState('Standard tactical march with full kit.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentUser = authService.getUser();
  const token = authService.getToken();

  const fetchActivities = async () => {
    if (!soldier?.id) return;
    setIsLoadingActivities(true);
    try {
      const res = await fetch(`/api/activities?soldierId=${encodeURIComponent(soldier.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const list: SoldierActivity[] = json.data || [];
        setActivities(list);
        if (list.length > 0 && !selectedActivityId) {
          setSelectedActivityId(list[0].id);
        }
      }
    } catch (err: any) {
      console.warn('[ActivityRiskPanel] Fetch activities error:', err);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const fetchReview = async (activityId: string) => {
    try {
      const res = await fetch(`/api/activities/${activityId}/risk-review`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setReview(json.data);
      } else {
        setReview(null);
      }
    } catch {
      setReview(null);
    }
  };

  useEffect(() => {
    if (soldier?.id) {
      fetchActivities();
    }
  }, [soldier?.id]);

  useEffect(() => {
    if (selectedActivityId) {
      fetchReview(selectedActivityId);
    } else {
      setReview(null);
    }
  }, [selectedActivityId]);

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!soldier?.id) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: CreateSoldierActivityInput = {
        soldierId: soldier.id,
        activityType,
        durationMinutes: Number(durationMinutes),
        intensity,
        carriedLoadKg: carriedLoadKg ? Number(carriedLoadKg) : undefined,
        restRecoveryInfo: restRecoveryInfo.trim() || undefined,
        environmentalConditions: {
          temperatureCelsius: temperatureCelsius ? Number(temperatureCelsius) : undefined,
          humidityPct: humidityPct ? Number(humidityPct) : undefined,
          terrain: terrain.trim() || undefined,
        },
        notes: notes.trim() || undefined,
      };

      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Failed to record activity');
      }

      setActivities((prev) => [json.data, ...prev]);
      setSelectedActivityId(json.data.id);
      setIsFormOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Submission error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunRiskAnalysis = async () => {
    if (!selectedActivityId) return;
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/activities/${selectedActivityId}/risk-review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Risk review request failed');
      }

      setReview(json.data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Risk review error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectedActivity = activities.find((a) => a.id === selectedActivityId) || null;

  return (
    <div
      style={{
        background: 'var(--bg-card, #181d1a)',
        border: '1px solid var(--border-tactical, rgba(115, 138, 101, 0.25))',
        borderRadius: '6px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} color="var(--accent-sage, #738a65)" />
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#e9ece9' }}>
              Physical Activity & Gemini Risk Advisory
            </h3>
            <span style={{ fontSize: '0.68rem', color: '#94a192' }}>
              Advisory workload review aid &bull; Not an autonomous diagnosis or clearance
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsFormOpen((prev) => !prev)}
          style={{
            padding: '5px 10px',
            background: isFormOpen ? 'rgba(212, 163, 115, 0.2)' : 'rgba(115, 138, 101, 0.2)',
            border: isFormOpen ? '1px solid #d4a373' : '1px solid #738a65',
            borderRadius: '4px',
            color: isFormOpen ? '#d4a373' : '#738a65',
            fontSize: '0.72rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: 'inherit',
            fontWeight: 700,
          }}
        >
          <PlusCircle size={13} />
          <span>{isFormOpen ? 'Cancel Form' : 'Log Activity'}</span>
        </button>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            background: 'rgba(200, 90, 83, 0.15)',
            border: '1px solid rgba(200, 90, 83, 0.4)',
            color: '#c85a53',
            fontSize: '0.72rem',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Activity Log Form */}
      {isFormOpen && (
        <form
          onSubmit={handleCreateActivity}
          style={{
            background: '#161c18',
            border: '1px solid rgba(115, 138, 101, 0.3)',
            borderRadius: '6px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e9ece9', borderBottom: '1px solid rgba(115, 138, 101, 0.15)', paddingBottom: '4px' }}>
            Record Workload / Physical Training for {soldier?.callsign || soldier?.id}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a192', marginBottom: '2px' }}>
                Activity Type *
              </label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as ActivityType)}
                style={{ width: '100%', padding: '6px', background: '#121614', border: '1px solid rgba(115,138,101,0.3)', borderRadius: '4px', color: '#e9ece9', fontSize: '0.75rem' }}
              >
                <option value="marching">Marching</option>
                <option value="running">Running</option>
                <option value="patrol">Tactical Patrol</option>
                <option value="lifting">Weight / Equipment Lifting</option>
                <option value="calisthenics">Calisthenics / Circuit</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a192', marginBottom: '2px' }}>
                Duration (min) *
              </label>
              <input
                type="number"
                required
                min="1"
                max="1440"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                style={{ width: '100%', padding: '6px', background: '#121614', border: '1px solid rgba(115,138,101,0.3)', borderRadius: '4px', color: '#e9ece9', fontSize: '0.75rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a192', marginBottom: '2px' }}>
                Intensity *
              </label>
              <select
                value={intensity}
                onChange={(e) => setIntensity(e.target.value as ActivityIntensity)}
                style={{ width: '100%', padding: '6px', background: '#121614', border: '1px solid rgba(115,138,101,0.3)', borderRadius: '4px', color: '#e9ece9', fontSize: '0.75rem' }}
              >
                <option value="low">Low (Light recovery)</option>
                <option value="moderate">Moderate (Standard pace)</option>
                <option value="high">High (Heavy exertion)</option>
                <option value="maximum">Maximum (Sprint / Peak output)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a192', marginBottom: '2px' }}>
                Carried Load (kg)
              </label>
              <input
                type="number"
                min="0"
                max="150"
                value={carriedLoadKg}
                onChange={(e) => setCarriedLoadKg(e.target.value)}
                style={{ width: '100%', padding: '6px', background: '#121614', border: '1px solid rgba(115,138,101,0.3)', borderRadius: '4px', color: '#e9ece9', fontSize: '0.75rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a192', marginBottom: '2px' }}>
                Rest / Prior Recovery
              </label>
              <input
                type="text"
                value={restRecoveryInfo}
                onChange={(e) => setRestRecoveryInfo(e.target.value)}
                placeholder="e.g. 7h rest, full meal"
                style={{ width: '100%', padding: '6px', background: '#121614', border: '1px solid rgba(115,138,101,0.3)', borderRadius: '4px', color: '#e9ece9', fontSize: '0.75rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a192', marginBottom: '2px' }}>
                Ambient Temp (°C) / Humidity (%)
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="number"
                  placeholder="°C"
                  value={temperatureCelsius}
                  onChange={(e) => setTemperatureCelsius(e.target.value)}
                  style={{ width: '50%', padding: '6px', background: '#121614', border: '1px solid rgba(115,138,101,0.3)', borderRadius: '4px', color: '#e9ece9', fontSize: '0.75rem' }}
                />
                <input
                  type="number"
                  placeholder="%"
                  value={humidityPct}
                  onChange={(e) => setHumidityPct(e.target.value)}
                  style={{ width: '50%', padding: '6px', background: '#121614', border: '1px solid rgba(115,138,101,0.3)', borderRadius: '4px', color: '#e9ece9', fontSize: '0.75rem' }}
                />
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a192', marginBottom: '2px' }}>
              Terrain / Route Context
            </label>
            <input
              type="text"
              value={terrain}
              onChange={(e) => setTerrain(e.target.value)}
              placeholder="e.g. Mountain path, loose gravel"
              style={{ width: '100%', padding: '6px', background: '#121614', border: '1px solid rgba(115,138,101,0.3)', borderRadius: '4px', color: '#e9ece9', fontSize: '0.75rem' }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              marginTop: '4px',
              padding: '8px',
              background: '#738a65',
              border: 'none',
              borderRadius: '4px',
              color: '#0e1210',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: isSubmitting ? 'wait' : 'pointer',
            }}
          >
            {isSubmitting ? 'Saving Activity...' : 'Save Activity Entry'}
          </button>
        </form>
      )}

      {/* Main split: activity selection vs risk advisory panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        {/* Left: Activities List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.72rem', color: '#94a192', fontWeight: 600 }}>
            Activity Logs ({activities.length})
          </div>

          {activities.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#667564', border: '1px dashed rgba(115, 138, 101, 0.2)', borderRadius: '4px', fontSize: '0.72rem' }}>
              No activities logged for this soldier yet. Click &lsquo;Log Activity&rsquo; above.
            </div>
          ) : (
            activities.map((act) => {
              const isSelected = act.id === selectedActivityId;
              return (
                <div
                  key={act.id}
                  onClick={() => setSelectedActivityId(act.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '4px',
                    background: isSelected ? 'rgba(115, 138, 101, 0.2)' : '#161c18',
                    border: isSelected ? '1px solid #738a65' : '1px solid rgba(115, 138, 101, 0.15)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.78rem', color: isSelected ? '#738a65' : '#e9ece9', textTransform: 'capitalize' }}>
                      {act.activityType} &bull; {act.durationMinutes}m
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#94a192' }}>
                      {act.intensity.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#667564' }}>
                    Load: {act.carriedLoadKg ?? 0}kg &bull; {new Date(act.recordedAt).toLocaleTimeString()}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: AI Advisory Panel */}
        <div
          style={{
            background: '#161c18',
            border: '1px solid rgba(115, 138, 101, 0.2)',
            borderRadius: '6px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a192', fontWeight: 700 }}>
              Advisory Evaluation
            </span>

            {selectedActivity && (
              <button
                type="button"
                onClick={handleRunRiskAnalysis}
                disabled={isAnalyzing}
                style={{
                  padding: '4px 10px',
                  background: 'rgba(115, 138, 101, 0.25)',
                  border: '1px solid #738a65',
                  borderRadius: '4px',
                  color: '#738a65',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: isAnalyzing ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontFamily: 'inherit',
                }}
              >
                <Sparkles size={11} className={isAnalyzing ? 'animate-spin' : ''} />
                <span>{isAnalyzing ? 'Analyzing with Gemini...' : 'Analyze Activity'}</span>
              </button>
            )}
          </div>

          {review ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.75rem' }}>
              {/* Status Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '3px',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background:
                      review.status === 'no_specific_concern_identified'
                        ? 'rgba(88, 129, 87, 0.25)'
                        : review.status === 'needs_review'
                        ? 'rgba(212, 163, 115, 0.25)'
                        : 'rgba(100, 116, 139, 0.25)',
                    color:
                      review.status === 'no_specific_concern_identified'
                        ? '#588157'
                        : review.status === 'needs_review'
                        ? '#d4a373'
                        : '#94a192',
                    border:
                      review.status === 'no_specific_concern_identified'
                        ? '1px solid #588157'
                        : review.status === 'needs_review'
                        ? '1px solid #d4a373'
                        : '1px solid #94a192',
                  }}
                >
                  {review.status.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: '0.65rem', color: '#667564' }}>
                  Model: {review.modelIdentifier} &bull; {new Date(review.generatedAt).toLocaleTimeString()}
                </span>
              </div>

              {/* Summary */}
              <div style={{ color: '#e9ece9', lineHeight: 1.4 }}>
                {review.summary}
              </div>

              {/* Concerns grounded in evidence */}
              {review.concerns.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#d4a373', fontWeight: 700, marginBottom: '4px' }}>
                    Observations For Human Review:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {review.concerns.map((c, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(212, 163, 115, 0.1)',
                          borderLeft: '2px solid #d4a373',
                          padding: '4px 8px',
                          borderRadius: '0 4px 4px 0',
                        }}
                      >
                        <div style={{ color: '#e9ece9' }}>{c.description}</div>
                        {c.evidenceFieldIds.length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                            {c.evidenceFieldIds.map((id) => (
                              <span
                                key={id}
                                style={{
                                  fontSize: '0.6rem',
                                  padding: '1px 4px',
                                  background: 'rgba(115, 138, 101, 0.2)',
                                  borderRadius: '2px',
                                  color: '#738a65',
                                }}
                              >
                                {id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing inputs */}
              {review.missingInputs.length > 0 && (
                <div style={{ fontSize: '0.68rem', color: '#94a192' }}>
                  <span style={{ fontWeight: 700 }}>Uncertainty / Missing Inputs:</span>{' '}
                  {review.missingInputs.join(', ')}
                </div>
              )}

              {/* Suggested next steps */}
              {review.suggestedNextSteps.length > 0 && (
                <div style={{ fontSize: '0.68rem', color: '#94a192' }}>
                  <span style={{ fontWeight: 700 }}>Suggested Follow-up:</span>
                  <ul style={{ margin: '2px 0 0 0', paddingLeft: '16px' }}>
                    {review.suggestedNextSteps.map((step, sIdx) => (
                      <li key={sIdx}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Disclaimer */}
              <div
                style={{
                  fontSize: '0.62rem',
                  color: '#667564',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: '6px',
                  fontStyle: 'italic',
                }}
              >
                Limitation: {review.limitations.join(' ')}
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: '#667564', fontSize: '0.72rem' }}>
              {selectedActivity
                ? 'Select "Analyze Activity" to generate an advisory review for this session.'
                : 'Select an activity log from the left to view or run advisory assessment.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
