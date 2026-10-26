/**
 * SENTINEL — Shared Data Contracts & Type Definitions
 * 
 * Single source of truth for all modules:
 * - Module 1: FieldLink (Offline Reports & Queue Sync)
 * - Module 2: SkyWatch (Counter-Drone Telemetry & Anomaly Alerts)
 * - Module 3: GeoIntel (Reconnaissance Image Diff & Candidate Regions)
 * - Module 4: MediRoute (Emergency Triage & Hazard-Aware Routing)
 * - Unified Operations Dashboard & Cross-Module Scenario
 */

export const API_BASE_URL = '/api';

export const API_ROUTES = {
  HEALTH: '/api/health',
  DASHBOARD: '/api/dashboard',
  INCIDENTS: '/api/incidents',
  INCIDENT_BY_ID: (id: string) => `/api/incidents/${id}`,
  SYNC: '/api/sync',
  TELEMETRY: '/api/telemetry',
  ALERTS: '/api/alerts',
  ALERT_BY_ID: (id: string) => `/api/alerts/${id}`,
  GEOINTEL_OBSERVATIONS: '/api/geointel/observations',
  GEOINTEL_OBSERVATION_BY_ID: (id: string) => `/api/geointel/observations/${id}`,
  PATIENTS: '/api/patients',
  PATIENT_BY_ID: (id: string) => `/api/patients/${id}`,
  HAZARDS: '/api/hazards',
  HAZARD_BY_ID: (id: string) => `/api/hazards/${id}`,
  ROUTES_CALCULATE: '/api/routes/calculate',
  ROUTES_GRAPH: '/api/routes/graph',
  DEMO_RESET: '/api/demo/reset',
  DEMO_SEED: '/api/demo/seed',
  EVENTS_SSE: '/api/events',
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  INVALID_STATE: 'INVALID_STATE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ==========================================
// 1. Common & System Primitives
// ==========================================

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'triaged' | 'in_progress' | 'resolved' | 'active' | 'pending_sync' | 'archived';
export type SourceModule = 'fieldlink' | 'skywatch' | 'geointel' | 'mediroute' | 'manual' | 'system';

export interface GeoCoordinate {
  lat: number;
  lng: number;
  altitudeMeters?: number;
  label?: string;
  name?: string;
}

export interface IncidentRecord {
  id: string;
  clientId?: string;
  sourceModule: SourceModule;
  type: string;
  priority: PriorityLevel;
  notes: string;
  location: GeoCoordinate;
  status: IncidentStatus;
  isSimulated: true;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  title?: string;
}

// ==========================================
// 2. FieldLink: Offline Queue & Sync
// ==========================================

export type QueueItemStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface QueuedReport {
  clientId: string;             // Client-generated UUID / idempotency key
  serverId?: string;             // Assigned by server once confirmed
  type: string;                 // e.g. 'Road Blockage', 'Casualty Sighting', 'Resource Need'
  priority: PriorityLevel;
  notes: string;
  location: GeoCoordinate;
  createdAt: string;            // Original creation timestamp
  status: QueueItemStatus;
  retryCount: number;
  errorMessage?: string;
  isSimulated: true;
  title?: string;
}

export interface SyncBatchRequest {
  batchId?: string;
  reports?: QueuedReport[] | any[];
  items?: any[];
}

export type SyncOutcome = 'accepted' | 'already_received' | 'rejected';

export interface SyncItemResult {
  clientId: string;
  serverId?: string;
  outcome?: SyncOutcome;
  status?: SyncOutcome;
  errorCode?: string;
  errorMessage?: string;
  reason?: string;
  syncTimestamp?: string;
  syncedAt?: string;
}

export interface SyncBatchResponse {
  batchId?: string;
  results: SyncItemResult[];
  items?: SyncItemResult[];
  processedCount?: number;
  failedCount?: number;
  totalSubmitted?: number;
  acceptedCount?: number;
  duplicateCount?: number;
  rejectedCount?: number;
  processedAt?: string;
}

// ==========================================
// 3. SkyWatch: Telemetry & Explainable Anomaly Detection
// ==========================================

export interface TelemetryTrackPoint {
  trackId: string;
  callsign: string;
  lat: number;
  lng: number;
  altitudeMeters: number;
  speedKnots: number;
  headingDeg: number;
  timestamp: string;
  isSimulated: true;
  id?: string;
}

export type SkyWatchRuleName = 
  | 'speed_anomaly'
  | 'route_deviation'
  | 'restricted_zone_entry'
  | 'stale_telemetry'
  | 'NO_FLY_ZONE_INCURSION'
  | 'ZONE_INCURSION'
  | 'RAPID_ACCELERATION_SPIKE'
  | 'SUDDEN_ACCELERATION'
  | 'UNUSUAL_ALTITUDE_DROP'
  | 'FLIGHT_PATH_DEVIATION'
  | 'ROUTE_DEVIATION'
  | 'STALE_TELEMETRY_SIGNAL'
  | 'STALE_TELEMETRY';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'high' | 'low' | 'medium';

export interface RestrictedZone {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  maxAltitudeMeters: number;
}

export interface AnomalyDetectorConfig {
  speedChangeThresholdKnots: number;
  routeDeviationThresholdMeters: number;
  staleTelemetryThresholdSec: number;
  restrictedZones: RestrictedZone[];
}

export interface SkyWatchAlert {
  id: string;
  trackId: string;
  severity: AlertSeverity;
  ruleName: SkyWatchRuleName;
  observedValue: string | number;
  threshold: string | number;
  explanation: string;
  timestamp: string;
  acknowledged: boolean;
  isSimulated: true;
  trackCallsign?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

// ==========================================
// 4. GeoIntel: Matrix Image Diff & Review
// ==========================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CandidateRegion {
  id: string;
  beforeImageId: string;
  afterImageId: string;
  bbox: BoundingBox;
  differenceScore: number;
  areaPixels: number;
  algorithmSettings: {
    threshold: number;
    minRegionSize: number;
  };
  explanation: string;
  reviewStatus: 'unreviewed' | 'confirmed' | 'dismissed' | 'pending';
  analystNotes?: string;
  createdAt: string;
  isSimulated: true;
}

export interface GeoIntelReport {
  id: string;
  title: string;
  beforeImageId: string;
  afterImageId: string;
  candidateRegions: CandidateRegion[];
  confirmedCount: number;
  dismissedCount: number;
  analystSummary: string;
  limitationsDisclaimer: string;
  generatedAt: string;
}

// ==========================================
// 5. MediRoute: Triage & Dijkstra Routing
// ==========================================

export type TriageCategory = 
  | 'immediate'
  | 'delayed'
  | 'minimal'
  | 'expectant'
  | 'immediate_red'
  | 'delayed_yellow'
  | 'minimal_green'
  | 'expectant_black'
  | 'undetermined';

export interface CasualtyAssessmentInput {
  namePlaceholder?: string;
  fictionalName?: string;
  patientCode?: string;
  ageGroup?: 'pediatric' | 'adult' | 'geriatric';
  age?: number;
  gender?: string;
  canWalk?: boolean;
  respiratoryRate?: number;
  pulse?: number;
  mentalStatus?: 'alert' | 'verbal' | 'pain' | 'unresponsive' | 'can_follow_commands' | 'altered';
  severeBleeding?: boolean;
  vitals?: any;
}

export interface TriageResult {
  category: TriageCategory;
  triageCategory?: TriageCategory;
  ruleVersion: string;
  triageReason: string;
  decisionTreePath?: string[];
  missingDataWarnings?: string[];
}

export interface CasualtyRecord extends CasualtyAssessmentInput, TriageResult {
  id: string;
  status: 'awaiting_assessment' | 'assessed' | 'assigned' | 'evacuated' | 'in_transit';
  location: GeoCoordinate;
  createdAt: string;
  updatedAt?: string;
  isSimulated: true;
  assignedHospitalId?: string;
  assignedFacilityId?: string;
  notes?: string;
}

export interface RoadNode {
  id: string;
  label?: string;
  name?: string;
  lat: number;
  lng: number;
  type: 'aid_station' | 'hospital' | 'casualty_pickup' | 'intersection' | 'casualty_site';
  coordinates?: GeoCoordinate;
}

export interface RoadEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  from?: string;
  to?: string;
  distanceKm: number;
  baseTravelTimeMin: number;
  isBlocked?: boolean;
  blocked?: boolean;
  blockageReason?: string;
  roadName?: string;
}

