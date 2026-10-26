/**
 * SENTINEL Shared Project Contracts & Type Definitions
 * Single source of truth for frontend (Person 1), backend (Person 2), and algorithms (Person 3).
 * ALL records must explicitly carry `isSimulated: true` for honest simulation labeling.
 */

export type ModuleSource = 'fieldlink' | 'skywatch' | 'geointel' | 'mediroute' | 'system' | 'manual';
export type SourceModule = ModuleSource;

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface GeoLocation {
  name?: string;
  lat: number;
  lng: number;
  label?: string;
}
export type GeoPoint = GeoLocation;

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
  meta?: {
    timestamp: string;
    isSimulated: true;
  };
}

// -------------------------------------------------------------
// MODULE 1: FIELDLINK (Offline Tactical Communication)
// -------------------------------------------------------------
export type IncidentType =
  | 'security_breach'
  | 'medical_evac'
  | 'drone_incursion'
  | 'recon_anomaly'
  | 'infrastructure_damage'
  | 'communication_loss'
  | 'road_blockage'
  | 'medical'
  | 'hazard'
  | 'hostile_drone'
  | 'infrastructure'
  | 'recon'
  | 'general';

export type IncidentStatus = 'active' | 'in_progress' | 'resolved' | 'pending_sync' | 'archived' | 'open' | 'triaged';
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface IncidentReport {
  id: string;
  sourceModule: ModuleSource;
  type: IncidentType;
  priority: PriorityLevel;
  title: string;
  notes: string;
  location: GeoLocation;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  status: IncidentStatus;
  isSimulated: true;
  clientId?: string; // Idempotency key for offline queue
  syncStatus?: SyncStatus;
  syncAttempts?: number;
  syncErrorMessage?: string;
  syncedAt?: string;
}

export type Incident = IncidentReport;

export interface CreateIncidentInput {
  clientId?: string;
  sourceModule: SourceModule;
  type: IncidentType;
  priority: PriorityLevel;
  title: string;
  notes: string;
  location: GeoLocation;
  status?: IncidentStatus;
  createdAt?: string;
}

export interface UpdateIncidentInput {
  status?: IncidentStatus;
  priority?: PriorityLevel;
  notes?: string;
  title?: string;
}

export interface OfflineSyncPayload {
  clientId: string;
  report: IncidentReport;
  clientTimestamp: string;
}

export type SyncItemOutcome = 'accepted' | 'already_received' | 'rejected';

export interface SyncResponseItem {
  clientId: string;
  serverId?: string | null;
  outcome: SyncItemOutcome;
  status?: SyncItemOutcome; // alias for outcome
  errorCode?: string;
  errorMessage?: string;
  reason?: string;
  syncedAt?: string;
  syncTimestamp?: string;
}

export type SyncItemResult = SyncResponseItem;

export interface SyncBatchItem {
  clientId: string;
  sourceModule: SourceModule;
  type: IncidentType;
  priority: PriorityLevel;
  title: string;
  notes: string;
  location: GeoLocation;
  createdAt: string;
  status?: IncidentStatus;
}

export interface SyncBatchRequest {
  batchId?: string;
  items?: SyncBatchItem[];
  reports?: OfflineSyncPayload[];
}

export interface BatchSyncResult {
  totalSubmitted: number;
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  failedCount?: number;
  items: SyncResponseItem[];
  results?: SyncResponseItem[];
  processedCount?: number;
  processedAt?: string;
}

export type SyncBatchResponse = BatchSyncResult;

// -------------------------------------------------------------
// MODULE 2: SKYWATCH (Counter-Drone Monitoring & Airspace Security)
// -------------------------------------------------------------
export type TrackType =
  | 'friendly_uav'
  | 'unknown_quadcopter'
  | 'fast_mover'
  | 'commercial_fixed_wing'
  | 'stealth_incursion';

export type TrackStatus = 'tracking' | 'suspicious' | 'hostile' | 'lost_signal';

export interface Waypoint {
  lat: number;
  lng: number;
  altitude?: number;
  timestamp: string;
}

export interface TelemetryPosition {
  lat: number;
  lng: number;
  altitudeMeters: number;
}

