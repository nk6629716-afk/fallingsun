import React, { useState } from 'react';
import {
  Activity,
  HeartPulse,
  Shield,
  ClipboardList,
  Route as RouteIcon,
  Building2,
  Ambulance,
  AlertCircle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  ChevronRight,
  Stethoscope,
  Terminal,
  Crosshair,
  TrendingUp,
  Star,
  MapPin,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { DashboardSummary, CasualtyRecord, RoadHazardEdge, EvacuationNode } from '@shared/types';
import { MediRouteSubTab } from '../modules/mediroute/medirouteTypes';
import {
  INITIAL_FACILITIES,
  INITIAL_TRANSPORT_UNITS,
  INITIAL_EXTENDED_CASUALTIES,
  INITIAL_EVACUATION_TASKS,
} from '../modules/mediroute/medirouteData';
import { createWavefrontRipple } from '../utils/motion';

interface TacticalBentoGridProps {
  summary: DashboardSummary;
  tracksCount: number;
  alertsCount: number;
  incidentsCount: number;
  onNavigateModule: (module: 'dashboard' | 'fieldlink' | 'skywatch' | 'geointel' | 'mediroute') => void;
  onNavigateMediRouteSubTab?: (subTab: MediRouteSubTab) => void;
  casualties?: CasualtyRecord[];
  hazards?: RoadHazardEdge[];
  nodes?: EvacuationNode[];
}

interface DirectiveTask {
  id: string;
  title: string;
  completed: boolean;
  code: string;
  sector: string;
}

export const TacticalBentoGrid: React.FC<TacticalBentoGridProps> = ({
  summary,
  tracksCount,
  alertsCount,
  incidentsCount,
  onNavigateModule,
  onNavigateMediRouteSubTab,
  casualties: casualtyProps = [],
  hazards: hazardProps = [],
  nodes: nodeProps = [],
}) => {
  // Interactive Modal State
  const [modalNotice, setModalNotice] = useState<string | null>(null);

  // Use props or fallback to fixtures for rich medical telemetry
  const activeCasualties = casualtyProps.length > 0 ? casualtyProps : INITIAL_EXTENDED_CASUALTIES;
  const activeHazards = hazardProps.length > 0 ? hazardProps : [
    {
      id: 'EDGE-1',
      edgeId: 'E-INT-BRG',
      fromNodeId: 'INT-01',
      toNodeId: 'BRG-01',
      name: 'Bridge Highway Alpha Span',
      blocked: true,
      hazardType: 'structural_damage',
      reportedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSimulated: true,
    },
  ];

  // Derived MediRoute metrics
  const totalCasualtiesCount = activeCasualties.length;
  const immediateCasualties = activeCasualties.filter((c: any) => c.triageCategory === 'immediate');
  const delayedCasualties = activeCasualties.filter((c: any) => c.triageCategory === 'delayed');
  const minimalCasualties = activeCasualties.filter((c: any) => c.triageCategory === 'minimal');
  const expectantCasualties = activeCasualties.filter((c: any) => c.triageCategory === 'expectant');

  const immediateCount = immediateCasualties.length || 2;
  const delayedCount = delayedCasualties.length || 1;
  const minimalCount = minimalCasualties.length || 0;
  const expectantCount = expectantCasualties.length || 0;

  const totalBeds = INITIAL_FACILITIES.reduce((sum, f) => sum + f.totalBeds, 0); // 93
  const availableBeds = INITIAL_FACILITIES.reduce((sum, f) => sum + f.availableBeds, 0); // 23
  const bedOccupancyPercent = Math.round(((totalBeds - availableBeds) / totalBeds) * 100); // 75%

  const blockedHazardsCount = activeHazards.filter((h) => h.blocked).length;

  // Interactive Directives State (Medical Operations Protocols)
  const [tasks, setTasks] = useState<DirectiveTask[]>([
    { id: 'm1', title: 'Verify Immediate Triage on SOL-001 (Aarav) (Hemodynamic Shock)', completed: true, code: 'TRI-01', sector: 'TRAUMA-ALPHA' },
    { id: 'm2', title: 'Route AMB-02 via Highway 9 Bypass around Bridge Span', completed: false, code: 'ROU-02', sector: 'CORRIDOR-9' },
    { id: 'm3', title: 'Stage Surgical Suite #1 at Sector Field Hospital Alpha', completed: false, code: 'SUR-03', sector: 'HOSP-ALPHA' },
    { id: 'm4', title: 'Dispatch Air Medevac for Casualty SOL-004 (Diya) (Hemorrhage)', completed: false, code: 'EVAC-04', sector: 'AIR-MED' },
  ]);

  // Hover state for Corridor Transit Times Bar Chart
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  // Evacuation Corridors transit and status telemetry
  const corridorData = [
    { label: 'Hwy 9 Bypass', val: 0.35, eta: '11 min', dist: '6.8 km', status: 'CLEAR', speed: '48 km/h' },
    { label: 'I-101 Corridor', val: 0.55, eta: '18 min', dist: '12.2 km', status: 'DEGRADED', speed: '32 km/h' },
    { label: 'Bridge Alpha', val: 0.95, eta: '32 min', dist: '4.1 km', status: 'BLOCKED', speed: '0 km/h' },
    { label: 'River Rd Link', val: 0.28, eta: '8 min', dist: '4.5 km', status: 'CLEAR', speed: '55 km/h' },
    { label: 'Ridgeline Post', val: 0.44, eta: '14 min', dist: '8.9 km', status: 'CLEAR', speed: '42 km/h' },
    { label: 'North Evac Ax', val: 0.38, eta: '12 min', dist: '7.4 km', status: 'CLEAR', speed: '50 km/h' },
    { label: 'Hub Bravo Conn', val: 0.48, eta: '15 min', dist: '9.6 km', status: 'CLEAR', speed: '44 km/h' },
    { label: 'Intake Charlie', val: 0.62, eta: '20 min', dist: '14.0 km', status: 'HEAVY TRAF', speed: '28 km/h' },
  ];

  const handleToggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextState = !t.completed;
          setModalNotice(
            nextState
              ? `Medical Protocol Directive [${t.code}] "${t.title}" verified and executed.`
              : `Medical Protocol Directive [${t.code}] "${t.title}" status reset to pending verification.`
          );
          return { ...t, completed: nextState };
        }
        return t;
      })
    );
  };

  const handleNavigateSubTab = (subTab: MediRouteSubTab) => {
    if (onNavigateMediRouteSubTab) {
      onNavigateMediRouteSubTab(subTab);
    } else {
      onNavigateModule('mediroute');
      if (typeof window !== 'undefined') {
        window.location.hash = `#mediroute/${subTab}`;
      }
    }
  };

  const handleRunMedicalTriageDiagnostics = () => {
    setModalNotice(
      `MEDIROUTE COP TELEMETRY NOMINAL: ${totalCasualtiesCount} Monitored Casualties (${immediateCount} Immediate, ${delayedCount} Delayed). Hospital bed occupancy: ${bedOccupancyPercent}%. ${blockedHazardsCount} Blocked Evacuation Corridors. Ambulances MEDIC-ONE & MEDIC-TWO online.`
    );
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div
      className="tactical-grid-bg tactical-scanlines"
      style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '20px 24px 32px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Tactical Sub-Header & Telemetry Status Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 18px',
          background: 'rgba(24, 29, 26, 0.85)',
          border: '1px solid rgba(115, 138, 101, 0.20)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-flat)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              background: 'rgba(91, 112, 80, 0.20)',
              border: '1px solid rgba(115, 138, 101, 0.40)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-sage, #738a65)',
            }}
          >
            <HeartPulse size={18} className="dot-glowing-green" style={{ background: 'transparent' }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: 'var(--text-primary, #e9ece9)',
                }}
              >
                MEDIROUTE // MEDICAL OPERATIONS COP
              </span>
              <span className="tactical-badge tactical-badge-online">
                <span className="dot-glowing-green" />
                TRIAGE_ACTIVE
              </span>
              <span className="tactical-badge tactical-badge-secure">EVAC_NETWORK_SECURE</span>
            </div>
            <div
              className="meta-coord"
              style={{ fontSize: '0.66rem', marginTop: '3px', color: 'var(--text-secondary, #94a192)' }}
            >
              REGIONAL TRAUMA SECTOR // EVACUATION COORDINATION NODE // 34.0522° N, 118.2437° W
            </div>
          </div>
        </div>

        {/* Right Header Quick Stats & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#121614',
              border: '1px solid rgba(115, 138, 101, 0.20)',
              padding: '5px 12px',
              borderRadius: '6px',
            }}
          >
            <span className="dot-glowing-green" />
            <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              TRAUMA STATUS:
            </span>
            <span
              style={{
                fontSize: '0.70rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--accent-sage, #738a65)',
              }}
            >
              {immediateCount} IMMEDIATE / {delayedCount} DELAYED
            </span>
          </div>

          <button
            type="button"
            className="btn-tactical btn-tactical-primary"
            onClick={(e) => {
              createWavefrontRipple(e);
              handleNavigateSubTab('dispatch');
            }}
            style={{ padding: '6px 14px' }}
            title="Open Transport Dispatch"
          >
            <Ambulance size={13} />
            <span>DISPATCH MEDEVAC</span>
            <span className="tactical-arrow">→</span>
          </button>

          <button
            type="button"
            className="btn-tactical btn-tactical-olive"
            onClick={(e) => {
              createWavefrontRipple(e);
              handleRunMedicalTriageDiagnostics();
            }}
            style={{ padding: '6px 14px' }}
          >
            <Terminal size={13} />
            <span>COP TELEMETRY</span>
          </button>
        </div>
      </div>

      {/* 2. Medical Telemetry Status Bar */}
      <div className="tactical-uplink-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div className="tactical-uplink-status">
          <span className="dot-glowing-green" />
          <span style={{ color: '#8a9685', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            [MEDEVAC_CORRIDOR_ACTIVE // LIVE_TRIAGE_STREAM // PROTOCOL_START_v4 // AES-256-GCM]
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.70rem',
              fontFamily: 'var(--font-mono)',
              background: 'rgba(255, 77, 79, 0.12)',
              border: '1px solid rgba(255, 77, 79, 0.30)',
              color: '#ff7875',
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            <AlertCircle size={13} />
            <span>CRITICAL: {immediateCount} IMMEDIATE EVAC</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.70rem',
              fontFamily: 'var(--font-mono)',
              background: 'rgba(212, 163, 115, 0.12)',
              border: '1px solid rgba(212, 163, 115, 0.30)',
              color: 'var(--highlight-amber, #d4a373)',
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            <AlertTriangle size={13} />
            <span>CORRIDORS: {blockedHazardsCount} HAZARD DETOUR</span>
          </div>

          <button
            type="button"
            className="btn-tactical btn-tactical-ghost"
            onClick={() => handleNavigateSubTab('triage')}
            style={{ padding: '4px 10px', fontSize: '0.70rem' }}
          >
            <span>Triage Board</span>
            <span className="tactical-arrow">→</span>
          </button>
        </div>
      </div>

      {/* 3. Bento Grid Layout */}
      <div className="bento-grid">
        {/* CARD 1: Monitored Casualties & START Triage (Span 4) */}
        <div
          className="bento-card bento-col-4 bento-card-stagger"
          style={{ '--index': 1, cursor: 'pointer' } as React.CSSProperties}
          onClick={() => handleNavigateSubTab('triage')}
          title="Click to open Triage Board"
        >
          <span className="corner-accent-tr" />
          <span className="corner-accent-bl" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: '#121614',
                    border: '1px solid rgba(115, 138, 101, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-sage, #738a65)',
                  }}
                >
                  <Users size={15} />
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-secondary, #94a192)',
                  }}
                >
                  Casualty Triage Telemetry
                </span>
              </div>
              <span className="tactical-badge tactical-badge-online">ACTIVE TRIAGE</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '8px 0 14px 0' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: 'var(--text-primary, #e9ece9)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {totalCasualtiesCount}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary, #94a192)',
                  fontWeight: 600,
                }}
              >
                PATIENTS ASSESSED
              </span>
            </div>

            {/* START Triage Distribution Bar */}
            <div style={{ width: '100%', marginBottom: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  height: '8px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  background: 'rgba(255, 255, 255, 0.08)',
                  gap: '2px',
                }}
              >
                <div style={{ width: '66%', background: '#ff4d4f' }} title="Immediate: 2" />
                <div style={{ width: '34%', background: '#d4a373' }} title="Delayed: 1" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', fontFamily: 'var(--font-mono)', marginTop: '4px', color: 'var(--text-secondary)' }}>
                <span style={{ color: '#ff7875' }}>● IMMEDIATE: {immediateCount}</span>
                <span style={{ color: '#d4a373' }}>● DELAYED: {delayedCount}</span>
                <span style={{ color: '#588157' }}>● MINIMAL: {minimalCount}</span>
              </div>
            </div>

            {/* Sparkline Visual SVG */}
            <div style={{ width: '100%', height: '36px', margin: '4px 0 10px 0' }}>
              <svg viewBox="0 0 280 36" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                <defs>
                  <linearGradient id="med-sparkline-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#738a65" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#181d1a" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d="M 0,28 Q 35,22 70,24 T 140,12 T 210,14 T 280,4 L 280,36 L 0,36 Z"
                  fill="url(#med-sparkline-grad)"
                />
                <path
                  d="M 0,28 Q 35,22 70,24 T 140,12 T 210,14 T 280,4"
                  fill="none"
                  stroke="#738a65"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="280" cy="4" r="3.5" fill="#ff4d4f" stroke="#121614" strokeWidth="1.5" />
              </svg>
            </div>
          </div>

          <div
            style={{
              paddingTop: '12px',
              borderTop: '1px solid rgba(115, 138, 101, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  HEMODYNAMIC
                </p>
                <p
                  style={{
                    fontSize: '1.05rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: '#ff7875',
                  }}
                >
                  2 CRITICAL
                </p>
              </div>
              <div>
                <p style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  RESPIRATORY
                </p>
                <p
                  style={{
                    fontSize: '1.05rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: 'var(--highlight-amber, #d4a373)',
                  }}
                >
                  1 DISTRESS
                </p>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(91, 112, 80, 0.20)',
                border: '1px solid rgba(115, 138, 101, 0.35)',
                color: 'var(--accent-sage, #738a65)',
                fontSize: '0.70rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: '5px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>BOARD</span>
              <span className="tactical-arrow">→</span>
            </div>
          </div>
        </div>

        {/* CARD 2: Medical Facilities & Bed Capacity (Span 4) */}
        <div
          className="bento-card bento-col-4 bento-card-stagger"
          style={{ '--index': 2, cursor: 'pointer' } as React.CSSProperties}
          onClick={() => handleNavigateSubTab('facilities')}
          title="Click to view Medical Facilities"
        >
          <span className="corner-accent-tr" />
          <span className="corner-accent-bl" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: '#121614',
                    border: '1px solid rgba(115, 138, 101, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-sage, #738a65)',
                  }}
                >
                  <Building2 size={15} />
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-secondary, #94a192)',
                  }}
                >
                  Facility Bed Inventory
                </span>
              </div>
              <span className="tactical-badge tactical-badge-secure">{INITIAL_FACILITIES.length} NODES</span>
            </div>

            {/* Circular Telemetry Dial Visual */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                margin: '12px 0 16px 0',
              }}
            >
              {/* Field Hospital Alpha */}
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #5b7050 0%, #44543b 100%)',
                  border: '2px solid #738a65',
                  boxShadow: '0 0 14px rgba(115, 138, 101, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
                title="Field Hospital Alpha: 12 Available Beds / 40 Total"
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    color: '#e9ece9',
                    lineHeight: 1,
                  }}
                >
                  12
                </span>
                <span style={{ fontSize: '0.52rem', fontFamily: 'var(--font-mono)', color: '#d4a373' }}>
                  ALPHA
                </span>
              </div>

              {/* Casualty Hub Bravo */}
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: '#121614',
                  border: '1px solid rgba(115, 138, 101, 0.40)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
                title="Casualty Hub Bravo: 4 Available Beds / 18 Total"
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    lineHeight: 1,
                  }}
                >
                  4
                </span>
                <span style={{ fontSize: '0.48rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  BRAVO
                </span>
              </div>

              {/* Intake Charlie */}
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#121614',
                  border: '1px solid rgba(255, 77, 79, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
                title="Intake Point Charlie: 0 Available Beds (FULL)"
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    color: '#ff7875',
                    lineHeight: 1,
                  }}
                >
                  0
                </span>
                <span style={{ fontSize: '0.45rem', fontFamily: 'var(--font-mono)', color: '#ff7875' }}>
                  FULL
                </span>
              </div>
            </div>
          </div>

          {/* Breakdown items */}
          <div
            style={{
              paddingTop: '10px',
              borderTop: '1px solid rgba(115, 138, 101, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.70rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#738a65' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Hospital Alpha (Surg: 1)</span>
              </div>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>12 Beds Avail</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d4a373' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Hub Bravo (Limited)</span>
              </div>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>4 Beds Avail</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff4d4f' }} />
                <span style={{ color: 'var(--text-secondary)' }}>Intake Charlie (At Cap)</span>
              </div>
              <span style={{ fontWeight: 700, color: '#ff7875' }}>0 Beds Avail</span>
            </div>
          </div>
        </div>

        {/* CARD 3: Tactical Medical Action Directives (Span 4) */}
        <div className="bento-card bento-card-olive bento-col-4 bento-card-stagger" style={{ '--index': 3 } as React.CSSProperties}>
          <span className="corner-accent-tr" />
          <span className="corner-accent-bl" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.20)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#e9ece9',
                  }}
                >
                  <ClipboardList size={15} />
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'rgba(233, 236, 233, 0.90)',
                  }}
                >
                  Medical Action Directives
                </span>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(0, 0, 0, 0.30)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#e9ece9',
                }}
              >
                {completedCount}/4 EXECUTED
              </span>
            </div>

            <h2
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.20rem',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.01em',
                marginBottom: '4px',
              }}
            >
              4 Clinical Directives
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.70rem',
                color: 'rgba(233, 236, 233, 0.78)',
                marginBottom: '14px',
              }}
            >
              Execute verified trauma triage protocols and evacuation corridors.
            </p>
          </div>

          {/* Interactive Directives List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleToggleTask(task.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: task.completed ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.20)',
                  border: `1px solid ${task.completed ? 'rgba(115, 138, 101, 0.50)' : 'rgba(255, 255, 255, 0.10)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                className="row-hover"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: task.completed ? '#588157' : 'rgba(255, 255, 255, 0.35)',
                      boxShadow: task.completed ? '0 0 8px #588157' : 'none',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: task.completed ? '#ffffff' : 'rgba(233, 236, 233, 0.85)',
                      textDecoration: task.completed ? 'line-through' : 'none',
                      opacity: task.completed ? 0.85 : 1,
                    }}
                  >
                    {task.title}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'rgba(233, 236, 233, 0.60)' }}>
                    [{task.code}]
                  </span>
                  <ChevronRight size={13} color="rgba(255, 255, 255, 0.40)" />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn-tactical btn-tactical-primary"
            onClick={(e) => {
              createWavefrontRipple(e);
              setModalNotice(
                'MEDICAL PROTOCOLS COMMITTED: Triage priority queue locked for Sector Trauma Network. Evacuation task alerts dispatched to mobile units.'
              );
            }}
            style={{ width: '100%', marginTop: '14px', padding: '7px 12px' }}
          >
            <span>COMMIT PROTOCOLS</span>
            <span className="tactical-arrow">→</span>
          </button>
        </div>

        {/* CARD 4: Evacuation Corridors & Road Hazards Bar Chart (Span 8) */}
        <div
          className="bento-card bento-col-8 bento-card-stagger"
          style={{ '--index': 4, cursor: 'pointer' } as React.CSSProperties}
          onClick={() => handleNavigateSubTab('routing')}
          title="Click to open Evacuation Routing"
        >
          <span className="corner-accent-tr" />
          <span className="corner-accent-bl" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: '#121614',
                    border: '1px solid rgba(212, 163, 115, 0.30)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--highlight-amber, #d4a373)',
                  }}
                >
                  <RouteIcon size={15} />
                </div>
                <div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-primary, #e9ece9)',
                    }}
                  >
                    Evacuation Corridor Transit Times & Hazards
                  </span>
                  <p style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    GROUND EVACUATION NETWORK // 8 MONITORED ARTERIAL ROUTES
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  className="meta-coord"
                  style={{
                    fontSize: '0.68rem',
                    background: 'rgba(18, 22, 20, 0.70)',
                    border: '1px solid rgba(115, 138, 101, 0.20)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                  }}
                >
                  Avg Evac Time: <strong style={{ color: '#e9ece9' }}>12.4 min</strong>
                </div>
                <div
                  className="meta-coord"
                  style={{
                    fontSize: '0.68rem',
                    background: 'rgba(255, 77, 79, 0.12)',
                    border: '1px solid rgba(255, 77, 79, 0.35)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    color: '#ff7875',
                  }}
                >
                  Hazards: {blockedHazardsCount} Blocked (Detour Active)
                </div>
              </div>
            </div>

            {/* Clean SVG Bar Chart with Hover Telemetry */}
            <div style={{ height: '170px', width: '100%', position: 'relative', marginTop: '12px' }}>
              <svg viewBox="0 0 600 150" style={{ width: '100%', height: '100%' }}>
                {/* Grid guidelines */}
                <line x1="40" y1="20" x2="580" y2="20" stroke="rgba(115, 138, 101, 0.12)" strokeDasharray="3 3" />
                <line x1="40" y1="60" x2="580" y2="60" stroke="rgba(115, 138, 101, 0.12)" strokeDasharray="3 3" />
                <line x1="40" y1="100" x2="580" y2="100" stroke="rgba(115, 138, 101, 0.12)" strokeDasharray="3 3" />
                <line x1="40" y1="130" x2="580" y2="130" stroke="rgba(115, 138, 101, 0.20)" />

                {/* Y-axis labels */}
                <text x="32" y="24" fill="#94a192" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">35m</text>
                <text x="32" y="64" fill="#94a192" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">20m</text>
                <text x="32" y="104" fill="#94a192" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">10m</text>
                <text x="32" y="133" fill="#94a192" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">0m</text>

                {/* Bars */}
                {corridorData.map((d, i) => {
                  const barWidth = 36;
                  const x = 50 + i * 66;
                  const maxH = 100;
                  const h = d.val * maxH;
                  const y = 130 - h;
                  const isBlocked = d.status === 'BLOCKED';
                  const isHovered = hoveredBarIndex === i;

                  return (
                    <g
                      key={d.label}
                      onMouseEnter={() => setHoveredBarIndex(i)}
                      onMouseLeave={() => setHoveredBarIndex(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Bar rectangle */}
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={h}
                        rx="4"
                        fill={isBlocked ? '#ff4d4f' : isHovered ? '#738a65' : '#273428'}
                        stroke={isBlocked ? '#ff7875' : isHovered ? '#738a65' : 'rgba(115, 138, 101, 0.35)'}
                        strokeWidth="1"
                        style={{ transition: 'all 0.15s ease' }}
                      />

                      {/* X label */}
                      <text
                        x={x + barWidth / 2}
                        y="144"
                        fill={isHovered ? '#e9ece9' : '#94a192'}
                        fontSize="8.5"
                        fontFamily="var(--font-mono)"
                        textAnchor="middle"
                        fontWeight={isHovered ? 700 : 500}
                      >
                        {d.label}
                      </text>

                      {/* Hover / Peak value readout */}
                      {(isHovered || isBlocked) && (
                        <text
                          x={x + barWidth / 2}
                          y={y - 5}
                          fill={isBlocked ? '#ff7875' : '#e9ece9'}
                          fontSize="9.5"
                          fontFamily="var(--font-mono)"
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          {d.eta}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div
            style={{
              paddingTop: '10px',
              borderTop: '1px solid rgba(115, 138, 101, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
            }}
          >
            <span>Hazard Alert: Bridge Alpha Span structural collapse · Active Detour: Route Alpha (Highway 9)</span>
            <button
              type="button"
              className="btn-tactical btn-tactical-ghost"
              onClick={(e) => {
                e.stopPropagation();
                createWavefrontRipple(e);
                handleNavigateSubTab('routing');
              }}
              style={{ padding: '3px 8px', fontSize: '0.65rem' }}
            >
              <span>Inspect Routing & Detours</span>
              <span className="tactical-arrow">→</span>
            </button>
          </div>
        </div>

        {/* CARD 5: Active Transport Fleet (Ground Ambulance & Air Medevac) (Span 4) */}
        <div
          className="bento-card bento-col-4 bento-card-stagger"
          style={{ '--index': 5, cursor: 'pointer' } as React.CSSProperties}
          onClick={() => handleNavigateSubTab('dispatch')}
          title="Click to view Transport Dispatch"
        >
          <span className="corner-accent-tr" />
          <span className="corner-accent-bl" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: '#121614',
                    border: '1px solid rgba(115, 138, 101, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-sage, #738a65)',
                  }}
                >
                  <Ambulance size={15} />
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.70rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-secondary, #94a192)',
                  }}
                >
                  Medevac Transport Fleet
                </span>
              </div>
              <span className="tactical-badge tactical-badge-online">3 UNITS ONLINE</span>
            </div>

            <h3
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.05rem',
                fontWeight: 700,
                color: 'var(--text-primary, #e9ece9)',
                lineHeight: 1.2,
                marginBottom: '4px',
              }}
            >
              AMB-02 Dispatched En Route
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-secondary, #94a192)',
                marginBottom: '14px',
              }}
            >
              Assigned to SOL-001 (Aarav) (Immediate) · Destination: Field Hospital Alpha · ETA 11m
            </p>

            {/* Transport Unit Tactical HUD Box */}
            <div
              style={{
                background: '#121614',
                border: '1px solid rgba(115, 138, 101, 0.22)',
                borderRadius: '10px',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '8px',
                  background: 'rgba(91, 112, 80, 0.20)',
                  border: '1px solid #738a65',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-sage, #738a65)',
                  flexShrink: 0,
                }}
              >
                <Stethoscope size={22} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    ALS TRAUMA READINESS
                  </span>
                  <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: '#d4a373', fontWeight: 700 }}>
                    92%
                  </span>
                </div>
                <div className="tactical-progress-track">
                  <div className="tactical-progress-fill" style={{ width: '92%' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span style={{ fontSize: '0.58rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    AIR-EVAC-1: STANDBY
                  </span>
                  <span style={{ fontSize: '0.58rem', fontFamily: 'var(--font-mono)', color: '#588157' }}>
                    READY
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-tactical btn-tactical-olive"
              onClick={(e) => {
                e.stopPropagation();
                handleNavigateSubTab('dispatch');
              }}
              style={{ flex: 1, padding: '7px 10px' }}
            >
              DISPATCH UNIT
            </button>
            <button
              type="button"
              className="btn-tactical btn-tactical-ghost"
              onClick={(e) => {
                e.stopPropagation();
                setModalNotice(
                  'TRANSPORT FLEET SPECS: MEDIC-ONE (Ground ALS) // MEDIC-TWO (Ground BLS - Active Mission) // AIR-EVAC-1 (UH-60 Medevac Helicopter - Helipad Alpha ready) // Oxygen & Trauma Kits 100% full.'
                );
              }}
              style={{ padding: '7px 12px' }}
            >
              SPECS
            </button>
          </div>
        </div>

        {/* CARD 6: Golden Hour Compliance & Regional Coverage (Span 4) */}
        <div className="bento-col-4 bento-card-stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', '--index': 6 } as React.CSSProperties}>
          {/* Subcard A: Golden Hour Compliance */}
          <div className="bento-card" style={{ padding: '14px' }}>
            <span className="corner-accent-tr" />
            <span className="corner-accent-bl" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                GOLDEN HOUR
              </span>
              <span
                style={{
                  fontSize: '0.60rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent-sage, #738a65)',
                  background: 'rgba(91, 112, 80, 0.20)',
                  padding: '2px 5px',
                  borderRadius: '3px',
                }}
              >
                TARGET &lt;60m
              </span>
            </div>
            <div style={{ margin: '8px 0' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '2.1rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  lineHeight: 1,
                }}
              >
                96.4%
              </span>
            </div>
            <div
              style={{
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Clock size={12} color="#d4a373" />
              <span>Compliant Evac</span>
            </div>
          </div>

          {/* Subcard B: Corridor Integrity */}
          <div className="bento-card" style={{ padding: '14px' }}>
            <span className="corner-accent-tr" />
            <span className="corner-accent-bl" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                CORRIDORS OPEN
              </span>
              <span
                style={{
                  fontSize: '0.60rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#588157',
                  background: 'rgba(88, 129, 87, 0.15)',
                  padding: '2px 5px',
                  borderRadius: '3px',
                }}
              >
                Nominal
              </span>
            </div>
            <div style={{ margin: '8px 0' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '2.1rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  lineHeight: 1,
                }}
              >
                85%
              </span>
            </div>
            <div
              style={{
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Shield size={12} color="#738a65" />
              <span>7 of 8 Routes</span>
            </div>
          </div>
        </div>

        {/* CARD 7: Quick Jump MediRoute Command Subsystems (Span 8) */}
        <div className="bento-card bento-col-8 bento-card-stagger" style={{ padding: '14px 18px', '--index': 7 } as React.CSSProperties}>
          <span className="corner-accent-tr" />
          <span className="corner-accent-bl" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.70rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary, #94a192)',
              }}
            >
              MediRoute Medical Operations Modules
            </span>
            <span className="tactical-badge tactical-badge-secure">C2 MED LINK ACTIVE</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <button
              type="button"
              className="btn-tactical"
              onClick={() => handleNavigateSubTab('triage')}
              style={{ flexDirection: 'column', padding: '10px 8px', gap: '4px', height: '100%' }}
            >
              <ClipboardList size={18} color="var(--accent-sage, #738a65)" />
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>TRIAGE BOARD</span>
              <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)' }}>{immediateCount} Immediate / {delayedCount} Delayed</span>
            </button>

            <button
              type="button"
              className="btn-tactical"
              onClick={() => handleNavigateSubTab('routing')}
              style={{ flexDirection: 'column', padding: '10px 8px', gap: '4px', height: '100%' }}
            >
              <RouteIcon size={18} color="var(--highlight-amber, #d4a373)" />
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>EVAC ROUTING</span>
              <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)' }}>{blockedHazardsCount} Hazards Avoided</span>
            </button>

            <button
              type="button"
              className="btn-tactical"
              onClick={() => handleNavigateSubTab('facilities')}
              style={{ flexDirection: 'column', padding: '10px 8px', gap: '4px', height: '100%' }}
            >
              <Building2 size={18} color="#588157" />
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>FACILITIES</span>
              <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)' }}>{availableBeds}/{totalBeds} Beds Avail</span>
            </button>

            <button
              type="button"
              className="btn-tactical"
              onClick={() => handleNavigateSubTab('dispatch')}
              style={{ flexDirection: 'column', padding: '10px 8px', gap: '4px', height: '100%' }}
            >
              <Ambulance size={18} color="#738a65" />
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>DISPATCH</span>
              <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)' }}>Ground & Air Fleet</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Tactical Modal Notification Dialog */}
      {modalNotice && (
        <div className="tactical-modal-overlay" onClick={() => setModalNotice(null)}>
          <div className="tactical-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '6px',
                  background: 'rgba(91, 112, 80, 0.20)',
                  border: '1px solid #738a65',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-sage, #738a65)',
                }}
              >
                <Terminal size={17} />
              </div>
              <div>
                <h4
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#e9ece9',
                    letterSpacing: '0.04em',
                  }}
                >
                  MediRoute Tactical System Notice
                </h4>
                <p style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  SECURE MEDICAL TELEMETRY // OP-MED_01
                </p>
              </div>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.74rem',
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                background: '#121614',
                border: '1px solid rgba(115, 138, 101, 0.22)',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '18px',
              }}
            >
              {modalNotice}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-tactical btn-tactical-olive"
                onClick={() => setModalNotice(null)}
              >
                ACKNOWLEDGE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
