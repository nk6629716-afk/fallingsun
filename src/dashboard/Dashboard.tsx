import { formatDurationMinutes } from '../utils/units';
import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  DashboardSummary,
  IncidentReport,
  TelemetryTrack,
  AirspaceAlert,
  RestrictedAirspaceZone,
  GeoIntelObservation,
  CasualtyRecord,
  RoadHazardEdge,
  EvacuationNode,
} from '@shared/types';
import {
  ChevronLeft,
  GripVertical,
  LayoutGrid,
  Map,
} from 'lucide-react';
import { TacticalMap } from '../components/TacticalMap';
import { TacticalBentoGrid } from './TacticalBentoGrid';
import { AlertsPanel, ThreatItemData } from './AlertsPanel';
import { SimulationReplayFooter } from './SimulationReplayFooter';
import { MediRouteSubTab } from '../modules/mediroute/medirouteTypes';
import { INITIAL_EXTENDED_CASUALTIES } from '../modules/mediroute/medirouteData';

interface DashboardProps {
  summary: DashboardSummary;
  incidents: IncidentReport[];
  tracks: TelemetryTrack[];
  alerts: AirspaceAlert[];
  zones: RestrictedAirspaceZone[];
  observations: GeoIntelObservation[];
  casualties: CasualtyRecord[];
  hazards: RoadHazardEdge[];
  nodes: EvacuationNode[];
  onNavigate: (module: 'dashboard' | 'fieldlink' | 'skywatch' | 'geointel' | 'mediroute') => void;
  onNavigateMediRouteSubTab?: (subTab: MediRouteSubTab) => void;
  onResetDemo: () => Promise<void>;
  isOfflineMode: boolean;
  realtimeStatus?: 'connected' | 'reconnecting' | 'disconnected' | 'stale';
  lastEventTimestamp?: string | null;
  backendHealth?: {
    status: string;
    service: string;
    storageMode: string;
    supabaseConfigured?: boolean;
    uptimeSeconds?: number;
    isSimulated?: boolean;
    timestamp?: string;
  } | null;
  onStepSimulation?: () => Promise<void>;
  onToggleSimulationPause?: () => Promise<void>;
  isSimPaused?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  summary,
  incidents,
  tracks,
  alerts,
  zones,
  observations,
  casualties,
  hazards,
  nodes,
  onNavigate,
  onNavigateMediRouteSubTab,
  onResetDemo,
  isOfflineMode,
  realtimeStatus = 'disconnected',
  lastEventTimestamp = null,
  backendHealth = null,
  onStepSimulation,
  onToggleSimulationPause,
  isSimPaused = false,
}) => {
  const [dashboardView, setDashboardView] = useState<'bento' | 'map'>('bento');
  const [crossModuleStep, setCrossModuleStep] = useState<number>(2);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'alerts' | 'reports' | 'activity'>('alerts');

  // Resizable Right Information Tab State
  const [rightPaneWidth, setRightPaneWidth] = useState<number>(340);
  const [isRightPaneCollapsed, setIsRightPaneCollapsed] = useState<boolean>(false);
  const isDraggingSplitter = useRef(false);
  const startDragX = useRef(0);
  const startWidth = useRef(340);

  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplitter.current = true;
    startDragX.current = e.clientX;
    startWidth.current = rightPaneWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingSplitter.current) return;
      const deltaX = startDragX.current - moveEvent.clientX;
      const newWidth = Math.max(240, Math.min(650, startWidth.current + deltaX));
      setRightPaneWidth(newWidth);
      setIsRightPaneCollapsed(false);
    };

    const handleMouseUp = () => {
      isDraggingSplitter.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [rightPaneWidth]);

  // Derived MediRoute metrics
  const activeCasualties = casualties.length > 0 ? casualties : INITIAL_EXTENDED_CASUALTIES;
  const immediateCount = activeCasualties.filter((c: any) => c.triageCategory === 'immediate').length || 2;
  const blockedHazardsCount = hazards.filter((h) => h.blocked).length;

  // Dedicated MediRoute Critical Trauma Record
  const criticalMedicalIncident = useMemo<IncidentReport>(() => {
    const medInc = incidents.find((i) => i.priority === 'critical' || i.type === 'medical');
    if (medInc) return medInc;
    return {
      id: 'CAS-CRIT-01',
      sourceModule: 'fieldlink',
      type: 'medical',
      priority: 'critical',
      title: 'SOL-001 (Aarav): Critical Blast Hypoxemia',
      notes: 'Hemodynamic compromise (BP: 88/54, HR: 136 bpm, SpO2: 88%). Rule 4 START Immediate. Priority Evac to Field Hospital Alpha.',
      location: { name: 'Forward Aid Station Bravo', lat: 34.065, lng: -118.238 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      isSimulated: true,
    };
  }, [incidents]);

  // Dedicated MediRoute Triage & Evacuation Alerts
  const medicalAlerts = useMemo<AirspaceAlert[]>(() => {
    return [
      {
        id: 'MED-ALT-1',
        trackId: 'SOL-001',
        trackCallsign: 'SOL-001 (Aarav)',
        ruleName: 'speed_anomaly',
        severity: 'critical',
        observedValue: 'HR: 136 bpm, SpO2: 88%',
        threshold: 'HR > 100 bpm',
        explanation: 'START Triage Immediate: Hemodynamic shock detected. Priority medevac via AMB-02.',
        timestamp: new Date().toISOString(),
        acknowledged: false,
        isSimulated: true,
      },
      {
        id: 'MED-ALT-2',
        trackId: 'FAC-IP-3',
        trackCallsign: 'Intake Point Charlie',
        ruleName: 'route_deviation',
        severity: 'warning',
        observedValue: '25/25 Beds Occupied',
        threshold: 'Capacity >= 95%',
        explanation: 'Interstate Intake Point Charlie reached 100% capacity. Diverting inbound to Hospital Alpha.',
        timestamp: new Date().toISOString(),
        acknowledged: false,
        isSimulated: true,
      },
      {
        id: 'MED-ALT-3',
        trackId: 'EDGE-1',
        trackCallsign: 'Bridge Alpha Span',
        ruleName: 'restricted_zone_entry',
        severity: 'critical',
        observedValue: 'Road Inaccessible',
        threshold: 'Corridor Integrity Check',
        explanation: 'Bridge Alpha Span structural collapse detected. Highway 9 bypass active.',
        timestamp: new Date().toISOString(),
        acknowledged: false,
        isSimulated: true,
      },
    ];
  }, []);

  // Medical Triage & Evacuation Priority Queue
  const medicalTriageQueue = useMemo<ThreatItemData[]>(() => {
    const baseTrack: TelemetryTrack = {
      id: 'SOL-001',
      callsign: 'SOL-001 (Aarav)',
      lat: 34.072,
      lng: -118.225,
      altitude: 0,
      speed: 0,
      heading: 0,
      timestamp: new Date().toISOString(),
      status: 'suspicious',
      flightHistory: [],
      isSimulated: true,
      threatScore: 95,
    };

    return [
      {
        id: 'SOL-001',
        callsign: 'SOL-001 (Aarav)',
        reason: 'Hemodynamic compromise (BP 88/54, HR 136, SpO2 88%). ALS Evac to Hospital Alpha.',
        score: 95,
        severity: 'critical',
        track: {
          ...baseTrack,
          id: 'SOL-001',
          callsign: 'SOL-001 (Aarav)',
          threatScore: 95,
        },
      },
      {
        id: 'SOL-004',
        callsign: 'SOL-004 (Diya)',
        reason: 'Junctional hemorrhage (HR 142 bpm, BP 82/50, 35.2°C). Hemostatic gauze applied.',
        score: 88,
        severity: 'critical',
        track: {
          ...baseTrack,
          id: 'SOL-004',
          callsign: 'SOL-004 (Diya)',
          threatScore: 88,
        },
      },
      {
        id: 'EDGE-1',
        callsign: 'HAZARD: Bridge Alpha Span',
        reason: 'Structural failure. Corridor blocked. Highway 9 bypass detour active.',
        score: 72,
        severity: 'high',
        track: {
          ...baseTrack,
          id: 'EDGE-1',
          callsign: 'HAZARD: Bridge Span',
          threatScore: 72,
        },
      },
      {
        id: 'SOL-002',
        callsign: 'SOL-002 (Aditi)',
        reason: 'Compound tibia fracture. Vitals stable (HR 86, SpO2 96%). Delayed holding.',
        score: 35,
        severity: 'low',
        track: {
          ...baseTrack,
          id: 'SOL-002',
          callsign: 'SOL-002 (Aditi)',
          threatScore: 35,
          status: 'tracking',
        },
      },
    ];
  }, []);

  // Medical Evacuation 5-Step Mission Sequence (strictly cycles 1..5 for contracts)
  const missionSteps = useMemo(
    () => [
      {
        step: 1,
        title: 'Casualty intake logged',
        statusText: 'Verified',
        module: 'mediroute',
      },
      {
        step: 2,
        title: 'START Triage evaluated',
        statusText: 'Active now',
        module: 'mediroute',
      },
      {
        step: 3,
        title: 'Evac route hazard checked',
        statusText: 'Verified',
        module: 'mediroute',
      },
      {
        step: 4,
        title: 'Hospital bed secured',
        statusText: 'Medical',
        module: 'mediroute',
      },
      {
        step: 5,
        title: 'Medevac unit dispatched',
        statusText: 'Logistics',
        module: 'mediroute',
      },
    ],
    []
  );

  const handleNextStep = useCallback(() => {
    const next = crossModuleStep < 5 ? crossModuleStep + 1 : 1;
    setCrossModuleStep(next);
    onNavigate('mediroute');
  }, [crossModuleStep, onNavigate]);

  // Medical Activity ticker
  const latestActivity = useMemo(() => {
    return `Medevac Dispatch: AMB-02 en route to Field Hospital Alpha with SOL-001 (Aarav) — ETA ${formatDurationMinutes(11)}`;
  }, []);

  // Top-Left Metrics Panel (Medical Telemetry for COP Map)
  const metricsPanel = (
    <div
      style={{
        background: 'rgba(24, 29, 26, 0.90)',
        border: '1px solid rgba(115, 138, 101, 0.25)',
        boxShadow: 'var(--shadow-flat)',
        borderRadius: '6px',
        display: 'flex',
        padding: '5px 12px',
        gap: '14px',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      <div>
        <div
          className="metric-value"
          style={{
            fontSize: '1.15rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: 'var(--text-primary, #e9ece9)',
            lineHeight: 1,
          }}
        >
          {activeCasualties.length}
        </div>
        <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary, #94a192)', marginTop: '2px' }}>
          Casualties
        </div>
      </div>

      <div style={{ borderLeft: '1px solid rgba(115, 138, 101, 0.20)', paddingLeft: '12px' }}>
        <div
          className="metric-value"
          style={{
            fontSize: '1.15rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: '#ff7875',
            lineHeight: 1,
          }}
        >
          {immediateCount}
        </div>
        <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary, #94a192)', marginTop: '2px' }}>
          Immediate
        </div>
      </div>

      <div style={{ borderLeft: '1px solid rgba(115, 138, 101, 0.20)', paddingLeft: '12px' }}>
        <div
          className="metric-value"
          style={{
            fontSize: '1.15rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: 'var(--text-primary, #e9ece9)',
            lineHeight: 1,
          }}
        >
          {nodes.length}
        </div>
        <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary, #94a192)', marginTop: '2px' }}>
          Facilities
        </div>
      </div>

      <div style={{ borderLeft: '1px solid rgba(115, 138, 101, 0.20)', paddingLeft: '12px' }}>
        <div
          className="metric-value"
          style={{
            fontSize: '1.15rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            color: blockedHazardsCount > 0 ? 'var(--highlight-amber, #d4a373)' : 'var(--text-primary, #e9ece9)',
            lineHeight: 1,
          }}
        >
          {blockedHazardsCount}
        </div>
        <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary, #94a192)', marginTop: '2px' }}>
          Blocked
        </div>
      </div>
    </div>
  );

  // Bottom-Left Legend for Overview Evacuation Graph Nodes
  const nodesLegendChip = (
    <div
      style={{
        background: 'rgba(24, 29, 26, 0.90)',
        border: '1px solid rgba(115, 138, 101, 0.25)',
        borderRadius: '6px',
        padding: '3px 8px',
        fontSize: '0.65rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-secondary, #94a192)',
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
      }}
      title="Evacuation Network Node Key"
    >
      <span style={{ fontWeight: 700, color: 'var(--text-primary, #e9ece9)' }}>MED:</span>
      <span>INTAKE</span>
      <span>•</span>
      <span>HOSPITAL</span>
      <span>•</span>
      <span>AID POST</span>
      <span>•</span>
      <span>HUB</span>
      <span>•</span>
      <span style={{ color: '#ff7875' }}>BLOCKED DETOUR</span>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 48px)',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Tactical View Mode Switcher Sub-Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 16px',
          background: 'rgba(18, 22, 20, 0.95)',
          borderBottom: '1px solid rgba(115, 138, 101, 0.20)',
          flexShrink: 0,
          gap: '12px',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="segmented-switch">
            <button
              type="button"
              className={`segmented-switch-btn ${dashboardView === 'bento' ? 'active' : ''}`}
              onClick={() => setDashboardView('bento')}
            >
              <LayoutGrid size={13} />
              <span>MEDIROUTE BENTO</span>
            </button>
            <button
              type="button"
              className={`segmented-switch-btn ${dashboardView === 'map' ? 'active' : ''}`}
              onClick={() => setDashboardView('map')}
            >
              <Map size={13} />
              <span>EVACUATION COP MAP</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="tactical-badge tactical-badge-online">
            <span className="dot-glowing-green" />
            MED_ONLINE
          </span>
          <span className="tactical-badge tactical-badge-secure">
            TRIAGE_ACTIVE
          </span>
        </div>
      </div>

      {dashboardView === 'bento' ? (
        <TacticalBentoGrid
          summary={summary}
          tracksCount={activeCasualties.length}
          alertsCount={medicalAlerts.length}
          incidentsCount={activeCasualties.length}
          onNavigateModule={onNavigate}
          onNavigateMediRouteSubTab={onNavigateMediRouteSubTab}
          casualties={casualties}
          hazards={hazards}
          nodes={nodes}
        />
      ) : (
        /* Upper Area: Full Area Tactical Map + Right Intel Pane */
        <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
          {/* Map Container */}
          <div style={{ flex: 1, position: 'relative', minWidth: 0, height: '100%' }}>
            <TacticalMap
              incidents={incidents}
              tracks={[]}
              zones={[]}
              nodes={nodes}
              edges={hazards}
              selectedEntityId={selectedEntity?.id}
              onSelectEntity={setSelectedEntity}
              height="100%"
              showRadarSweep={false}
              initialMode="chart"
              topLeftContent={metricsPanel}
              bottomLeftContent={nodesLegendChip}
            />

            {/* Selected Entity HUD Modal */}
            {selectedEntity && (
              <div
                style={{
                  position: 'absolute',
                  top: '74px',
                  left: '16px',
                  zIndex: 25,
                  background: 'var(--color-sheet)',
                  border: 'var(--border-width, 1.2px) solid var(--color-edge)',
                  boxShadow: 'var(--shadow-flat)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  minWidth: '240px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    {selectedEntity.type?.toUpperCase()} // MEDIROUTE
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedEntity(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-secondary)' }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '2px' }}>
                  {selectedEntity.raw?.name || selectedEntity.raw?.title || selectedEntity.raw?.callsign || selectedEntity.id}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: '10px', width: '100%' }}
                  onClick={() => {
                    if (onNavigateMediRouteSubTab) {
                      if (selectedEntity.type === 'node') onNavigateMediRouteSubTab('facilities');
                      else if (selectedEntity.type === 'edge') onNavigateMediRouteSubTab('routing');
                      else onNavigateMediRouteSubTab('triage');
                    } else {
                      onNavigate('mediroute');
                    }
                  }}
                >
                  Open in MediRoute
                </button>
              </div>
            )}

            {/* Floating expand tab button when information panel is collapsed */}
            {isRightPaneCollapsed && (
              <button
                type="button"
                onClick={() => setIsRightPaneCollapsed(false)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  zIndex: 30,
                  background: 'var(--color-sheet)',
                  border: '1px solid var(--color-edge)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--shadow-flat)',
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
                title="Expand intelligence tab"
              >
                <ChevronLeft size={14} />
                <span>Medical Intel</span>
              </button>
            )}
          </div>

          {/* Draggable Vertical Splitter Slider Handle */}
          <div
            onMouseDown={handleSplitterMouseDown}
            title="Drag to resize information tab (Double-click to reset)"
            onDoubleClick={() => {
              setRightPaneWidth(340);
              setIsRightPaneCollapsed(false);
            }}
            style={{
              width: '8px',
              cursor: 'col-resize',
              background: 'var(--color-paper)',
              borderLeft: '1px solid var(--color-edge)',
              borderRight: '1px solid var(--color-edge)',
              display: isRightPaneCollapsed ? 'none' : 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              zIndex: 25,
              userSelect: 'none',
            }}
          >
            <GripVertical size={12} color="var(--text-secondary)" style={{ opacity: 0.6 }} />
          </div>

          {/* Right Intel Pane */}
          <AlertsPanel
            width={rightPaneWidth}
            isCollapsed={isRightPaneCollapsed}
            onToggleCollapse={() => setIsRightPaneCollapsed(true)}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            openAlerts={medicalAlerts}
            incidents={incidents}
            criticalIncident={criticalMedicalIncident}
            rankedThreats={medicalTriageQueue}
            selectedEntityId={selectedEntity?.id || null}
            onSelectEntity={setSelectedEntity}
            crossModuleStep={crossModuleStep}
            missionSteps={missionSteps}
            onStepClick={(stepNum, module) => {
              setCrossModuleStep(stepNum);
              onNavigate('mediroute');
            }}
            onNextStep={handleNextStep}
            isOfflineMode={isOfflineMode}
            onNavigate={(mod) => {
              if (mod === 'fieldlink') {
                if (onNavigateMediRouteSubTab) onNavigateMediRouteSubTab('triage');
                else onNavigate('mediroute');
              } else {
                onNavigate(mod);
              }
            }}
          />
        </div>
      )}

      {/* Bottom Simulation Bar */}
      <SimulationReplayFooter
        isSimPaused={isSimPaused}
        onToggleSimulationPause={onToggleSimulationPause}
        latestActivity={latestActivity}
      />
    </div>
  );
};