export interface TelemetryTrack {
  id: string;
  callsign: string;
  type?: TrackType;
  position?: TelemetryPosition;
  lat: number;
  lng: number;
  altitude: number; // meters AGL
  altitudeMeters?: number;
  speed: number; // m/s
  speedKts?: number;
  heading: number; // 0-360 degrees
  headingDeg?: number;
  timestamp: string;
  status: TrackStatus;
  flightHistory: Waypoint[];
  anomalyFlags?: AnomalyRuleName[];
  isSimulated: true;
  // Phase 1 & 3: Threat scoring and trajectory predictions
  threatScore?: number;
  threatFactors?: {
    speedScore: number;
    altitudeScore: number;
    headingScore: number;
    breachScore: number;
    loiterScore: number;
    transponderScore: number;
  };
  predictedPath?: Waypoint[];
  predictedCPA?: {
    distanceMeters: number;
    timeToCpaSeconds: number;
    zoneId: string;
    zoneName: string;
    willBreach: boolean;
    timeToBreachSec?: number;
  };
  predictionErrorMeters?: number;
  transponderActive?: boolean;
  isLoitering?: boolean;
  isSwarm?: boolean;
}

export const VALID_ANOMALY_RULE_NAMES = [
  'NO_FLY_ZONE_INCURSION',
  'ZONE_INCURSION',
  'RAPID_ACCELERATION_SPIKE',
  'SUDDEN_ACCELERATION',
  'UNUSUAL_ALTITUDE_DROP',
  'FLIGHT_PATH_DEVIATION',
  'ROUTE_DEVIATION',
  'STALE_TELEMETRY_SIGNAL',
  'STALE_TELEMETRY',
  'speed_anomaly',
  'route_deviation',
  'restricted_zone_entry',
  'stale_telemetry',
] as const;

export type AnomalyRuleName = (typeof VALID_ANOMALY_RULE_NAMES)[number];

export function isAnomalyRuleName(val: unknown): val is AnomalyRuleName {
  return typeof val === 'string' && (VALID_ANOMALY_RULE_NAMES as readonly string[]).includes(val);
}

export type AlertSeverity = 'info' | 'warning' | 'high' | 'critical' | 'low' | 'medium';

export interface AirspaceAlert {
  id: string;
  trackId?: string;
  trackCallsign?: string;
  severity: PriorityLevel | AlertSeverity;
  ruleName: AnomalyRuleName;
  observedValue: string | number;
  threshold: string | number;
  explanation: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  isSimulated: true;
}

export type Alert = AirspaceAlert;

export interface UpdateAlertInput {
  acknowledged: boolean;
}

export interface RestrictedAirspaceZone {
  id: string;
  name: string;
  type: 'no_fly' | 'military_patrol' | 'civilian_buffer';
  center: GeoLocation;
  radiusKm: number;
  ceilingMeters: number;
}

// -------------------------------------------------------------
// MODULE 3: GEOINTEL (Geospatial Intelligence & Reconnaissance)
// -------------------------------------------------------------
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChangeCandidate {
  id: string;
  boundingBox: BoundingBox;
  differenceScore: number; // 0.0 - 1.0 (e.g. 0.84 = 84% change)
  label: string;
  anomalyType:
    | 'structure_alteration'
    | 'vehicle_movement'
    | 'terrain_disturbance'
    | 'vegetation_clearing';
  explanation: string;
  reviewed: boolean;
  analystNotes?: string;
  confidence: number;
}

export type GeoIntelReviewStatus =
  | 'pending'
  | 'pending_review'
  | 'reviewed'
  | 'confirmed_candidate'
  | 'escalated'
  | 'dismissed'
  | 'dismissed_false_positive'
  | 'unreviewed'
  | 'confirmed';

export interface GeoIntelObservation {
  id: string;
  title: string;
  zoneName: string;
  samplePairId?: string;
  beforeImageId?: string;
  afterImageId?: string;
  captureDateBefore: string;
  captureDateAfter: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  coordinates: GeoLocation;
  geoCoordinates?: GeoLocation;
  resolutionMeters?: number;
  normalizedCoordinates?: BoundingBox;
  differenceScore?: number;
  explanation?: string;
  candidates: ChangeCandidate[];
  algorithmSettings: {
    sensitivityThreshold?: number;
    kernelSize?: number;
    noiseReduction?: boolean;
    threshold?: number;
    minRegionSize?: number;
    blurRadius?: number;
  };
  reviewStatus: GeoIntelReviewStatus;
  analystNotes?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt?: string;
  isSimulated: true;
}

export interface CreateGeoObservationInput {
  samplePairId: string;
  beforeImageId: string;
  afterImageId: string;
  normalizedCoordinates: BoundingBox;
  geoCoordinates?: GeoLocation;
  differenceScore: number;
  algorithmSettings: {
    threshold: number;
    minRegionSize: number;
    blurRadius?: number;
  };
  explanation: string;
  analystNotes?: string;
}

