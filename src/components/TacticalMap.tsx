import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  IncidentReport,
  TelemetryTrack,
  RestrictedAirspaceZone,
  RoadHazardEdge,
  EvacuationNode,
  CalculatedRoute,
  SharedMapMarker,
} from '@shared/types';
import {
  Maximize2,
  Minimize2,
  Plus,
  Minus,
  Crosshair,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { classifyTrack, TRACK_CLASSIFICATION_LABELS } from '../utils/trackClassification';
import { formatSpeed, formatAltitude } from '../utils/units';

export interface TacticalMapProps {
  incidents?: IncidentReport[];
  tracks?: TelemetryTrack[];
  zones?: RestrictedAirspaceZone[];
  nodes?: EvacuationNode[];
  edges?: RoadHazardEdge[];
  markers?: SharedMapMarker[];
  activeRoute?: CalculatedRoute | null;
  selectedEntityId?: string | null;
  onSelectEntity?: (entity: { type: string; id: string; raw: any }) => void;
  height?: string;
  showRadarSweep?: boolean;
  initialMode?: 'chart' | 'radar' | 'thermal';
  topLeftContent?: React.ReactNode;
  bottomLeftContent?: React.ReactNode;
  topRightContent?: React.ReactNode;
  activeMode?: 'chart' | 'radar' | 'thermal';
  onModeChange?: (mode: 'chart' | 'radar' | 'thermal') => void;
}

interface BoundingBox2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function boxesIntersect(a: BoundingBox2D, b: BoundingBox2D): boolean {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}



export const TacticalMap: React.FC<TacticalMapProps> = ({
  incidents = [],
  tracks = [],
  zones = [],
  nodes = [],
  edges = [],
  markers = [],
  activeRoute = null,
  selectedEntityId = null,
  onSelectEntity,
  height = '100%',
  showRadarSweep = true,
  initialMode = 'chart',
  topLeftContent,
  bottomLeftContent,
  topRightContent,
  activeMode,
  onModeChange,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [sweepActive] = useState(showRadarSweep);

  const [internalMode, setInternalMode] = useState<'topo' | 'ppi' | 'flir'>(
    initialMode === 'radar' ? 'ppi' : initialMode === 'thermal' ? 'flir' : 'topo'
  );

  const radarMode = activeMode
    ? activeMode === 'radar'
      ? 'ppi'
      : activeMode === 'thermal'
      ? 'flir'
      : 'topo'
    : internalMode;

  const handleSetMode = (mode: 'topo' | 'ppi' | 'flir') => {
    setInternalMode(mode);
    if (onModeChange) {
      onModeChange(mode === 'ppi' ? 'radar' : mode === 'flir' ? 'thermal' : 'chart');
    }
  };

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mouseCoord, setMouseCoord] = useState<{ lat: string; lng: string; elev: string }>({
    lat: '34.0600 N',
    lng: '118.2450 W',
    elev: '84 m MSL',
  });

  const [activeLayers, setActiveLayers] = useState({
    incidents: true,
    airspace: true,
    zones: true,
    routes: true,
    grid: true,
    rangeRings: true,
    terrain: false,
  });

  // Collapsible Layers panel (collapsed by default below 1100px width or 700px height)
  const [isLayersCollapsed, setIsLayersCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1100 || window.innerHeight < 700;
    }
    return false;
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Wheel Scrolling Zoom Handler (Smooth zooming on mouse wheel centered on cursor)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.14 : 0.88;
      setZoom((z) => Math.min(Math.max(Number((z * zoomFactor).toFixed(3)), 0.4), 4.5));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Map and radar resize observer: recompute viewport size and maintain scope centering
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    let rAFId: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        // Preserves zoom & pan while syncing measured dimensions
      });
    });

    observer.observe(container);

    const handleTransitionEnd = () => {
      cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {});
    };

    window.addEventListener('transitionend', handleTransitionEnd);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rAFId);
      window.removeEventListener('transitionend', handleTransitionEnd);
    };
  }, []);

  // Center coordinate around Los Angeles Tactical Sector Demo: ~34.060, -118.245
  const centerLat = 34.060;
  const centerLng = -118.245;
  const scale = 11000 * zoom;

  const project = useCallback(
    (lat: number, lng: number) => {
      const x = 500 + (lng - centerLng) * scale + pan.x;
      const y = 350 - (lat - centerLat) * scale + pan.y;
      return { x, y };
    },
    [scale, pan.x, pan.y]
  );

  const unproject = useCallback(
    (x: number, y: number) => {
      const lng = centerLng + (x - 500 - pan.x) / scale;
      const lat = centerLat - (y - 350 - pan.y) / scale;
      return { lat, lng };
    },
    [scale, pan.x, pan.y]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * 1000;
      const svgY = ((e.clientY - rect.top) / rect.height) * 680;
      const geo = unproject(svgX, svgY);
      setMouseCoord({
        lat: `${geo.lat.toFixed(4)} N`,
        lng: `${Math.abs(geo.lng).toFixed(4)} W`,
        elev: `${Math.round(75 + Math.sin(geo.lat * 100) * 40)} m MSL`,
      });
    }

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // Touch Support: One-finger pan & Two-finger pinch zoom
  const touchStateRef = useRef<{ x: number; y: number; dist?: number }>({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStateRef.current = { x: t.clientX - pan.x, y: t.clientY - pan.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStateRef.current = { x: pan.x, y: pan.y, dist: Math.hypot(dx, dy) };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      setPan({
        x: t.clientX - touchStateRef.current.x,
        y: t.clientY - touchStateRef.current.y,
      });
    } else if (e.touches.length === 2 && touchStateRef.current.dist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scaleFactor = dist / touchStateRef.current.dist;
      touchStateRef.current.dist = dist;
      setZoom((z) => Math.min(Math.max(Number((z * scaleFactor).toFixed(3)), 0.4), 4.5));
    }
  };

  const toggleLayer = (layer: keyof typeof activeLayers) => {
    setActiveLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const centerPt = { x: 500 + pan.x, y: 350 + pan.y };
  const scopeRadius = 275 * zoom;

  const createSweepWedgePath = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    const x2 = cx - Math.sin(rad) * r;
    const y2 = cy - Math.cos(rad) * r;
    return `M ${cx},${cy} L ${cx},${cy - r} A ${r},${r} 0 0,0 ${x2},${y2} Z`;
  };

  const computedHeight = isFullscreen ? '100vh' : height;

  // Map label declutter with 8-candidate offsets & leader line
  const CANDIDATE_OFFSETS = useMemo(
    () => [
      { dx: 18, dy: -20, anchorX: -12, anchorY: 14 },  // 1: Top-Right (default aviation FDB)
      { dx: 18, dy: 6, anchorX: -12, anchorY: 2 },     // 2: Bottom-Right
      { dx: 18, dy: -8, anchorX: -12, anchorY: 0 },    // 3: Mid-Right
      { dx: -110, dy: -20, anchorX: 100, anchorY: 14 }, // 4: Top-Left
      { dx: -110, dy: 6, anchorX: 100, anchorY: 2 },   // 5: Bottom-Left
      { dx: -110, dy: -8, anchorX: 100, anchorY: 0 },  // 6: Mid-Left
      { dx: -45, dy: -36, anchorX: 0, anchorY: 26 },   // 7: Top-Center
      { dx: -45, dy: 22, anchorX: 0, anchorY: -10 },   // 8: Bottom-Center
    ],
    []
  );

  const computedTrackLayouts = useMemo(() => {
    const placedBoxes: BoundingBox2D[] = [];
    const layouts = new Map<
      string,
      { offset: (typeof CANDIDATE_OFFSETS)[0]; collapsed: boolean; boxW: number; boxH: number }
    >();

    // Prioritize selected first, then hostile/critical, then others
    const sortedTracks = [...tracks].sort((a, b) => {
      if (a.id === selectedEntityId) return -1;
      if (b.id === selectedEntityId) return 1;
      const aCrit = a.status === 'hostile' || a.status === 'suspicious' ? 1 : 0;
      const bCrit = b.status === 'hostile' || b.status === 'suspicious' ? 1 : 0;
      return bCrit - aCrit;
    });

    for (const track of sortedTracks) {
      const pos = project(track.lat, track.lng);
      const isSelected = track.id === selectedEntityId;
      const isHostile = track.status === 'hostile' || track.status === 'suspicious';
      const boxW = 95;
      const boxH = 26;

      let chosenOffset = CANDIDATE_OFFSETS[0];
      let collided = true;

      for (const off of CANDIDATE_OFFSETS) {
        const box: BoundingBox2D = {
          x1: pos.x + off.dx,
          y1: pos.y + off.dy - 12,
          x2: pos.x + off.dx + boxW,
          y2: pos.y + off.dy - 12 + boxH,
        };

        const hasCollision = placedBoxes.some((b) => boxesIntersect(box, b));
        if (!hasCollision) {
          chosenOffset = off;
          collided = false;
          placedBoxes.push(box);
          break;
        }
      }

      if (collided) {
        // High priority keeps chosen offset anyway, lower priority collapses to callsign only
        const collapse = !isSelected && !isHostile;
        layouts.set(track.id, {
          offset: chosenOffset,
          collapsed: collapse,
          boxW: collapse ? 65 : boxW,
          boxH: collapse ? 16 : boxH,
        });
        if (!collapse) {
          placedBoxes.push({
            x1: pos.x + chosenOffset.dx,
            y1: pos.y + chosenOffset.dy - 12,
            x2: pos.x + chosenOffset.dx + boxW,
            y2: pos.y + chosenOffset.dy - 12 + boxH,
          });
        }
      } else {
        layouts.set(track.id, {
          offset: chosenOffset,
          collapsed: false,
          boxW,
          boxH,
        });
      }
    }

    return layouts;
  }, [tracks, selectedEntityId, project, CANDIDATE_OFFSETS]);

  return (
    <div
      ref={containerRef}
      className="map-container"
      style={{
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : undefined,
        left: isFullscreen ? 0 : undefined,
        right: isFullscreen ? 0 : undefined,
        bottom: isFullscreen ? 0 : undefined,
        zIndex: isFullscreen ? 9999 : 1,
        height: computedHeight,
        width: '100%',
        backgroundColor: radarMode === 'ppi' ? '#060A09' : 'var(--bg-canvas, #060A09)',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 0.25s ease',
        touchAction: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => {}}
    >
      {/* 4-Region Map Grid Overlay Layer */}
      <div className="map-overlay-layer">
        {/* Top-Left: Metrics & Mode Switch in ONE Unified Flex Toolbar */}
        <div className="map-overlay-tl">
          {topLeftContent}

          {/* Mode Switcher Segmented Control */}
          <div
            style={{
              display: 'inline-flex',
              border: 'var(--border-width, 1.2px) solid var(--color-edge)',
              boxShadow: 'var(--shadow-flat-sm)',
              background: 'var(--color-sheet)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              pointerEvents: 'auto',
              flexShrink: 0,
            }}
            onClick={(e) => e.stopPropagation()}
            role="group"
            aria-label="Map Display Modes"
          >
            <button
              type="button"
              onClick={() => handleSetMode('topo')}
              style={{
                background: radarMode === 'topo' ? 'var(--color-strip)' : 'transparent',
                color: radarMode === 'topo' ? '#FFFFFF' : 'var(--text-primary)',
                border: 'none',
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Cartographic Terrain Chart"
            >
              Chart
            </button>
            <button
              type="button"
              onClick={() => handleSetMode('ppi')}
              style={{
                background: radarMode === 'ppi' ? 'var(--color-strip)' : 'transparent',
                color: radarMode === 'ppi' ? '#FFFFFF' : 'var(--text-primary)',
                border: 'none',
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                cursor: 'pointer',
                borderLeft: '1px solid var(--color-edge)',
                borderRight: '1px solid var(--color-edge)',
              }}
              title="Plan Position Indicator (PPI) Radar Scope"
            >
              Radar
            </button>
            <button
              type="button"
              onClick={() => handleSetMode('flir')}
              style={{
                background: radarMode === 'flir' ? 'var(--color-strip)' : 'transparent',
                color: radarMode === 'flir' ? '#FFFFFF' : 'var(--text-primary)',
                border: 'none',
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Forward Looking Infrared (FLIR) Thermal Sensor"
            >
              Thermal
            </button>
          </div>
        </div>

        {/* Top-Right Region */}
        <div className="map-overlay-tr">
          {topRightContent}
        </div>

        {/* Bottom-Left Region: Stack of Collapsible Panels */}
        <div className="map-overlay-bl">
          {/* Coordinates Readout */}
          <div
            className="coord-value"
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.02em',
              pointerEvents: 'none',
              padding: '2px 0',
            }}
          >
            {mouseCoord.lat} {mouseCoord.lng} {mouseCoord.elev}
          </div>

          {/* Module-Specific Bottom-Left Panels (e.g. New Incident Report, Road Hazards) */}
          {bottomLeftContent}

          {/* Collapsible Layers Panel */}
          {isLayersCollapsed ? (
            <button
              type="button"
              className="overlay-chip-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsLayersCollapsed(false);
              }}
              title="Expand Layers panel"
            >
              <Layers size={13} color="var(--accent)" />
              <span>Layers</span>
              <ChevronUp size={12} />
            </button>
          ) : (
            <div
              className="overlay-collapsible-panel"
              style={{ width: '150px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '6px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  Layers
                </span>
                <button
                  type="button"
                  onClick={() => setIsLayersCollapsed(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Collapse Layers"
                  aria-label="Collapse Layers"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.74rem' }}>
                {(
                  [
                    ['incidents', 'Incidents'],
                    ['airspace', 'Airspace'],
                    ['zones', 'Zones'],
                    ['routes', 'Routes'],
                    ['grid', 'Grid'],
                    ['rangeRings', 'Range rings'],
                    ['terrain', 'Terrain'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={activeLayers[key]}
                      onChange={() => toggleLayer(key)}
                      style={{
                        accentColor: 'var(--accent)',
                        cursor: 'pointer',
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom-Right Region: Zoom / Controls Stack */}
        <div className="map-overlay-br">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn btn-sm"
              style={{ width: '32px', height: '32px', minWidth: '32px', padding: 0 }}
              title="Zoom in"
              onClick={() => setZoom((z) => Math.min(Number((z * 1.25).toFixed(3)), 4.5))}
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ width: '32px', height: '32px', minWidth: '32px', padding: 0 }}
              title="Zoom out"
              onClick={() => setZoom((z) => Math.max(Number((z * 0.8).toFixed(3)), 0.4))}
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ width: '32px', height: '32px', minWidth: '32px', padding: 0 }}
              title="Recenter"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <Crosshair size={15} />
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ width: '32px', height: '32px', minWidth: '32px', padding: 0 }}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* Main SVG Tactical Canvas */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1000 680"
        style={{ display: 'block', flex: 1 }}
      >
        <defs>
          {/* Circular Scope Clip Path for PPI & FLIR Radar modes */}
          <clipPath id="radar-scope-circle">
            <circle cx={centerPt.x} cy={centerPt.y} r={scopeRadius} />
          </clipPath>
        </defs>

        {/* Tactical Grid (Letters A-E and Numbers 31-37, Chart mode only) */}
        {activeLayers.grid && radarMode === 'topo' && (
          <g opacity={0.35}>
            {[130, 240, 350, 460, 570].map((y, i) => (
              <g key={`grid-h-${i}`}>
                <line x1="0" y1={y} x2="1000" y2={y} stroke="var(--color-grid)" strokeWidth="0.8" strokeDasharray="3 3" />
                <text x="8" y={y + 12} fill="var(--color-grid)" fontSize="9" fontWeight="700">
                  {String.fromCharCode(65 + i)}
                </text>
              </g>
            ))}
            {[140, 280, 420, 560, 700, 840].map((x, i) => (
              <g key={`grid-v-${i}`}>
                <line x1={x} y1="0" x2={x} y2="680" stroke="var(--color-grid)" strokeWidth="0.8" strokeDasharray="3 3" />
                <text x={x + 4} y="16" fill="var(--color-grid)" fontSize="9" fontWeight="700">
                  {31 + i}
                </text>
              </g>
            ))}
          </g>
        )}


        {/* Clean Modern Radar Scope Bezel */}
        {(radarMode === 'ppi' || radarMode === 'flir') && (
          <g pointerEvents="none">
            {/* Outer dark scope housing & border */}
            <circle
              cx={centerPt.x}
              cy={centerPt.y}
              r={scopeRadius}
              fill="#060A09"
              stroke="#263D37"
              strokeWidth="1.5"
            />

            {/* 4 Cardinal Markers */}
            <text x={centerPt.x} y={centerPt.y - scopeRadius - 8} fill="#00E676" fontSize="11" fontFamily="var(--font-heading)" fontWeight="700" textAnchor="middle">N</text>
            <text x={centerPt.x + scopeRadius + 14} y={centerPt.y + 4} fill="#546E66" fontSize="11" fontFamily="var(--font-heading)" fontWeight="600" textAnchor="middle">E</text>
            <text x={centerPt.x} y={centerPt.y + scopeRadius + 16} fill="#546E66" fontSize="11" fontFamily="var(--font-heading)" fontWeight="600" textAnchor="middle">S</text>
            <text x={centerPt.x - scopeRadius - 14} y={centerPt.y + 4} fill="#546E66" fontSize="11" fontFamily="var(--font-heading)" fontWeight="600" textAnchor="middle">W</text>
          </g>
        )}

        {/* Content Inside Radar Scope or Chart Canvas */}
        <g clipPath={radarMode === 'ppi' || radarMode === 'flir' ? 'url(#radar-scope-circle)' : undefined}>
          {/* Clean Concentric Range Rings */}
          {activeLayers.rangeRings && (
            <g pointerEvents="none">
              {[0.33, 0.66, 1.0].map((ratio, idx) => {
                const r = scopeRadius * ratio;
                const km = (idx + 1) * 5;

                return (
                  <g key={`ring-${idx}`}>
                    <circle
                      cx={centerPt.x}
                      cy={centerPt.y}
                      r={r}
                      fill="none"
                      stroke={radarMode === 'ppi' ? '#263D37' : '#14221E'}
                      strokeWidth="1"
                    />
                    <text
                      x={centerPt.x + 6}
                      y={centerPt.y - r + 12}
                      fill="#546E66"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      fontWeight="600"
                    >
                      {km} km
                    </text>
                  </g>
                );
              })}

              {/* Clean Subtle Axes */}
              <line
                x1={centerPt.x - scopeRadius}
                y1={centerPt.y}
                x2={centerPt.x + scopeRadius}
                y2={centerPt.y}
                stroke="#14221E"
                strokeWidth="1"
              />
              <line
                x1={centerPt.x}
                y1={centerPt.y - scopeRadius}
                x2={centerPt.x}
                y2={centerPt.y + scopeRadius}
                stroke="#14221E"
                strokeWidth="1"
              />
            </g>
          )}

          {/* Restricted Airspace Zones */}
          {activeLayers.zones &&
            zones.map((zone) => {
              const pos = project(zone.center.lat, zone.center.lng);
              const radiusPx = zone.radiusKm * 40 * zoom;

              return (
                <g key={zone.id} pointerEvents="none">
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radiusPx}
                    fill="rgba(255, 59, 92, 0.08)"
                    stroke="#FF3B5C"
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={pos.x}
                    y={pos.y - radiusPx - 6}
                    fill="#FF3B5C"
                    fontSize="9"
                    fontFamily="var(--font-heading)"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {zone.name}
                  </text>
                </g>
              );
            })}

          {/* Road Network Corridors & Hazards (MediRoute) */}
          {activeLayers.routes &&
            edges.map((edge) => {
              const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
              const toNode = nodes.find((n) => n.id === edge.toNodeId);
              if (!fromNode || !toNode) return null;

              const p1 = project(fromNode.coordinates.lat, fromNode.coordinates.lng);
              const p2 = project(toNode.coordinates.lat, toNode.coordinates.lng);
              const isRouteEdge = activeRoute?.edgesTraversed.includes(edge.id);

              return (
                <g key={edge.id}>
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={
                      edge.blocked
                        ? 'rgba(255, 59, 92, 0.6)'
                        : isRouteEdge
                        ? '#2DD4BF'
                        : '#263D37'
                    }
                    strokeWidth={isRouteEdge ? 3 : edge.blocked ? 1.8 : 1.4}
                    strokeDasharray={edge.blocked ? '4 3' : undefined}
                  />

                  {edge.blocked && (
                    <g transform={`translate(${(p1.x + p2.x) / 2}, ${(p1.y + p2.y) / 2})`}>
                      <line x1="-5" y1="-5" x2="5" y2="5" stroke="#FF3B5C" strokeWidth="2" />
                      <line x1="-5" y1="5" x2="5" y2="-5" stroke="#FF3B5C" strokeWidth="2" />
                    </g>
                  )}
                </g>
              );
            })}

          {/* Evacuation Nodes & Medical Facilities */}
          {activeLayers.routes &&
            nodes.map((node) => {
              const pos = project(node.coordinates.lat, node.coordinates.lng);
              const isHospital = node.type === 'hospital';

              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEntity?.({ type: 'node', id: node.id, raw: node });
                  }}
                >
                  <title>{node.name} ({node.type})</title>
                  {isHospital ? (
                    <g transform="translate(-9, -9)">
                      <rect
                        x="0"
                        y="0"
                        width="18"
                        height="18"
                        fill="var(--bg-card, #131E1B)"
                        stroke="#00E676"
                        strokeWidth="1.2"
                        rx="3"
                      />
                      <rect x="7.5" y="3.5" width="3" height="11" fill="#00E676" />
                      <rect x="3.5" y="7.5" width="11" height="3" fill="#00E676" />
                    </g>
                  ) : (
                    <g>
                      <circle
                        r="8"
                        fill="var(--bg-card, #131E1B)"
                        stroke="#38BDF8"
                        strokeWidth="1.2"
                      />
                      <text
                        y="3"
                        fill="#38BDF8"
                        fontSize="8"
                        fontFamily="var(--font-heading)"
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        {node.name.charAt(0)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

          {/* FieldLink Ground Incidents */}
          {activeLayers.incidents &&
            incidents.map((inc) => {
              const pos = project(inc.location.lat, inc.location.lng);

              return (
                <g
                  key={inc.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEntity?.({ type: 'incident', id: inc.id, raw: inc });
                  }}
                >
                  <title>{inc.title}</title>
                  <circle r="7" fill="rgba(255, 59, 92, 0.2)" stroke="#FF3B5C" strokeWidth="1.2" />
                  <circle r="3" fill="#FF3B5C" />
                  <text
                    x="10"
                    y="3"
                    fill="var(--text-primary, #F0FDF4)"
                    fontSize="8.5"
                    fontFamily="var(--font-heading)"
                    fontWeight="600"
                  >
                    {inc.id}
                  </text>
                </g>
              );
            })}

          {/* SkyWatch Airspace Telemetry Tracks */}
          {activeLayers.airspace &&
            tracks.map((track) => {
              const pos = project(track.lat, track.lng);
              const classification = classifyTrack(track);
              const isHostile = classification === 'HOSTILE';
              const isFriendly = classification === 'FRIENDLY';
              const isNeutral = classification === 'CIVILIAN';
              const isSelected = selectedEntityId === track.id;

              return (
                <g
                  key={track.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEntity?.({ type: 'track', id: track.id, raw: track });
                  }}
                >
                  <title>{`${track.callsign} (${TRACK_CLASSIFICATION_LABELS[classification]}) - ${formatAltitude(track.altitude)}, ${formatSpeed(track.speed)}`}</title>

                  {/* Target Symbol */}
                  {isHostile ? (
                    <g>
                      {isSelected && (
                        <circle r="14" fill="none" stroke="#FF3B5C" strokeWidth="1" opacity="0.6">
                          <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <polygon
                        points="0,-8 8,0 0,8 -8,0"
                        fill="#FF3B5C"
                        stroke="#FFFFFF"
                        strokeWidth="1.2"
                      />
                    </g>
                  ) : isFriendly ? (
                    <g>
                      <polygon
                        points="0,-7 7,5 -7,5"
                        fill="#00E676"
                        stroke="#FFFFFF"
                        strokeWidth="1.2"
                      />
                    </g>
                  ) : isNeutral ? (
                    <g>
                      <circle
                        r="6"
                        fill="#38BDF8"
                        stroke="#FFFFFF"
                        strokeWidth="1.2"
                      />
                    </g>
                  ) : (
                    <g>
                      <circle
                        r="5"
                        fill="#FFB300"
                        stroke="#FFFFFF"
                        strokeWidth="1.2"
                      />
                    </g>
                  )}

                  {/* Clean Floating Callsign & Readout */}
                  <g transform="translate(12, -4)" pointerEvents="none">
                    <text
                      fill={isHostile ? '#FF3B5C' : '#F0FDF4'}
                      fontSize="9.5"
                      fontFamily="var(--font-heading)"
                      fontWeight="700"
                    >
                      {track.callsign}
                    </text>
                    <text
                      y="11"
                      fill="#546E66"
                      fontSize="8"
                      fontFamily="var(--font-mono)"
                    >
                      {formatAltitude(track.altitude)} · {formatSpeed(track.speed)}
                    </text>
                  </g>
                </g>
              );
            })}

          {/* Clean Rotating Radar Sweep Beam */}
          {(radarMode === 'ppi' || radarMode === 'flir') && sweepActive && (
            <g pointerEvents="none">
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`0 ${centerPt.x} ${centerPt.y}`}
                to={`360 ${centerPt.x} ${centerPt.y}`}
                dur="4s"
                repeatCount="indefinite"
              />
              <path
                d={createSweepWedgePath(centerPt.x, centerPt.y, scopeRadius, 25)}
                fill="rgba(0, 230, 118, 0.12)"
              />
              <line
                x1={centerPt.x}
                y1={centerPt.y}
                x2={centerPt.x}
                y2={centerPt.y - scopeRadius}
                stroke="#00E676"
                strokeWidth="1.5"
                strokeOpacity="0.85"
              />
            </g>
          )}

          {/* Shared Tactical Map Markers (FieldLink Mesh Sync) */}
          {(markers || []).map((marker) => {
            const pos = project(marker.location.lat, marker.location.lng);
            const isRally = marker.type === 'rally_point';
            const isContact = marker.type === 'contact';
            const color = isRally ? '#00E676' : isContact ? '#FF3B5C' : '#FFB300';

            return (
              <g
                key={marker.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEntity?.({ type: 'marker', id: marker.id, raw: marker });
                }}
              >
                <title>{`Tactical Marker [${marker.type.toUpperCase()}]: ${marker.label} • Node ${marker.createdByNode}`}</title>
                <circle r="8" fill="var(--bg-card, #131E1B)" stroke={color} strokeWidth="1.5" />
                <text y="3" fill={color} fontSize="8.5" fontFamily="var(--font-mono)" fontWeight="700" textAnchor="middle">
                  {isRally ? '⚑' : isContact ? '✕' : '▲'}
                </text>
                <text x="12" y="3" fill="var(--text-primary, #F0FDF4)" fontSize="8" fontFamily="var(--font-heading)" fontWeight="600">
                  {marker.label}
                </text>
              </g>
            );
          })}

          {/* Central Radar Origin Node */}
          <circle cx={centerPt.x} cy={centerPt.y} r="2.5" fill="#00E676" opacity="0.9" />
        </g>
      </svg>
    </div>
  );
};
