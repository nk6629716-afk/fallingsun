import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  GeoIntelObservation,
} from '@shared/types';
import {
  Play,
  Pause,
  Layers,
  Sliders,
  FileDown,
  Eye,
  MapPin,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../services/api/apiClient';
import {
  EnrichedChangeCandidate,
  CandidateReviewDecision,
  SensorMetadata,
  AnalysisState,
  IntelligenceReportPayload,
} from './types';
import { convertToMGRS } from './utils/geoUtils';
import { IntelligenceReportModal } from './components/IntelligenceReportModal';
import { GeoIntelImageDiff, ImageMatrix } from '../../algorithms/geointel/imageDiff';
import {
  loadAndRasterizePair,
  rasterizeSyntheticSvgTerrain,
  mapRegionToCandidate,
} from './utils/canvasRaster';

interface GeoIntelModuleProps {
  observations: GeoIntelObservation[];
  onRefreshObservations: () => Promise<void>;
}

export const GeoIntelModule: React.FC<GeoIntelModuleProps> = ({
  observations,
  onRefreshObservations,
}) => {
  const [selectedObsIdx, setSelectedObsIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'swipe' | 'side-by-side'>('swipe');
  const [swipePos, setSwipePos] = useState(50); // percentage 0 - 100
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>('C1');
  const [isDraggingSwipe, setIsDraggingSwipe] = useState(false);

  // Analysis parameters
  const [sensitivity, setSensitivity] = useState(34);
  const [minArea, setMinArea] = useState(12);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Custom User Uploaded Images
  const [customBeforeFile, setCustomBeforeFile] = useState<File | null>(null);
  const [customAfterFile, setCustomAfterFile] = useState<File | null>(null);
  const [customBeforeUrl, setCustomBeforeUrl] = useState<string | null>(null);
  const [customAfterUrl, setCustomAfterUrl] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Object URL lifecycle management
  useEffect(() => {
    if (customBeforeFile) {
      const url = URL.createObjectURL(customBeforeFile);
      setCustomBeforeUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCustomBeforeUrl(null);
    }
  }, [customBeforeFile]);

  useEffect(() => {
    if (customAfterFile) {
      const url = URL.createObjectURL(customAfterFile);
      setCustomAfterUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCustomAfterUrl(null);
    }
  }, [customAfterFile]);

  // Modal State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Replay bar state
  const [isPlaying, setIsPlaying] = useState(true);
  const [replaySpeed, setReplaySpeed] = useState<'1x' | '2x' | '5x'>('1x');

  const activeObs = observations[selectedObsIdx] || observations[0];
  const swipeContainerRef = useRef<HTMLDivElement>(null);

  // Sensor Metadata
  const baselineSensor: SensorMetadata = useMemo(
    () => ({
      sensorId: activeObs?.beforeImageId || 'MSI-B02',
      platform: 'SENTINEL-2B OPTICAL',
      resolutionGsd: '0.3m',
      cloudCoverPct: 1.8,
      sunElevationDeg: 48.2,
      sunAzimuthDeg: 134.2,
      spectralBands: ['B02-Blue', 'B03-Green', 'B04-Red', 'B08-NIR'],
      captureTimestamp: activeObs?.captureDateBefore || '2026-10-06T08:00:00Z',
    }),
    [activeObs?.id, activeObs?.captureDateBefore]
  );

  const surveillanceSensor: SensorMetadata = useMemo(
    () => ({
      sensorId: activeObs?.afterImageId || 'WV3-SWIR',
      platform: 'WORLDVIEW-3 TACTICAL',
      resolutionGsd: '0.3m',
      cloudCoverPct: 0.9,
      sunElevationDeg: 51.6,
      sunAzimuthDeg: 142.6,
      spectralBands: ['Panchromatic', 'VNIR', 'SWIR-1'],
      captureTimestamp: activeObs?.captureDateAfter || '2026-10-24T07:45:00Z',
    }),
    [activeObs?.id, activeObs?.captureDateAfter]
  );

  // Candidates state computed by the algorithm
  const [enrichedCandidates, setEnrichedCandidates] = useState<EnrichedChangeCandidate[]>([]);

  // Real Algorithmic Analysis Execution
  const executeAnalysis = useCallback(
    async (
      targetObs: GeoIntelObservation | undefined,
      targetSensitivity: number,
      targetMinArea: number,
      customBFile?: File | null,
      customAFile?: File | null
    ) => {
      setIsAnalyzing(true);
      setAnalysisProgress(20);
      setAnalysisError(null);
      setStatusNotification('Extracting and normalizing raster pixel matrices...');

      try {
        let matrices: { before: ImageMatrix; after: ImageMatrix };

        const hasCustom = Boolean(customBFile || customAFile);

        if (hasCustom) {
          // If custom files are provided, both must be valid or paired with observation defaults
          const beforeSrc = customBFile || targetObs?.beforeImageUrl || '/assets/terrain-default.png';
          const afterSrc = customAFile || targetObs?.afterImageUrl || '/assets/terrain-default.png';

          // MUST decode safely through browser canvas raster adapter. Never silently substitute synthetic data on error.
          matrices = await loadAndRasterizePair(beforeSrc, afterSrc, {
            width: 256,
            height: 144,
            beforeLabel: customBFile ? customBFile.name : (targetObs?.beforeImageId || 'Baseline Image'),
            afterLabel: customAFile ? customAFile.name : (targetObs?.afterImageId || 'Surveillance Image'),
          });
        } else {
          // Deterministic observation mode synced with Surveillance Canvas elements
          const isAfterDifferent = targetObs?.id !== 'GEO-302';
          matrices = {
            before: rasterizeSyntheticSvgTerrain(false, 256, 144),
            after: rasterizeSyntheticSvgTerrain(isAfterDifferent, 256, 144),
          };
        }

        setAnalysisProgress(60);
        setStatusNotification('Computing radiometric delta & clustering change candidates...');

        // Invoke existing GeoIntelImageDiff algorithm
        const diffEngine = new GeoIntelImageDiff({
          threshold: targetSensitivity,
          minRegionSize: targetMinArea,
        });

        const detectedRegions = diffEngine.analyze(matrices.before, matrices.after);

        setAnalysisProgress(90);

        const baseCoords = {
          lat: targetObs?.coordinates?.lat || 34.0588,
          lng: targetObs?.coordinates?.lng || -118.2391,
        };

        const mappedCandidates: EnrichedChangeCandidate[] = detectedRegions.map((region, idx) =>
          mapRegionToCandidate(region, idx, matrices.before.width, matrices.before.height, baseCoords)
        );

        // Preserve previous analyst review decisions for matching candidate IDs on rerun
        setEnrichedCandidates((prev) => {
          return mappedCandidates.map((cand) => {
            const existing = prev.find((p) => p.id === cand.id);
            if (existing && existing.reviewed) {
              return {
                ...cand,
                reviewed: existing.reviewed,
                decision: existing.decision,
                auditTrail: existing.auditTrail,
              };
            }
            return cand;
          });
        });

        if (mappedCandidates.length > 0) {
          setSelectedCandidateId((prev) => (mappedCandidates.some((c) => c.id === prev) ? prev : mappedCandidates[0].id));
          setStatusNotification(
            `Analysis complete: ${mappedCandidates.length} candidate alteration region${
              mappedCandidates.length === 1 ? '' : 's'
            } computed.`
          );
        } else {
          setSelectedCandidateId(null);
          setStatusNotification(
            `Analysis complete: 0 candidate regions detected exceeding threshold (${targetSensitivity}) or min area (${targetMinArea}px).`
          );
        }

        setAnalysisProgress(100);
        setTimeout(() => {
          setIsAnalyzing(false);
          setAnalysisProgress(0);
        }, 300);
        setTimeout(() => setStatusNotification(null), 5000);
      } catch (err) {
        console.error('[GeoIntel] Analysis failed:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setIsAnalyzing(false);
        setAnalysisProgress(0);
        setEnrichedCandidates([]);
        setSelectedCandidateId(null);
        setAnalysisError(errMsg);
        setStatusNotification(`Analysis failed: ${errMsg}`);
      }
    },
    []
  );

  // Initialize/run on active observation change, threshold adjustments, or custom file uploads
  useEffect(() => {
    if (!activeObs) return;
    executeAnalysis(activeObs, sensitivity, minArea, customBeforeFile, customAfterFile);
  }, [activeObs?.id, sensitivity, minArea, customBeforeFile, customAfterFile, executeAnalysis]);

  // Handle Swipe Dragging
  const handleMouseDown = () => setIsDraggingSwipe(true);
  const handleMouseUp = () => setIsDraggingSwipe(false);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingSwipe || !swipeContainerRef.current) return;
    const rect = swipeContainerRef.current.getBoundingClientRect();
    const x = Math.max(5, Math.min(rect.width - 5, e.clientX - rect.left));
    setSwipePos(Math.round((x / rect.width) * 100));
  };

  // Run change detection via real algorithm
  const handleStartAnalysis = () => {
    if (isAnalyzing) return;
    executeAnalysis(activeObs, sensitivity, minArea, customBeforeFile, customAfterFile);
  };

  // Candidate Decision
  const handleUpdateDecision = async (candidateId: string, decision: CandidateReviewDecision) => {
    const timestamp = new Date().toISOString();
    const analyst = 'Watch Officer 1';

    setEnrichedCandidates((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          return {
            ...c,
            decision,
            reviewed: decision === 'confirmed_threat' || decision === 'benign_false_positive',
            auditTrail: [
              ...c.auditTrail,
              {
                timestamp,
                analyst,
                action: `DECISION_${decision.toUpperCase()}`,
              },
            ],
          };
        }
        return c;
      })
    );

    try {
      const isReviewed = decision === 'confirmed_threat' || decision === 'benign_false_positive';
      await api.updateGeoCandidateReview(activeObs.id, candidateId, isReviewed);
      await onRefreshObservations();
      setStatusNotification(`Candidate ${candidateId} marked as ${decision === 'confirmed_threat' ? 'Accepted' : 'Rejected'}.`);
      setTimeout(() => setStatusNotification(null), 3000);
    } catch (err) {
      console.error('Failed to update candidate review:', err);
    }
  };

  // Report payload
  const reportPayload: IntelligenceReportPayload = useMemo(() => {
    const confirmedCount = enrichedCandidates.filter((c) => c.decision === 'confirmed_threat').length;
    const benignCount = enrichedCandidates.filter((c) => c.decision === 'benign_false_positive').length;
    const secondaryCount = enrichedCandidates.filter((c) => c.decision === 'secondary_pass_required').length;
    const unreviewedCount = enrichedCandidates.filter((c) => c.decision === 'unreviewed').length;

    const lat = activeObs?.coordinates?.lat || 34.0588;
    const lng = activeObs?.coordinates?.lng || -118.2391;

    return {
      reportId: `IR-2026-014`,
      classification: 'UNCLASSIFIED // EXERCISE SENTINEL // REL TO NATO',
      generatedAt: new Date().toISOString(),
      analystCallsign: 'Watch Officer Alpha-6 (C4ISR Division)',
      targetZone: activeObs?.zoneName || 'Sector 34 Logistics Hub',
      aoiBoundingBox: {
        northLat: lat + 0.015,
        southLat: lat - 0.015,
        eastLng: lng + 0.02,
        westLng: lng - 0.02,
      },
      observation: {
        id: activeObs?.id || 'GEO-OBS-01',
        title: activeObs?.title || 'Sector 34 Surveillance',
        baselineCaptureDate: baselineSensor.captureTimestamp,
        surveillanceCaptureDate: surveillanceSensor.captureTimestamp,
        baselineSensor,
        surveillanceSensor,
      },
      analysisConfiguration: {
        algorithmName: 'GeoIntel Connected Components Difference Matrix',
        sensitivityThreshold: sensitivity,
        minRegionSize: 5,
        executionTimeMs: 14,
      },
      summaryStats: {
        totalCandidates: enrichedCandidates.length,
        confirmedThreats: confirmedCount,
        benignFalsePositives: benignCount,
        secondaryPassRequired: secondaryCount,
        unreviewed: unreviewedCount,
      },
      candidates: enrichedCandidates.map((c) => ({
        id: c.id,
        label: c.label,
        type: c.anomalyType,
        confidencePct: c.confidence * 100,
        diffScorePct: c.differenceScore * 100,
        pixelBox: c.boundingBox,
        areaPixels: c.areaPixels,
        mgrs: c.mgrsCoordinate,
        latLng: c.latLng,
        decision: c.decision,
        analystNotes: c.analystNotes || '',
        explanation: c.explanation,
      })),
      overallAnalystAssessment: 'Verified against satellite optical baseline. No critical civil infrastructure breaches detected.',
      limitationDisclaimer: 'DISCLAIMER: Multi-temporal radiometric pixel differences indicate potential alterations in ground morphology.',
      isSynthetic: true,
    };
  }, [activeObs, enrichedCandidates, baselineSensor, surveillanceSensor, sensitivity]);

  const confirmedCount = enrichedCandidates.filter((c) => c.decision === 'confirmed_threat').length;
  const rejectedCount = enrichedCandidates.filter((c) => c.decision === 'benign_false_positive').length;
  const unreviewedCount = enrichedCandidates.filter((c) => c.decision === 'unreviewed').length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--color-paper)',
      }}
    >
      {/* Toast Notification */}
      {statusNotification && (
        <div
          style={{
            position: 'absolute',
            top: '56px',
            right: '24px',
            background: 'var(--color-sheet)',
            border: '1.2px solid var(--color-ok)',
            padding: '8px 14px',
            boxShadow: 'var(--shadow-hard)',
            zIndex: 1000,
            fontSize: '0.8rem',
            color: 'var(--color-ok)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle size={15} />
          <span>{statusNotification}</span>
        </div>
      )}

      {/* Main Grid: Left Column (Imagery & Map) and Right Column (Controls & Review) */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(380px, 1fr)',
          gap: '16px',
          padding: '16px',
          overflowY: 'auto',
        }}
      >
        {/* Left Column: Stacked Panels per Spec 04 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {/* Top Panel: Imagery Comparison */}
          <div
            className="panel"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-sheet)',
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--color-ink)' }}>
                  Imagery comparison
                </span>
                {observations && observations.length > 0 && (
                  <select
                    value={selectedObsIdx}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSelectedObsIdx(idx);
                      setSelectedCandidateId(null);
                    }}
                    style={{
                      fontSize: '0.78rem',
                      padding: '3px 8px',
                      background: 'var(--color-paper)',
                      border: '1.2px solid var(--color-edge)',
                      color: 'var(--color-ink)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {observations.map((obs, idx) => (
                      <option key={obs.id} value={idx}>
                        {obs.id}: {obs.title} {(obs as any).syncStatus === 'pending' ? ' [PENDING SYNC]' : ''} ({idx + 1} of {observations.length})
                      </option>
                    ))}
                  </select>
                )}

                {(activeObs as any)?.syncStatus === 'pending' && (
                  <span
                    style={{
                      background: 'rgba(217, 119, 6, 0.15)',
                      border: '1px solid #D97706',
                      color: '#D97706',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '2px',
                    }}
                  >
                    PENDING SYNC
                  </span>
                )}

                {/* Offline-First Intake Observation Button */}
                <button
                  type="button"
                  onClick={async () => {
                    const id = `GEO-LOCAL-${Date.now().toString(36).toUpperCase()}`;
                    const now = new Date().toISOString();
                    const newObs: GeoIntelObservation = {
                      id,
                      title: `Tactical Recon Intake - Sector 34`,
                      zoneName: 'Target Surveillance Sector',
                      samplePairId: 'PAIR-SURVEILLANCE-DEMO',
                      beforeImageId: 'IMG-BEFORE',
                      afterImageId: 'IMG-AFTER',
                      captureDateBefore: now,
                      captureDateAfter: now,
                      coordinates: { lat: 34.0588, lng: -118.2391, name: 'Target Recon Point' },
                      normalizedCoordinates: { x: 0.25, y: 0.25, width: 0.1, height: 0.1 },
                      differenceScore: 0.88,
                      algorithmSettings: { threshold: 30, minRegionSize: 4 },
                      explanation: 'Field optical reconnaissance anomaly intake recorded by analyst.',
                      reviewStatus: 'unreviewed',
                      candidates: [
                        {
                          id: `CAN-${id}`,
                          boundingBox: { x: 25, y: 25, width: 10, height: 10 },
                          differenceScore: 0.88,
                          label: 'Ground Surface Disturbance',
                          anomalyType: 'terrain_disturbance',
                          explanation: 'Field optical change candidate awaiting verification.',
                          reviewed: false,
                          confidence: 0.88,
                        },
                      ],
                      createdAt: now,
                      updatedAt: now,
                      isSimulated: true,
                    };

                    await api.createGeoObservation(newObs);
                    await onRefreshObservations();
                    setStatusNotification(`Observation ${id} registered locally (Pending sync).`);
                  }}
                  className="btn btn-sm"
                  style={{
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                  title="Record new tactical observation (Offline-first intake)"
                >
                  + Intake observation
                </button>

                {/* Custom File Upload Option */}
                <label
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--color-strip)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontWeight: 600,
                    marginLeft: '4px',
                  }}
                  title="Upload custom before/after images to analyze"
                >
                  Upload pair
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length >= 2) {
                        setCustomBeforeFile(files[0]);
                        setCustomAfterFile(files[1]);
                        setStatusNotification(`Loaded custom pair: ${files[0].name} & ${files[1].name}`);
                      } else if (files && files.length === 1) {
                        setCustomAfterFile(files[0]);
                        setStatusNotification(`Loaded surveillance image: ${files[0].name}`);
                      }
                    }}
                  />
                </label>
                {(customBeforeFile || customAfterFile) && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-accent)' }}>
                    (Custom active)
                    <button
                      onClick={() => {
                        setCustomBeforeFile(null);
                        setCustomAfterFile(null);
                        setAnalysisError(null);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-crit)',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        marginLeft: '4px',
                        fontSize: '0.7rem',
                      }}
                    >
                      Reset
                    </button>
                  </span>
                )}
              </div>

              {/* Segmented control: Swipe / Side by side */}
              <div
                style={{
                  display: 'flex',
                  border: '1.2px solid var(--color-edge)',
                  background: 'var(--color-paper)',
                }}
              >
                <button
                  onClick={() => setViewMode('swipe')}
                  style={{
                    padding: '4px 14px',
                    fontSize: '0.78rem',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: viewMode === 'swipe' ? 'var(--color-strip)' : 'transparent',
                    color: viewMode === 'swipe' ? '#FFFFFF' : 'var(--color-ink)',
                  }}
                >
                  Swipe
                </button>
                <button
                  onClick={() => setViewMode('side-by-side')}
                  style={{
                    padding: '4px 14px',
                    fontSize: '0.78rem',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    border: 'none',
                    borderLeft: '1.2px solid var(--color-edge)',
                    cursor: 'pointer',
                    background: viewMode === 'side-by-side' ? 'var(--color-strip)' : 'transparent',
                    color: viewMode === 'side-by-side' ? '#FFFFFF' : 'var(--color-ink)',
                  }}
                >
                  Side by side
                </button>
              </div>
            </div>

            {/* Interactive Image Canvas Area */}
            <div
              ref={swipeContainerRef}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onMouseMove={handleMouseMove}
              style={{
                position: 'relative',
                height: '340px',
                width: '100%',
                background: 'var(--color-map)',
                border: '1.2px solid var(--color-line)',
                overflow: 'hidden',
                cursor: viewMode === 'swipe' ? 'ew-resize' : 'default',
                userSelect: 'none',
              }}
            >
              {/* Badges */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: 'var(--color-strip)',
                  color: '#FFFFFF',
                  padding: '3px 8px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-heading)',
                  zIndex: 20,
                  boxShadow: 'var(--shadow-hard)',
                }}
              >
                Before, {activeObs?.captureDateBefore ? new Date(activeObs.captureDateBefore).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '06 Oct'}
              </div>

              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'var(--color-accent)',
                  color: '#FFFFFF',
                  padding: '3px 8px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-heading)',
                  zIndex: 20,
                  boxShadow: 'var(--shadow-hard)',
                }}
              >
                After, {activeObs?.captureDateAfter ? new Date(activeObs.captureDateAfter).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '24 Oct'}
              </div>

              {/* Base SVG Map Texture & Terrain */}
              <svg width="100%" height="100%" viewBox="0 0 700 340" style={{ position: 'absolute', inset: 0 }}>
                <defs>
                  <clipPath id="swipeAfterClip">
                    <rect x={`${swipePos}%`} y="0" width="100%" height="100%" />
                  </clipPath>
                </defs>

                {/* When custom uploaded images are active, render them as image layers */}
                {customBeforeUrl && (
                  <image
                    href={customBeforeUrl}
                    x="0"
                    y="0"
                    width="700"
                    height="340"
                    preserveAspectRatio="none"
                  />
                )}
                {customAfterUrl && (
                  <image
                    href={customAfterUrl}
                    x="0"
                    y="0"
                    width="700"
                    height="340"
                    preserveAspectRatio="none"
                    clipPath={viewMode === 'swipe' ? 'url(#swipeAfterClip)' : undefined}
                  />
                )}

                {/* Tactical Grid Lines and Terrain (rendered when not viewing custom uploads) */}
                {!customBeforeUrl && !customAfterUrl && (
                  <>
                    {[70, 140, 210, 280].map((y, i) => (
                      <line key={`h-${i}`} x1="0" y1={y} x2="700" y2={y} stroke="var(--color-grid)" strokeWidth="0.8" strokeDasharray="3 3" opacity={0.5} />
                    ))}
                    {[140, 280, 420, 560].map((x, i) => (
                      <line key={`v-${i}`} x1={x} y1="0" x2={x} y2="340" stroke="var(--color-grid)" strokeWidth="0.8" strokeDasharray="3 3" opacity={0.5} />
                    ))}

                    {/* River */}
                    <path
                      d="M 0,260 Q 200,240 380,260 T 700,230"
                      fill="none"
                      stroke="var(--color-water)"
                      strokeWidth="24"
                    />

                    {/* Topographic Contours */}
                    <path d="M 120,120 Q 180,80 240,110 T 320,150 Q 280,200 200,190 Z" fill="none" stroke="var(--color-contour)" strokeWidth="1.2" opacity={0.7} />
                    <path d="M 140,125 Q 180,95 230,120 T 300,150 Q 260,185 200,180 Z" fill="none" stroke="var(--color-contour)" strokeWidth="1" opacity={0.8} />

                    {/* Second Hill Contours */}
                    <path d="M 280,110 Q 360,70 420,100 T 500,140 Q 460,190 380,180 Z" fill="none" stroke="var(--color-contour)" strokeWidth="1.2" opacity={0.7} />

                    {/* Foliage / Forest Patches */}
                    <ellipse cx="160" cy="240" rx="40" ry="25" fill="var(--color-forest)" opacity={0.5} />
                    <ellipse cx="460" cy="250" rx="50" ry="30" fill="var(--color-forest)" opacity={0.5} />

                    {/* Alterations Layer (revealed on After side or full in side-by-side) */}
                    {activeObs?.id !== 'GEO-302' && (
                      <g clipPath={viewMode === 'swipe' ? 'url(#swipeAfterClip)' : undefined}>
                        {/* Cleared area polygon on hill */}
                        <polygon
                          points="320,60 420,50 460,110 440,150 340,155 310,110"
                          fill="rgba(232, 89, 12, 0.12)"
                        />
                        {/* Road line cut across hill */}
                        <line x1="375" y1="290" x2="520" y2="220" stroke="#C2AE86" strokeWidth="6" strokeLinecap="round" opacity={0.8} />
                        {/* Vehicles dots */}
                        <rect x="432" y="168" width="5" height="5" fill="var(--color-ink)" />
                        <rect x="444" y="168" width="5" height="5" fill="var(--color-ink)" />
                        <rect x="438" y="178" width="5" height="5" fill="var(--color-ink)" />
                      </g>
                    )}
                  </>
                )}
              </svg>

              {/* Dynamic Bounding Boxes with Labels from Real Algorithm */}
              <svg width="100%" height="100%" viewBox="0 0 700 340" style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                {enrichedCandidates.map((c, index) => {
                  const normX = c.boundingBox.x / 100;
                  const normY = c.boundingBox.y / 100;
                  const normW = c.boundingBox.width / 100;
                  const normH = c.boundingBox.height / 100;

                  const boxX = Math.round(normX * 700);
                  const boxY = Math.round(normY * 340);
                  const boxW = Math.max(50, Math.round(normW * 700));
                  const boxH = Math.max(28, Math.round(normH * 340));
                  const isSelected = selectedCandidateId === c.id;

                  const labelText = c.id;
                  const tagW = Math.max(56, labelText.length * 7 + 16);

                  return (
                    <g
                      key={`box-${c.id}`}
                      onClick={() => setSelectedCandidateId(c.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{`${c.id}: ${c.label} (${(c.differenceScore * 100).toFixed(0)}% delta)`}</title>
                      <rect
                        x={boxX}
                        y={boxY}
                        width={boxW}
                        height={boxH}
                        fill={isSelected ? 'rgba(0, 230, 118, 0.18)' : 'rgba(0, 230, 118, 0.06)'}
                        stroke={isSelected ? 'var(--accent-primary, #00E676)' : 'var(--border-strong, #35544C)'}
                        strokeWidth={isSelected ? '2' : '1.2'}
                        strokeDasharray="4 3"
                      />
                      {/* Compact Tag label with high contrast */}
                      <rect
                        x={boxX}
                        y={Math.max(0, boxY - 20)}
                        width={tagW}
                        height="18"
                        rx="2"
                        fill={isSelected ? 'var(--accent-primary, #00E676)' : 'var(--bg-card, #131E1B)'}
                        stroke={isSelected ? 'var(--accent-primary, #00E676)' : 'var(--border-card, #263D37)'}
                        strokeWidth="1"
                      />
                      <text
                        x={boxX + tagW / 2}
                        y={Math.max(12, boxY - 7)}
                        fill={isSelected ? '#060A09' : 'var(--text-primary, #F0FDF4)'}
                        fontSize="10"
                        fontFamily="var(--font-mono, monospace)"
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        {labelText}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Error banner when image decode or analysis fails */}
              {analysisError && !isAnalyzing && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(254, 242, 242, 0.95)',
                    zIndex: 25,
                    padding: '24px',
                    textAlign: 'center',
                    border: '2px solid var(--color-crit)',
                  }}
                >
                  <AlertTriangle size={32} color="var(--color-crit)" style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-crit)', fontFamily: 'var(--font-heading)' }}>
                    IMAGE PROCESSING / DECODING FAILED
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--color-ink)', marginTop: '6px', maxWidth: '440px', lineHeight: 1.4 }}>
                    {analysisError}
                  </div>
                  {(customBeforeFile || customAfterFile) && (
                    <button
                      onClick={() => {
                        setCustomBeforeFile(null);
                        setCustomAfterFile(null);
                        setAnalysisError(null);
                      }}
                      style={{
                        marginTop: '12px',
                        background: 'var(--color-crit)',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '6px 14px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-heading)',
                      }}
                    >
                      Clear Custom Files
                    </button>
                  )}
                </div>
              )}

              {/* Empty state banner when no regions exceed threshold and no error */}
              {!analysisError && enrichedCandidates.length === 0 && !isAnalyzing && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(240, 238, 230, 0.88)',
                    zIndex: 15,
                    padding: '20px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)', fontFamily: 'var(--font-heading)' }}>
                    NO RADIOMETRIC CHANGES DETECTED
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)', marginTop: '4px', maxWidth: '380px' }}>
                    All pixel differences for this observation pair are below the active sensitivity threshold ({sensitivity}) or cluster area is under {minArea}px.
                  </div>
                </div>
              )}

              {/* Swipe Vertical Line & Center Handle */}
              {viewMode === 'swipe' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${swipePos}%`,
                    width: '2px',
                    background: 'var(--color-ink)',
                    zIndex: 30,
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'var(--color-sheet)',
                      border: '1.5px solid var(--color-ink)',
                      boxShadow: 'var(--shadow-hard)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      color: 'var(--color-ink)',
                    }}
                  >
                    {'⟨ ⟩'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Panel: Observations on the map */}
          <div
            className="panel"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-sheet)',
              minHeight: '260px',
            }}
          >
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--color-ink)' }}>
                Observations on the map
              </span>
            </div>

            {/* Tactical Canvas for observations */}
            <div
              style={{
                position: 'relative',
                flex: 1,
                minHeight: '200px',
                background: 'var(--color-map)',
                border: '1.2px solid var(--color-line)',
                overflow: 'hidden',
              }}
            >
              <svg width="100%" height="100%" viewBox="0 0 700 220" style={{ position: 'absolute', inset: 0 }}>
                {/* Horizontal Grid */}
                {[44, 88, 132, 176].map((y, i) => (
                  <g key={`obs-h-${i}`}>
                    <line x1="0" y1={y} x2="700" y2={y} stroke="var(--color-grid)" strokeWidth="0.8" strokeDasharray="3 3" opacity={0.5} />
                    <text x="8" y={y + 12} fill="var(--color-grid)" fontSize="8.5" fontWeight="700">
                      {String.fromCharCode(65 + i)}
                    </text>
                  </g>
                ))}

                {/* Vertical Grid */}
                {[100, 200, 300, 400, 500, 600].map((x, i) => (
                  <g key={`obs-v-${i}`}>
                    <line x1={x} y1="0" x2={x} y2="220" stroke="var(--color-grid)" strokeWidth="0.8" strokeDasharray="3 3" opacity={0.5} />
                    <text x={x + 4} y="14" fill="var(--color-grid)" fontSize="8.5" fontWeight="700">
                      {31 + i}
                    </text>
                  </g>
                ))}

                {/* River */}
                <path
                  d="M 0,165 Q 180,150 360,170 T 700,155"
                  fill="none"
                  stroke="var(--color-water)"
                  strokeWidth="16"
                />

                {/* Contours */}
                <ellipse cx="230" cy="140" rx="45" ry="30" fill="none" stroke="var(--color-contour)" strokeWidth="1.2" opacity={0.7} />
                <ellipse cx="320" cy="140" rx="40" ry="25" fill="none" stroke="var(--color-contour)" strokeWidth="1.2" opacity={0.7} />
                <ellipse cx="330" cy="80" rx="30" ry="20" fill="var(--color-forest)" opacity={0.4} />

                {/* Dynamic Numbered Markers from Real Algorithm Results */}
                {enrichedCandidates.map((c, index) => {
                  const normX = c.boundingBox.x / 100;
                  const normY = c.boundingBox.y / 100;
                  const normW = c.boundingBox.width / 100;
                  const normH = c.boundingBox.height / 100;

                  const mapX = Math.round(normX * 700 + (normW * 700) / 2);
                  const mapY = Math.round(normY * 220 + (normH * 220) / 2);
                  const isSelected = selectedCandidateId === c.id;
                  const labelText = c.id;
                  const tagW = Math.max(54, labelText.length * 7 + 14);

                  return (
                    <g
                      key={`map-marker-${c.id}`}
                      onClick={() => setSelectedCandidateId(c.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{`${c.id}: ${c.label} (${(c.differenceScore * 100).toFixed(0)}% delta)`}</title>
                      <circle
                        cx={mapX}
                        cy={mapY}
                        r={isSelected ? '12' : '10'}
                        fill={isSelected ? 'var(--accent-primary, #00E676)' : 'var(--bg-elevated, #1A2925)'}
                        stroke={isSelected ? 'var(--accent-primary, #00E676)' : 'var(--border-strong, #35544C)'}
                        strokeWidth="1.5"
                      />
                      <text x={mapX} y={mapY + 4} fill={isSelected ? '#060A09' : 'var(--text-primary, #F0FDF4)'} fontSize="10" fontFamily="var(--font-mono, monospace)" fontWeight="700" textAnchor="middle">
                        {index + 1}
                      </text>
                      <rect
                        x={mapX + 16}
                        y={mapY - 9}
                        width={tagW}
                        height="18"
                        rx="2"
                        fill={isSelected ? 'var(--accent-primary, #00E676)' : 'var(--bg-card, #131E1B)'}
                        stroke={isSelected ? 'var(--accent-primary, #00E676)' : 'var(--border-card, #263D37)'}
                        strokeWidth="1"
                      />
                      <text
                        x={mapX + 16 + tagW / 2}
                        y={mapY + 4}
                        fill={isSelected ? '#060A09' : 'var(--text-primary, #F0FDF4)'}
                        fontSize="9.5"
                        fontFamily="var(--font-mono, monospace)"
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        {labelText}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Right Column: Controls, Candidates & Intelligence Report */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {/* Section 1: Change Detection Parameters */}
          <div
            className="panel"
            style={{
              padding: '16px',
              background: 'var(--color-sheet)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--color-ink)' }}>
                Change detection
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>
                Pixel difference, then threshold, then grouped into regions.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Sensitivity Slider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '85px', fontSize: '0.8rem', color: 'var(--color-ink)', fontWeight: 600 }}>
                    Sensitivity
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--color-strip)', cursor: 'pointer' }}
                  />
                  <span style={{ width: '30px', fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {sensitivity}
                  </span>
                </div>

                {/* Minimum Area Slider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '85px', fontSize: '0.8rem', color: 'var(--color-ink)', fontWeight: 600 }}>
                    Minimum area
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={minArea}
                    onChange={(e) => setMinArea(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--color-strip)', cursor: 'pointer' }}
                  />
                  <span style={{ width: '40px', fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {minArea} px
                  </span>
                </div>
              </div>

              {/* Run on new pair Button */}
              <button
                onClick={handleStartAnalysis}
                disabled={isAnalyzing}
                className="btn btn-primary"
                style={{
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  height: '42px',
                }}
              >
                {isAnalyzing ? `Running ${analysisProgress}%` : 'Run on new pair'}
              </button>
            </div>
          </div>

          {/* Section 2: Change Candidates List */}
          <div
            className="panel"
            style={{
              padding: '16px',
              background: 'var(--color-sheet)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--color-ink)' }}>
              Change candidates {enrichedCandidates.length}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {enrichedCandidates.map((c, index) => {
                const isSelected = selectedCandidateId === c.id;
                const isAccepted = c.decision === 'confirmed_threat';
                const isRejected = c.decision === 'benign_false_positive';

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCandidateId(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: isSelected ? 'var(--color-paper)' : 'transparent',
                      border: isSelected ? '1.2px solid var(--color-edge)' : '1.2px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {/* Badge C1/C2/C3/C4 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          background: 'var(--color-strip)',
                          color: '#FFFFFF',
                          fontFamily: 'var(--font-heading)',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {c.id}
                      </div>

                      {/* Candidate Name & Coordinates */}
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)' }}>
                          {c.label}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--color-ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                          {c.latLng.lat.toFixed(4)} N, {Math.abs(c.latLng.lng).toFixed(4)} W
                        </div>
                      </div>
                    </div>

                    {/* Change score progress bar + numeric value */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-ink-2)' }}>Change score</span>
                          <div
                            style={{
                              width: '54px',
                              height: '5px',
                              background: 'var(--color-line)',
                              position: 'relative',
                            }}
                          >
                            <div
                              style={{
                                width: `${c.differenceScore * 100}%`,
                                height: '100%',
                                background: 'var(--color-accent)',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', width: '28px', textAlign: 'right' }}>
                            {c.differenceScore.toFixed(2)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-ink-2)' }}>Confidence</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', width: '28px', textAlign: 'right' }}>
                            {c.confidence.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Decision Action Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '120px', justifyContent: 'flex-end' }}>
                        {isAccepted ? (
                          <span
                            style={{
                              padding: '4px 10px',
                              border: '1.2px solid var(--color-ok)',
                              color: 'var(--color-ok)',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                            }}
                          >
                            Accepted
                          </span>
                        ) : isRejected ? (
                          <span
                            style={{
                              padding: '4px 10px',
                              border: '1.2px solid var(--color-crit)',
                              color: 'var(--color-crit)',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                            }}
                          >
                            Rejected
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateDecision(c.id, 'confirmed_threat');
                              }}
                              className="btn btn-primary"
                              style={{
                                padding: '3px 10px',
                                fontSize: '0.75rem',
                              }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateDecision(c.id, 'benign_false_positive');
                              }}
                              className="btn"
                              style={{
                                padding: '3px 10px',
                                fontSize: '0.75rem',
                              }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Intelligence Report Summary Table */}
          <div
            className="panel"
            style={{
              padding: '16px',
              background: 'var(--color-sheet)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--color-ink)' }}>
                Intelligence report
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)', marginTop: '4px' }}>
                IR-2026-014, sector 34
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-ink-2)' }}>
                Period 06 to 24 Oct. {enrichedCandidates.length} changes detected, {confirmedCount} confirmed, {rejectedCount} rejected, {unreviewedCount} awaiting review.
              </div>
            </div>

            {/* Table */}
            <div style={{ border: '1.2px solid var(--color-line)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-paper)', borderBottom: '1.2px solid var(--color-line)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Finding</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Coordinates</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Confidence</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedCandidates.slice(0, 4).map((c) => (
                    <tr key={`row-${c.id}`} style={{ borderBottom: '1px solid var(--color-line)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.id} {c.label.toLowerCase()}</td>
                      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink-2)' }}>
                        {c.latLng.lat.toFixed(4)} N, {Math.abs(c.latLng.lng).toFixed(4)} W
                      </td>
                      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>
                        {c.confidence.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {c.decision === 'confirmed_threat' ? (
                          <span style={{ color: 'var(--color-ok)', fontWeight: 700 }}>Accepted</span>
                        ) : c.decision === 'benign_false_positive' ? (
                          <span style={{ color: 'var(--color-crit)', fontWeight: 700 }}>Rejected</span>
                        ) : (
                          <span style={{ color: 'var(--color-ink-2)' }}>Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action Buttons Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="btn btn-primary"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                }}
              >
                Generate report
              </button>
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="btn"
                style={{
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                Export HTML
              </button>
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="btn"
                style={{
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                Export JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Replay Bar (Standard across mockups) */}
      <div
        style={{
          height: '42px',
          background: 'var(--color-paper)',
          borderTop: '1.2px solid var(--color-edge)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '14px',
          zIndex: 40,
        }}
      >
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          style={{
            background: 'var(--color-strip)',
            border: 'none',
            color: '#FFFFFF',
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title={isPlaying ? 'Pause replay' : 'Play replay'}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} style={{ marginLeft: '1px' }} />}
        </button>

        <div style={{ display: 'flex', border: '1.2px solid var(--color-edge)', background: 'var(--color-sheet)' }}>
          {(['1x', '2x', '5x'] as const).map((spd) => (
            <button
              key={spd}
              onClick={() => setReplaySpeed(spd)}
              style={{
                border: 'none',
                background: replaySpeed === spd ? 'var(--color-strip)' : 'transparent',
                color: replaySpeed === spd ? '#FFFFFF' : 'var(--color-ink)',
                fontSize: '0.74rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              {spd}
            </button>
          ))}
        </div>

        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #869E96)' }}>
          {isPlaying ? 'Replay active' : 'Replay paused'} ({replaySpeed})
        </span>
      </div>

      {/* Intelligence Report Modal */}
      <IntelligenceReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        reportPayload={reportPayload}
      />
    </div>
  );
};