export interface UpdateGeoObservationInput {
  reviewStatus?: GeoIntelReviewStatus;
  analystNotes?: string;
}

// -------------------------------------------------------------
// MODULE 4: MEDIROUTE (Emergency Medical Triage & Evacuation)
// -------------------------------------------------------------
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

export type PatientStatus =
  | 'awaiting_assessment'
  | 'assessed'
  | 'assigned'
  | 'in_transit'
  | 'evacuated';

export type PatientWorkflowStatus = PatientStatus;

export interface PatientVitals {
  canWalk?: boolean;
  ambulatory?: boolean;
  respiratoryRate?: number; // breaths/min
  radialPulsePresent?: boolean;
  pulsePresent?: boolean;
  canFollowCommands?: boolean;
  mentalStatus?: 'alert' | 'verbal' | 'pain' | 'unresponsive' | 'can_follow_commands' | 'altered';
  severeBleedingControlled?: boolean;
  pulse?: number;
  severeBleeding?: boolean;
}

export interface CasualtyRecord {
  id: string;
  patientCode?: string;
  fictionalName?: string;
  age?: number;
  ageGroup?: 'pediatric' | 'adult' | 'geriatric';
  gender?: string;
  location: GeoLocation;
  vitals?: PatientVitals;
  canWalk?: boolean;
  respiratoryRate?: number;
  pulse?: number;
  mentalStatus?: 'alert' | 'verbal' | 'pain' | 'unresponsive' | 'can_follow_commands' | 'altered';
  severeBleeding?: boolean;
  triageCategory: TriageCategory;
  category?: TriageCategory;
  ruleVersion: string;
  triageReason: string;
  status: PatientStatus;
  workflowStatus?: PatientStatus; // alias
  assignedHospitalId?: string;
  assignedFacilityId?: string; // alias
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  isSimulated: true;
  decisionTreePath?: string[];
  missingDataWarnings?: string[];
  // Phase 1 & 5: Live drifting vitals and triage history
  heartRate?: number;
  spo2?: number;
  bpSystolic?: number;
  bpDiastolic?: number;
  radialPulsePresent?: boolean;
  severeBleedingControlled?: boolean;
  vitalsHistory?: {
    timestamp: string;
    heartRate: number;
    respiratoryRate: number;
    spo2: number;
    bpSystolic: number;
    bpDiastolic: number;
  }[];
  triageHistory?: {
    timestamp: string;
    category: TriageCategory;
    reason: string;
    triggerVitals: string;
  }[];
  trend?: 'improving' | 'deteriorating' | 'stable';
  deteriorationRate?: number;
}

export type Patient = CasualtyRecord;

export interface CreatePatientInput {
  fictionalName: string;
  age: number;
  gender?: string;
  triageCategory?: TriageCategory;
  vitals: PatientVitals;
  location: GeoLocation;
  workflowStatus?: PatientWorkflowStatus;
}

export interface UpdatePatientInput {
  workflowStatus?: PatientWorkflowStatus;
  triageCategory?: TriageCategory;
  assignedFacilityId?: string;
  triageReason?: string;
}

export interface RoadHazardEdge {
  id: string;
  name?: string;
  edgeId?: string; // alias
  fromNodeId?: string;
  toNodeId?: string;
  fromNode?: string; // alias
  toNode?: string; // alias
  distanceKm?: number;
  blocked: boolean;
  hazardType?: 'debris' | 'hostile_activity' | 'bridge_collapse' | 'flooding' | 'unexploded_ordnance' | 'road_blocked' | 'structural_damage';
  reportedBy?: string;
  reportedAt?: string;
  updatedAt?: string;
  isSimulated: true;
}

export type HazardEdge = RoadHazardEdge;

export interface CreateHazardInput {
  edgeId: string;
  fromNode: string;
  toNode: string;
  hazardType?: 'road_blocked' | 'structural_damage' | 'unexploded_ordnance' | 'flooding';
  blocked: boolean;
  reportedBy?: string;
}

export interface EvacuationNode {
  id: string;
  name: string;
  label?: string;
  type: 'hospital' | 'aid_station' | 'casualty_pickup' | 'intersection' | 'casualty_site';
  coordinates: GeoLocation;
  lat?: number;
  lng?: number;
  capacity?: number;
  occupied?: number;
}

export type RoadGraphNode = EvacuationNode;