export interface RoadGraph {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

export interface RouteCalculationResult {
  originNodeId?: string;
  startNodeId?: string;
  destinationNodeId: string;
  pathNodeIds: string[];
  pathEdges?: RoadEdge[];
  edgesTraversed?: any[];
  totalDistanceKm: number;
  totalTimeMin?: number;
  estimatedMinutes?: number;
  estimatedTimeMinutes?: number;
  blockedEdgesAvoided?: string[];
  hazardsAvoided?: string[];
  hasRoute?: boolean;
  routeFound?: boolean;
  message?: string;
}

// ==========================================
// 6. Cross-Module Scenario & System State
// ==========================================

export type ScenarioStepName = 
  | 'INITIAL_BASELINE'
  | 'FIELD_REPORT_FILED'
  | 'HAZARD_ROAD_BLOCK'
  | 'MEDIROUTE_DIVERT'
  | 'GEOINTEL_DIFF_FOUND'
  | 'SKYWATCH_ZONE_BREACH';

export interface CrossModuleEvent {
  step: ScenarioStepName;
  timestamp: string;
  title: string;
  description: string;
  sourceModule: SourceModule;
  relatedEntityId: string;
}

export interface SentinelSystemState {
  incidents: IncidentRecord[];
  queuedReports: QueuedReport[];
  activeTracks: TelemetryTrackPoint[];
  skyWatchAlerts: SkyWatchAlert[];
  candidateRegions: CandidateRegion[];
  casualties: CasualtyRecord[];
  roadGraph: RoadGraph;
  activeRoute?: RouteCalculationResult;
  scenarioHistory: CrossModuleEvent[];
  lastResetAt: string;
}

export * from './types';
