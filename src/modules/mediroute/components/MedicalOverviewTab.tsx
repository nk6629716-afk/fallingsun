import React from 'react';
import {
  MedicalFacility,
  TransportUnit,
  ExtendedCasualtyRecord,
  EvacuationTask,
  MedicalActivityItem,
  MediRouteSubTab,
} from '../medirouteTypes';
import { RoadHazardEdge } from '@shared/types';
import {
  HeartPulse,
  AlertTriangle,
  Users,
  Building2,
  Ambulance,
  Route as RouteIcon,
  CheckCircle2,
  Clock,
  ArrowRight,
  Activity,
  Plane,
  AlertCircle,
  Stethoscope,
} from 'lucide-react';

interface MedicalOverviewTabProps {
  casualties: ExtendedCasualtyRecord[];
  facilities: MedicalFacility[];
  transportUnits: TransportUnit[];
  evacuationTasks: EvacuationTask[];
  hazards: RoadHazardEdge[];
  activities: MedicalActivityItem[];
  onNavigateTab: (tab: MediRouteSubTab, targetId?: string) => void;
  onSelectCasualty?: (casualtyId: string) => void;
  isSimPaused?: boolean;
}

export const MedicalOverviewTab: React.FC<MedicalOverviewTabProps> = ({
  casualties,
  facilities,
  transportUnits,
  evacuationTasks,
  hazards,
  activities,
  onNavigateTab,
  onSelectCasualty,
}) => {
  // Metric derivations
  const totalMonitored = casualties.length;
  const activeAnomaliesCount = casualties.reduce(
    (sum, c) => sum + (c.activeAnomalies ? c.activeAnomalies.length : 0),
    0
  );
  const awaitingTriageCount = casualties.filter(
    (c) => c.status === 'awaiting_assessment' || !c.triageCategory
  ).length;

  const immediateCount = casualties.filter((c) => c.triageCategory === 'immediate').length;
  const delayedCount = casualties.filter((c) => c.triageCategory === 'delayed').length;
  const minimalCount = casualties.filter((c) => c.triageCategory === 'minimal').length;
  const expectantCount = casualties.filter((c) => c.triageCategory === 'expectant').length;

  const totalBeds = facilities.reduce((sum, f) => sum + f.totalBeds, 0);
  const availableBeds = facilities.reduce((sum, f) => sum + f.availableBeds, 0);
  const bedOccupancyRate = totalBeds > 0 ? Math.round(((totalBeds - availableBeds) / totalBeds) * 100) : 0;

  const availableGroundUnits = transportUnits.filter(
    (u) => u.type === 'ground_ambulance' && u.status === 'available'
  ).length;
  const totalGroundUnits = transportUnits.filter((u) => u.type === 'ground_ambulance').length;

  const availableAirUnits = transportUnits.filter(
    (u) => u.type === 'air_medevac' && u.status === 'available'
  ).length;
  const totalAirUnits = transportUnits.filter((u) => u.type === 'air_medevac').length;

  const activeEvacs = evacuationTasks.filter(
    (t) => t.status === 'dispatched' || t.status === 'in_transit'
  ).length;
  const blockedHazards = hazards.filter((h) => h.blocked).length;

  return (
    <div className="mediroute-overview-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Key Performance Indicators (Bento Grid Style) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Monitored Casualties */}
        <div
          onClick={() => onNavigateTab('triage')}
          style={{
            background: 'var(--bg-card, #181d1a)',
            border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'border-color 0.15s, transform 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-sage, #738a65)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-card, rgba(115, 138, 101, 0.20))')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary, #94a192)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Monitored Casualties
            </span>
            <Users size={16} color="var(--accent-sage, #738a65)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-mono)' }}>
              {totalMonitored}
            </span>
            <span style={{ fontSize: '0.72rem', color: awaitingTriageCount > 0 ? 'var(--status-warning, #d4a373)' : 'var(--text-muted, #667564)', fontFamily: 'var(--font-mono)' }}>
              {awaitingTriageCount} awaiting review
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.68rem', color: 'var(--accent-sage, #738a65)', fontFamily: 'var(--font-mono)' }}>
            <span>Open triage board</span>
            <ArrowRight size={11} />
          </div>
        </div>

        {/* Active Vital Anomalies */}
        <div
          onClick={() => onNavigateTab('triage')}
          style={{
            background: 'var(--bg-card, #181d1a)',
            border: activeAnomaliesCount > 0 ? '1px solid rgba(200, 90, 83, 0.4)' : '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--status-critical, #c85a53)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = activeAnomaliesCount > 0 ? 'rgba(200, 90, 83, 0.4)' : 'var(--border-card, rgba(115, 138, 101, 0.20))')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary, #94a192)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Active Vital Anomalies
            </span>
            <AlertTriangle size={16} color={activeAnomaliesCount > 0 ? 'var(--status-critical, #c85a53)' : 'var(--text-muted, #667564)'} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: activeAnomaliesCount > 0 ? 'var(--status-critical, #c85a53)' : 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-mono)' }}>
              {activeAnomaliesCount}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #94a192)', fontFamily: 'var(--font-mono)' }}>
              telemetry alerts
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.68rem', color: 'var(--status-critical, #c85a53)', fontFamily: 'var(--font-mono)' }}>
            <span>Review triage alerts</span>
            <ArrowRight size={11} />
          </div>
        </div>

        {/* Facility Bed Availability */}
        <div
          onClick={() => onNavigateTab('facilities')}
          style={{
            background: 'var(--bg-card, #181d1a)',
            border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-sage, #738a65)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-card, rgba(115, 138, 101, 0.20))')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary, #94a192)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Facility Beds Free
            </span>
            <Building2 size={16} color="var(--accent-sage, #738a65)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: availableBeds < 10 ? 'var(--status-warning, #d4a373)' : 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-mono)' }}>
              {availableBeds} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted, #667564)' }}>/ {totalBeds}</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #94a192)', fontFamily: 'var(--font-mono)' }}>
              ({bedOccupancyRate}% occupied)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.68rem', color: 'var(--accent-sage, #738a65)', fontFamily: 'var(--font-mono)' }}>
            <span>Manage 4 facility posts</span>
            <ArrowRight size={11} />
          </div>
        </div>

        {/* Transport Fleet Status */}
        <div
          onClick={() => onNavigateTab('dispatch')}
          style={{
            background: 'var(--bg-card, #181d1a)',
            border: '1px solid var(--border-card, rgba(115, 138, 101, 0.20))',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-sage, #738a65)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-card, rgba(115, 138, 101, 0.20))')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary, #94a192)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Ready Transport Units
            </span>
            <Ambulance size={16} color="var(--accent-sage, #738a65)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '8px' }}>
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-mono)' }}>
                {availableGroundUnits}/{totalGroundUnits}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #94a192)', marginLeft: '4px', fontFamily: 'var(--font-mono)' }}>Ground</span>
            </div>
            <div>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: availableAirUnits > 0 ? 'var(--accent-sage, #738a65)' : 'var(--status-warning, #d4a373)', fontFamily: 'var(--font-mono)' }}>
                {availableAirUnits}/{totalAirUnits}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #94a192)', marginLeft: '4px', fontFamily: 'var(--font-mono)' }}>Air</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '0.68rem', color: 'var(--accent-sage, #738a65)', fontFamily: 'var(--font-mono)' }}>
            <span>{activeEvacs} active transport tasks</span>
            <ArrowRight size={11} />
          </div>
        </div>
      </div>

      {/* Main Grid: Triage Distribution & Evacuation Status */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Triage Priority Distribution Card */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Stethoscope size={16} color="var(--accent-sage, #738a65)" />
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-heading)' }}>
                Triage Priority Breakdown
              </h3>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onNavigateTab('triage')}
              style={{
                fontSize: '0.7rem',
                padding: '3px 8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(115, 138, 101, 0.12)',
                color: 'var(--accent-sage, #738a65)',
                border: '1px solid rgba(115, 138, 101, 0.25)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>Board</span>
              <ArrowRight size={11} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {/* Immediate Red */}
            <div
              onClick={() => onNavigateTab('triage')}
              style={{
                background: 'rgba(200, 90, 83, 0.12)',
                border: '1px solid rgba(200, 90, 83, 0.3)',
                borderRadius: '4px',
                padding: '10px 8px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--status-critical, #c85a53)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                Immediate
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', margin: '4px 0', fontFamily: 'var(--font-mono)' }}>
                {immediateCount}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary, #94a192)' }}>Critical</div>
            </div>

            {/* Delayed Yellow */}
            <div
              onClick={() => onNavigateTab('triage')}
              style={{
                background: 'rgba(212, 163, 115, 0.12)',
                border: '1px solid rgba(212, 163, 115, 0.3)',
                borderRadius: '4px',
                padding: '10px 8px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--status-warning, #d4a373)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                Delayed
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', margin: '4px 0', fontFamily: 'var(--font-mono)' }}>
                {delayedCount}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary, #94a192)' }}>Serious</div>
            </div>

            {/* Minimal Green */}
            <div
              onClick={() => onNavigateTab('triage')}
              style={{
                background: 'rgba(88, 129, 87, 0.12)',
                border: '1px solid rgba(88, 129, 87, 0.3)',
                borderRadius: '4px',
                padding: '10px 8px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--status-safe, #588157)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                Minimal
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #e9ece9)', margin: '4px 0', fontFamily: 'var(--font-mono)' }}>
                {minimalCount}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary, #94a192)' }}>Minor</div>
            </div>
          </div>

          {/* Quick casualty list snapshot */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary, #94a192)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              High-Priority Monitored Casualties
            </div>
            {casualties.map((casualty) => (
              <div
                key={casualty.id}
                onClick={() => {
                  if (onSelectCasualty) onSelectCasualty(casualty.id);
                  onNavigateTab('triage', casualty.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'var(--bg-elevated, #1f2622)',
                  border: '1px solid var(--border-grid, rgba(115, 138, 101, 0.12))',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, #222b25)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-elevated, #1f2622)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background:
                        casualty.triageCategory === 'immediate'
                          ? 'var(--status-critical, #c85a53)'
                          : casualty.triageCategory === 'delayed'
                          ? 'var(--status-warning, #d4a373)'
                          : 'var(--status-safe, #588157)',
                    }}
                  />
                  <div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-mono)' }}>
                      {casualty.patientCode || casualty.id}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginLeft: '6px' }}>
                      {casualty.location?.name || 'Field Location'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: (casualty.heartRate || 0) > 120 ? 'var(--status-critical, #c85a53)' : 'var(--text-primary, #e9ece9)' }}>
                    HR {casualty.heartRate ?? casualty.vitals?.respiratoryRate ?? '--'}
                  </span>
                  <span style={{ color: (casualty.spo2 || 99) < 90 ? 'var(--status-critical, #c85a53)' : 'var(--text-secondary, #94a192)' }}>
                    SpO₂ {casualty.spo2 ?? '--'}%
                  </span>
                  <ArrowRight size={11} color="var(--text-muted, #667564)" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Evacuation Routing & Road Hazards Card */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RouteIcon size={16} color="var(--accent-sage, #738a65)" />
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-heading)' }}>
                Evacuation & Hazard Status
              </h3>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onNavigateTab('routing')}
              style={{
                fontSize: '0.7rem',
                padding: '3px 8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(115, 138, 101, 0.12)',
                color: 'var(--accent-sage, #738a65)',
                border: '1px solid rgba(115, 138, 101, 0.25)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span>Planner</span>
              <ArrowRight size={11} />
            </button>
          </div>

          {/* Active Hazards summary */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '4px',
              background: blockedHazards > 0 ? 'rgba(200, 90, 83, 0.10)' : 'rgba(88, 129, 87, 0.10)',
              border: blockedHazards > 0 ? '1px solid rgba(200, 90, 83, 0.25)' : '1px solid rgba(88, 129, 87, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={15} color={blockedHazards > 0 ? 'var(--status-critical, #c85a53)' : 'var(--status-safe, #588157)'} />
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)' }}>
                  {blockedHazards} Blocked Road Hazard Segment{blockedHazards !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #94a192)' }}>
                  Dijkstra dynamic recalculation active
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('routing')}
              style={{
                fontSize: '0.68rem',
                color: 'var(--accent-sage, #738a65)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
              }}
            >
              Inspect
            </button>
          </div>

          {/* Active Evacuation Tasks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary, #94a192)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Active Evacuation Operations ({activeEvacs})
            </div>
            {evacuationTasks.length === 0 ? (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #667564)', padding: '12px', textAlign: 'center' }}>
                No active evacuation missions currently dispatched.
              </div>
            ) : (
              evacuationTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onNavigateTab('dispatch', task.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: 'var(--bg-elevated, #1f2622)',
                    border: '1px solid var(--border-grid, rgba(115, 138, 101, 0.12))',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Ambulance size={15} color="var(--accent-sage, #738a65)" />
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-mono)' }}>
                        {task.transportUnitId} &rarr; {task.casualtyId}
                      </div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary, #94a192)' }}>
                        Dest: {task.destinationFacilityId} | ETA {task.etaMinutes} min ({task.routeDistanceKm} km)
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '3px',
                      background: 'rgba(115, 138, 101, 0.15)',
                      color: 'var(--accent-sage, #738a65)',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {task.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Medical Operations Activity Stream */}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} color="var(--accent-sage, #738a65)" />
            <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)', fontFamily: 'var(--font-heading)' }}>
              Operational Activity Feed
            </h3>
          </div>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #667564)', fontFamily: 'var(--font-mono)' }}>
            Real-time event stream
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activities.length === 0 ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #667564)', padding: '16px', textAlign: 'center' }}>
              No medical operations recorded yet.
            </div>
          ) : (
            activities.slice(0, 5).map((act) => (
              <div
                key={act.id}
                onClick={() => {
                  if (act.targetTab) onNavigateTab(act.targetTab, act.targetId);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  background: 'var(--bg-elevated, #1f2622)',
                  borderLeft:
                    act.severity === 'critical'
                      ? '3px solid var(--status-critical, #c85a53)'
                      : act.severity === 'warning'
                      ? '3px solid var(--status-warning, #d4a373)'
                      : act.severity === 'success'
                      ? '3px solid var(--status-safe, #588157)'
                      : '3px solid var(--accent-sage, #738a65)',
                  borderRadius: '3px',
                  cursor: act.targetTab ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, #222b25)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-elevated, #1f2622)')}
              >
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #e9ece9)' }}>
                    {act.title}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #94a192)', marginTop: '2px' }}>
                    {act.description}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.65rem', color: 'var(--text-muted, #667564)', flexShrink: 0, marginLeft: '12px', fontFamily: 'var(--font-mono)' }}>
                  <Clock size={11} />
                  <span>{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