export interface RoadGraphEdge {
  id: string;
  from?: string;
  to?: string;
  fromNodeId: string;
  toNodeId: string;
  distanceKm: number;
  roadName: string;
  name?: string;
  isBlocked?: boolean;
  blocked?: boolean;
  baseTravelTimeMin: number;
}

export interface CalculatedRoute {
  id?: string;
  routeFound?: boolean;
  sourceNodeId?: string;
  originNodeId?: string;
  destinationNodeId: string;
  startNodeId?: string;
  totalDistanceKm: number;
  totalTimeMin?: number;
  estimatedMinutes?: number;
  estimatedTimeMinutes?: number;
  pathNodeIds: string[];
  edgesTraversed: string[] | any[];
  pathEdges?: any[];
  avoidedHazardIds?: string[];
  hazardsAvoided?: string[];
  blockedEdgesAvoided?: string[];
  algorithmUsed?: 'Dijkstra-Hazard-Aware' | 'A*-Terrain-Cost';
  hasActiveBlockage?: boolean;
  alternativeFound?: boolean;
  hasRoute?: boolean;
  explanation?: string;
  message?: string;
  calculatedAt?: string;
}

export type RouteCalculationResponse = CalculatedRoute;

export interface RouteCalculationRequest {
  startNodeId: string;
  destinationNodeId: string;
  avoidHazards?: boolean;
}

// -------------------------------------------------------------
// UNIFIED DASHBOARD SUMMARY & CROSS-MODULE
// -------------------------------------------------------------
export interface DashboardSummary {
  systemStatus?: 'nominal' | 'degraded' | 'offline_mode';
  pendingSyncCount?: number;
  activeIncidentsCount?: number;
  activeAirspaceTracksCount?: number;
  unacknowledgedAlertsCount?: number;
  pendingGeoReviewsCount?: number;
  criticalPatientsAwaitingEvac?: number;
  blockedRoadSegmentsCount?: number;
  lastSyncTimestamp?: string | null;
  metrics?: {
    openIncidentsCount: number;
    activeTracksCount: number;
    pendingGeoReviewsCount: number;
    patientsAwaitingEvacCount: number;
    activeHazardsCount: number;
  };
  recentIncidents?: Incident[];
  activeAlerts?: Alert[];
  systemHealth?: {
    status: 'healthy' | 'degraded' | 'offline';
    lastSyncTimestamp: string;
    uptimeSeconds: number;
    storageMode: string;
  };
  isSimulated: true;
}

// -------------------------------------------------------------
// REALTIME EVENT BUS
// -------------------------------------------------------------
export type RealtimeEventType =
  | 'incident:created'
  | 'incident:updated'
  | 'sync:completed'
  | 'telemetry:update'
  | 'alert:triggered'
  | 'alert:acknowledged'
  | 'geointel:candidate_added'
  | 'geointel:reviewed'
  | 'patient:created'
  | 'patient:updated'
  | 'hazard:updated'
  | 'demo:reset';

export interface RealtimeEvent<T = unknown> {
  type: RealtimeEventType;
  payload: T;
  timestamp: string;
}

// -------------------------------------------------------------
// MODULE 1 EXTENSION: FIELDLINK DECENTRALIZED MESH & MARKERS
// -------------------------------------------------------------
export type MeshNodeId = 'Alpha' | 'Bravo' | 'Command';
export type MeshMessageState = 'queued' | 'relayed' | 'delivered';

export interface MeshMessage {
  id: string;
  senderNode: MeshNodeId;
  targetNode: MeshNodeId;
  channel: string; // e.g. '#tactical-alpha', '#recon-bravo', '#command-net'
  content: string;
  hopPath: MeshNodeId[];
  state: MeshMessageState;
  latencyMs: number;
  timestamp: string;
  retryCount: number;
  isSimulated: true;
}

export type MapMarkerType = 'rally_point' | 'contact' | 'hazard' | 'checkpoint';

export interface SharedMapMarker {
  id: string;
  type: MapMarkerType;
  label: string;
  location: GeoLocation;
  createdByNode: MeshNodeId;
  createdAt: string;
  updatedAt: string;
  isSimulated: true;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  action: 'ENQUEUE' | 'PACKET_DELIVERED' | 'PACKET_DROP' | 'SYNC_FLUSH' | 'CONFLICT_LWW';
  sourceNode: MeshNodeId;
  details: string;
  status: 'info' | 'warning' | 'success';
}


export interface SimulationMeasurableMetrics {
  tracksMonitored: number;
  alertsRaised: number;
  meanAlertLatencyMs: number;
  meanPredictionErrorM: number;
  messagesDelivered: number;
  messagesDropped: number;
  reportsSynced: number;
  casualtiesTriaged: number;
  routeRecalculations: number;
  changeDetectionsConfirmed: number;
}

// -------------------------------------------------------------
// SUPABASE AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)
// -------------------------------------------------------------
export type UserRole =
  | 'administrator'
  | 'operations_officer'
  | 'medical_officer'
  | 'read_only_viewer';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  callsign?: string;
  unit?: string;
  approvalStatus?: ApprovalStatus;
  soldierId?: string;
  badgeName?: string;
  regimentNo?: string;
  heightCm?: number;
  weightKg?: number;
  ageYears?: number;
  isDemo?: boolean;
}

export interface AuthSession {
  token: string;
  user: UserProfile;
  expiresAt?: number;
}

export interface AccountProfile {
  id: string;
  authUserId: string;
  email: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  soldierId: string;
  badgeName: string;
  regimentNo: string;
  heightCm: number;
  weightKg: number;
  ageYears: number;
  profileRecordedAt: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  decisionReason?: string;
}

export interface RegistrationDecisionInput {
  decision: 'approved' | 'rejected' | 'suspended';
  reason?: string;
  role?: UserRole;
}

export interface RegistrationDecisionAudit {
  id: string;
  registrationId: string;
  previousStatus: ApprovalStatus;
  newStatus: ApprovalStatus;
  decisionBy: string;
  decisionAt: string;
  reason?: string;
}

// -------------------------------------------------------------
// MODULE: SOLDIER VITALS & HEALTH MONITORING
// -------------------------------------------------------------
export interface SoldierProfile {
  id: string; // e.g. 'SOL-001'
  callsign: string; // e.g. 'SOL-001 (Aarav)'
  unit: string; // e.g. '1st Recon Team (CCP Delta)'
  status: 'active' | 'in_transit' | 'standby';
  authUserId?: string;
  badgeName?: string;
  regimentNo?: string;
  heightCm?: number;
  weightKg?: number;
  ageYears?: number;
  profileRecordedAt?: string;
  approvalStatus?: ApprovalStatus;
}

export interface SoldierVitalsRecord {
  id: string;
  soldierId: string;
  callsign: string;
  unit: string;
  timestamp: string;
  heartRateBpm?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  temperatureCelsius?: number;
  oxygenSaturationPct?: number;
  respiratoryRateBpm?: number;
  clinicalNotes?: string;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
  isSimulated: true;
}

export interface CreateSoldierVitalsInput {
  soldierId: string;
  timestamp?: string;
  heartRateBpm?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  temperatureCelsius?: number;
  oxygenSaturationPct?: number;
  respiratoryRateBpm?: number;
  clinicalNotes?: string;
}

// -------------------------------------------------------------
// MODULE: SOLDIER PHYSICAL ACTIVITY & AI RISK REVIEW
// -------------------------------------------------------------
export type ActivityType = 'running' | 'marching' | 'lifting' | 'calisthenics' | 'patrol';
export type ActivityIntensity = 'low' | 'moderate' | 'high' | 'maximum';

export interface SoldierActivity {
  id: string;
  soldierId: string;
  activityType: ActivityType;
  durationMinutes: number;
  intensity: ActivityIntensity;
  carriedLoadKg?: number;
  restRecoveryInfo?: string;
  environmentalConditions?: {
    temperatureCelsius?: number;
    humidityPct?: number;
    terrain?: string;
  };
  notes?: string;
  recordedAt: string;
  isSimulated?: true;
}

export interface CreateSoldierActivityInput {
  soldierId: string;
  activityType: ActivityType;
  durationMinutes: number;
  intensity: ActivityIntensity;
  carriedLoadKg?: number;
  restRecoveryInfo?: string;
  environmentalConditions?: {
    temperatureCelsius?: number;
    humidityPct?: number;
    terrain?: string;
  };
  notes?: string;
}

export type ActivityRiskStatus = 'needs_review' | 'no_specific_concern_identified' | 'insufficient_data';

export interface ActivityRiskReview {
  id: string;
  activityId: string;
  soldierId: string;
  status: ActivityRiskStatus;
  summary: string;
  concerns: Array<{
    description: string;
    evidenceFieldIds: string[];
  }>;
  missingInputs: string[];
  suggestedNextSteps: string[];
  limitations: string[];
  modelIdentifier: string;
  generatedAt: string;
  isSimulated?: boolean;
}


