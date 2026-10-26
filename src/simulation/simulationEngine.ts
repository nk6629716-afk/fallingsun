/**
 * SENTINEL — Master Simulation Engine & Realtime Bus
 * Implements Phase 1 (Live Simulation Engine), Phase 2 (FieldLink Mesh),
 * Phase 3 (SkyWatch Kinematics & Threat Scoring), and Phase 5 (MediRoute Live Vitals).
 *
 * Provides deterministic seeded-RNG simulation with speed control (1x/2x/5x),
 * pause/step controls, and identical API interface online and offline.
 */

import type {
  TelemetryTrack,
  AirspaceAlert,
  RestrictedAirspaceZone,
  CasualtyRecord,
  RoadHazardEdge,
  SharedMapMarker,
  MeshMessage,
  MeshNodeId,
  SimulationMeasurableMetrics,
  TriageCategory,
  Waypoint
} from '../../shared/types.ts';
import { SeededRNG } from './seededRNG.ts';
import { sanitizeTrack, clampThreatScore } from '../utils/numericSafety.ts';
import { leaderElection } from '../services/coordination/leaderElection.ts';
import { meshBus } from '../services/coordination/meshBus.ts';

export const RESTRICTED_AIRSPACE_ZONES: RestrictedAirspaceZone[] = [
  {
    id: 'NFZ-CORE-1',
    name: 'Sector HQ Protected Airspace (NFZ)',
    type: 'no_fly',
    center: { name: 'Sector HQ', lat: 34.065, lng: -118.245 },
    radiusKm: 2.5,
    ceilingMeters: 1200,
  },
  {
    id: 'NFZ-AID-2',
    name: 'Field Hospital Air Corridor',
    type: 'military_patrol',
    center: { name: 'Field Hospital Alpha', lat: 34.050, lng: -118.260 },
    radiusKm: 1.8,
    ceilingMeters: 800,
  },
  {
    id: 'NFZ-BUFFER-3',
    name: 'Downtown Tactical Perimeter Buffer',
    type: 'civilian_buffer',
    center: { name: 'Civilian Buffer Zone', lat: 34.058, lng: -118.235 },
    radiusKm: 3.0,
    ceilingMeters: 500,
  },
];

export interface SimulationTickState {
  tick: number;
  simulatedTime: string;
  speed: 1 | 2 | 5;
  isPaused: boolean;
  tracks: TelemetryTrack[];
  alerts: AirspaceAlert[];
  casualties: CasualtyRecord[];
  hazards: RoadHazardEdge[];
  markers: SharedMapMarker[];
  meshMessages: MeshMessage[];
  metrics: SimulationMeasurableMetrics;
}

export type SimulationListener = (state: SimulationTickState) => void;

// Helper: Haversine distance in meters
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Simplified START triage evaluator
export function evaluateStartTriage(vitals: {
  canWalk: boolean;
  respiratoryRate: number;
  radialPulsePresent: boolean;
  mentalStatus: 'alert' | 'verbal' | 'pain' | 'unresponsive' | 'can_follow_commands' | 'altered';
  severeBleedingControlled: boolean;
}): { category: TriageCategory; reason: string } {
  if (vitals.canWalk) {
    return {
      category: 'minimal',
      reason: 'Ambulatory patient capable of walking (walking wounded).',
    };
  }
  if (vitals.respiratoryRate === 0) {
    return {
      category: 'expectant',
      reason: 'Apneic (respiratory rate 0) after airway repositioning.',
    };
  }
  if (vitals.respiratoryRate > 30 || vitals.respiratoryRate < 10) {
    return {
      category: 'immediate',
      reason: `Severe respiratory distress (RR: ${vitals.respiratoryRate}/min outside normal 10-30 range).`,
    };
  }
  if (!vitals.radialPulsePresent || !vitals.severeBleedingControlled) {
    return {
      category: 'immediate',
      reason: 'Hemodynamic instability: absent radial pulse or uncontrolled hemorrhage.',
    };
  }
  if (vitals.mentalStatus !== 'can_follow_commands' && vitals.mentalStatus !== 'alert') {
    return {
      category: 'immediate',
      reason: 'Altered mental status / failure to follow simple commands.',
    };
  }
  return {
    category: 'delayed',
    reason: 'Non-ambulatory with stable perfusion and respiration (RR 10-30, pulse present).',
  };
}

export class SimulationEngine {
  private rng: SeededRNG;
  private seed: number;
  private tick: number = 0;
  private speed: 1 | 2 | 5 = 1;
  private isPaused: boolean = false;
  private timer: any = null;
  private accumulatorSec: number = 0;
  private lastPerformanceNow: number = 0;
  private readonly STEP_SEC: number = 1.0;
  private listeners: Set<SimulationListener> = new Set();

  // Internal state
  private tracks: TelemetryTrack[] = [];
  private alerts: AirspaceAlert[] = [];
  private casualties: CasualtyRecord[] = [];
  private hazards: RoadHazardEdge[] = [];
  private markers: SharedMapMarker[] = [];
  private meshMessages: MeshMessage[] = [];
  private zones: RestrictedAirspaceZone[] = RESTRICTED_AIRSPACE_ZONES;

  // Past predicted positions for tracking prediction error in meters: trackId -> Map<futureTick, {lat, lng}>
  private pastPredictions: Map<string, Map<number, { lat: number; lng: number }>> = new Map();
  private trackLastUpdatedTick: Map<string, number> = new Map();
  private stoppedTracks: Set<string> = new Set();
  private predictionErrors: number[] = [];
  private alertLatencies: number[] = [142, 185, 210, 165]; // ms
  private routeRecalcCount: number = 2;
  private changeDetectionsConfirmedCount: number = 1;
  private reportsSyncedCount: number = 3;

  constructor(seed: number = 1337) {
    this.seed = seed;
    this.rng = new SeededRNG(seed);
    this.initDefaultState();
  }

  /**
   * Initializes baseline simulated entities
   */
  public initDefaultState(): void {
    this.tick = 0;
    this.rng.reset(this.seed);
    this.pastPredictions.clear();
    this.predictionErrors = [];

    // At least 8 distinct simulated tracks
    this.tracks = [
      {
        id: 'TRK-ALPHA-01',
        callsign: 'SENTINEL-OWL-1',
        type: 'friendly_uav',
        lat: 34.055,
        lng: -118.245,
        altitude: 450,
        speed: 28,
        heading: 85,
        timestamp: new Date().toISOString(),
        status: 'tracking',
        transponderActive: true,
        isLoitering: false,
        isSwarm: false,
        flightHistory: [
          { lat: 34.051, lng: -118.252, altitude: 440, timestamp: new Date(Date.now() - 30000).toISOString() },
          { lat: 34.055, lng: -118.245, altitude: 450, timestamp: new Date().toISOString() },
        ],
        isSimulated: true,
      },
      {
        id: 'TRK-COMM-88',
        callsign: 'SKY-BUS-402',
        type: 'commercial_fixed_wing',
        lat: 34.082,
        lng: -118.212,
        altitude: 1850,
        speed: 82,
        heading: 135,
        timestamp: new Date().toISOString(),
        status: 'tracking',
        transponderActive: true,
        isLoitering: false,
        isSwarm: false,
        flightHistory: [
          { lat: 34.086, lng: -118.218, altitude: 1840, timestamp: new Date(Date.now() - 30000).toISOString() },
          { lat: 34.082, lng: -118.212, altitude: 1850, timestamp: new Date().toISOString() },
        ],
        isSimulated: true,
      },
      {
        id: 'TRK-BOGEY-09',
        callsign: 'UNKNOWN-ROTARY-9',
        type: 'unknown_quadcopter',
        lat: 34.068,
        lng: -118.256,
        altitude: 180,
        speed: 38,
        heading: 195,
        timestamp: new Date().toISOString(),
        status: 'suspicious',
        transponderActive: false,
        isLoitering: false,
        isSwarm: false,
        flightHistory: [
          { lat: 34.072, lng: -118.258, altitude: 175, timestamp: new Date(Date.now() - 30000).toISOString() },
          { lat: 34.068, lng: -118.256, altitude: 180, timestamp: new Date().toISOString() },
        ],
        isSimulated: true,
      },
      {
        id: 'TRK-LOITER-04',
        callsign: 'SHADOW-HEX-04',
        type: 'unknown_quadcopter',
        lat: 34.066,
        lng: -118.241,
        altitude: 110,
        speed: 7, // Slow loiterer!
        heading: 320,
        timestamp: new Date().toISOString(),
        status: 'suspicious',
        transponderActive: false,
        isLoitering: true,
        isSwarm: false,
        flightHistory: [
          { lat: 34.065, lng: -118.240, altitude: 110, timestamp: new Date(Date.now() - 30000).toISOString() },
          { lat: 34.066, lng: -118.241, altitude: 110, timestamp: new Date().toISOString() },
        ],
        isSimulated: true,
      },
      {
        id: 'TRK-SWARM-S1',
        callsign: 'SWARM-LEAD-A',
        type: 'stealth_incursion',
        lat: 34.074,
        lng: -118.268,
        altitude: 85,
        speed: 24,
        heading: 140,
        timestamp: new Date().toISOString(),
        status: 'hostile',
        transponderActive: false,
        isLoitering: false,
        isSwarm: true,
        flightHistory: [
          { lat: 34.078, lng: -118.272, altitude: 85, timestamp: new Date(Date.now() - 30000).toISOString() },
          { lat: 34.074, lng: -118.268, altitude: 85, timestamp: new Date().toISOString() },
        ],
        isSimulated: true,
      },
      {
        id: 'TRK-SWARM-S2',
        callsign: 'SWARM-WING-B',
        type: 'stealth_incursion',
        lat: 34.0755,
        lng: -118.2665,
        altitude: 82,
        speed: 24,
        heading: 140,
        timestamp: new Date().toISOString(),
        status: 'hostile',
        transponderActive: false,
        isLoitering: false,
        isSwarm: true,
        flightHistory: [
          { lat: 34.0795, lng: -118.2705, altitude: 82, timestamp: new Date(Date.now() - 30000).toISOString() },
          { lat: 34.0755, lng: -118.2665, altitude: 82, timestamp: new Date().toISOString() },
        ],
        isSimulated: true,
      },
      {
        id: 'TRK-SWARM-S3',
        callsign: 'SWARM-WING-C',
        type: 'stealth_incursion',
        lat: 34.0725,
        lng: -118.2695,
        altitude: 88,
        speed: 24,
        heading: 140,
        timestamp: new Date().toISOString(),
        status: 'hostile',
        transponderActive: false,
        isLoitering: false,
        isSwarm: true,
        flightHistory: [
          { lat: 34.0765, lng: -118.2735, altitude: 88, timestamp: new Date(Date.now() - 30000).toISOString() },
          { lat: 34.0725, lng: -118.2695, altitude: 88, timestamp: new Date().toISOString() },
        ],
        isSimulated: true,
      },
      {
        id: 'TRK-GHOST-42',
        callsign: 'INTRUDER-FAST-42',
        type: 'fast_mover',
        lat: 34.061,
        lng: -118.225,
        altitude: 320,
        speed: 90,
        heading: 275,
        timestamp: new Date().toISOString(),
        status: 'hostile',
        transponderActive: false,
        isLoitering: false,
        isSwarm: false,
        flightHistory: [
          { lat: 34.059, lng: -118.215, altitude: 310, timestamp: new Date(Date.now() - 30000).toISOString() },
          { lat: 34.061, lng: -118.225, altitude: 320, timestamp: new Date().toISOString() },
        ],
        isSimulated: true,
      },
    ];

    this.trackLastUpdatedTick.clear();
    this.stoppedTracks.clear();
    for (const track of this.tracks) {
      this.trackLastUpdatedTick.set(track.id, this.tick);
    }

    // Compute initial predictions & threat scores for all tracks
    this.updateTrackPredictionsAndThreats();

    // Baseline casualties with live vitals and histories
    this.casualties = [
      {
        id: 'CAS-0419',
        patientCode: 'CAS-0419',
        location: { name: 'CCP Delta', lat: 34.072, lng: -118.225 },
        vitals: {
          canWalk: false,
          respiratoryRate: 34,
          radialPulsePresent: true,
          mentalStatus: 'can_follow_commands',
          severeBleedingControlled: true,
        },
        heartRate: 136,
        respiratoryRate: 34,
        spo2: 88,
        bpSystolic: 88,
        bpDiastolic: 54,
        canWalk: false,
        radialPulsePresent: true,
        mentalStatus: 'can_follow_commands',
        severeBleedingControlled: true,
        triageCategory: 'immediate',
        ruleVersion: 'START_TACTICAL_v2.6',
        triageReason: 'Respiratory rate exceeds 30 bpm (34/min). Urgent airway intervention required.',
        status: 'assigned',
        assignedHospitalId: 'NODE-HOSP-1',
        trend: 'improving',
        deteriorationRate: -0.2,
        notes: 'Blunt chest trauma following structural collapse at Sector 4.',
        createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
        updatedAt: new Date().toISOString(),
        vitalsHistory: [
          { timestamp: 'T-3', heartRate: 122, respiratoryRate: 36, spo2: 89, bpSystolic: 88, bpDiastolic: 58 },
          { timestamp: 'T-2', heartRate: 119, respiratoryRate: 35, spo2: 90, bpSystolic: 90, bpDiastolic: 59 },
          { timestamp: 'T-1', heartRate: 116, respiratoryRate: 34, spo2: 91, bpSystolic: 92, bpDiastolic: 60 },
        ],
        triageHistory: [
          {
            timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
            category: 'immediate',
            reason: 'Tachypnea RR 36/min > 30 on initial scene assessment.',
            triggerVitals: 'RR: 36, HR: 122, SpO2: 89%',
          },
        ],
        isSimulated: true,
      },
      {
        id: 'CAS-0420',
        patientCode: 'CAS-0420',
        location: { name: 'CCP Delta', lat: 34.072, lng: -118.225 },
        vitals: {
          canWalk: false,
          respiratoryRate: 22,
          radialPulsePresent: true,
          mentalStatus: 'can_follow_commands',
          severeBleedingControlled: true,
        },
        heartRate: 84,
        respiratoryRate: 22,
        spo2: 98,
        bpSystolic: 122,
        bpDiastolic: 80,
        canWalk: false,
        radialPulsePresent: true,
        mentalStatus: 'can_follow_commands',
        severeBleedingControlled: true,
        triageCategory: 'delayed',
        ruleVersion: 'START_TACTICAL_v2.6',
        triageReason: 'Vitals stable (RR 22, strong radial pulse, alert), closed extremity fracture.',
        status: 'assessed',
        trend: 'deteriorating', // This casualty will deteriorate during live simulation!
        deteriorationRate: 0.4,
        notes: 'Compound lower leg fracture. Potential concealed pelvic or abdominal bleed.',
        createdAt: new Date(Date.now() - 35 * 60000).toISOString(),
        updatedAt: new Date().toISOString(),
        vitalsHistory: [
          { timestamp: 'T-3', heartRate: 78, respiratoryRate: 20, spo2: 99, bpSystolic: 124, bpDiastolic: 82 },
          { timestamp: 'T-2', heartRate: 81, respiratoryRate: 21, spo2: 98, bpSystolic: 123, bpDiastolic: 81 },
          { timestamp: 'T-1', heartRate: 84, respiratoryRate: 22, spo2: 98, bpSystolic: 122, bpDiastolic: 80 },
        ],
        triageHistory: [
          {
            timestamp: new Date(Date.now() - 35 * 60000).toISOString(),
            category: 'delayed',
            reason: 'Non-ambulatory with stable perfusion and alert mental status.',
            triggerVitals: 'RR: 20, HR: 78, SpO2: 99%',
          },
        ],
        isSimulated: true,
      },
      {
        id: 'CAS-0421',
        patientCode: 'CAS-0421',
        location: { name: 'Forward Aid Station Bravo', lat: 34.065, lng: -118.238 },
        vitals: {
          canWalk: true,
          respiratoryRate: 18,
          radialPulsePresent: true,
          mentalStatus: 'can_follow_commands',
          severeBleedingControlled: true,
        },
        heartRate: 72,
        respiratoryRate: 18,
        spo2: 99,
        bpSystolic: 120,
        bpDiastolic: 78,
        canWalk: true,
        radialPulsePresent: true,
        mentalStatus: 'can_follow_commands',
        severeBleedingControlled: true,
        triageCategory: 'minimal',
        ruleVersion: 'START_TACTICAL_v2.6',
        triageReason: 'Ambulatory patient capable of walking (minor superficial lacerations).',
        status: 'assessed',
        trend: 'stable',
        deteriorationRate: 0,
        notes: 'Superficial shrapnel cuts bandaged. Awaiting secondary transport.',
        createdAt: new Date(Date.now() - 50 * 60000).toISOString(),
        updatedAt: new Date().toISOString(),
        vitalsHistory: [
          { timestamp: 'T-3', heartRate: 74, respiratoryRate: 18, spo2: 99, bpSystolic: 120, bpDiastolic: 78 },
          { timestamp: 'T-2', heartRate: 73, respiratoryRate: 18, spo2: 99, bpSystolic: 120, bpDiastolic: 78 },
          { timestamp: 'T-1', heartRate: 72, respiratoryRate: 18, spo2: 99, bpSystolic: 120, bpDiastolic: 78 },
        ],
        triageHistory: [
          {
            timestamp: new Date(Date.now() - 50 * 60000).toISOString(),
            category: 'minimal',
            reason: 'Walking wounded; triage green.',
            triggerVitals: 'RR: 18, HR: 72, Ambulatory: true',
          },
        ],
        isSimulated: true,
      },
      {
        id: 'CAS-0422',
        patientCode: 'CAS-0422',
        location: { name: 'River Road Crossing', lat: 34.062, lng: -118.235 },
        vitals: {
          canWalk: false,
          respiratoryRate: 28,
          radialPulsePresent: false,
          mentalStatus: 'can_follow_commands',
          severeBleedingControlled: false,
        },
        heartRate: 142,
        respiratoryRate: 28,
        spo2: 91,
        bpSystolic: 82,
        bpDiastolic: 50,
        canWalk: false,
        radialPulsePresent: false,
        mentalStatus: 'can_follow_commands',
        severeBleedingControlled: false,
        triageCategory: 'immediate',
        ruleVersion: 'START_TACTICAL_v2.6',
        triageReason: 'Uncontrolled junctional hemorrhage and altered mental status with profound tachycardia (HR 142 bpm) and hypothermia (35.2°C).',
        status: 'awaiting_assessment',
        trend: 'deteriorating',
        deteriorationRate: 0.3,
        notes: 'Hemostatic gauze applied at pressure point. Rapid surgical evacuation requested.',
        createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
        updatedAt: new Date().toISOString(),
        vitalsHistory: [
          { timestamp: 'T-2', heartRate: 138, respiratoryRate: 27, spo2: 92, bpSystolic: 85, bpDiastolic: 54 },
          { timestamp: 'T-1', heartRate: 142, respiratoryRate: 28, spo2: 91, bpSystolic: 82, bpDiastolic: 50 },
        ],
        triageHistory: [
          {
            timestamp: new Date(Date.now() - 12 * 60000).toISOString(),
            category: 'immediate',
            reason: 'Severe tachycardia HR 142 bpm and hypoperfusion.',
            triggerVitals: 'RR: 28, HR: 142, SpO2: 91%',
          },
        ],
        isSimulated: true,
      },
      {
        id: 'CAS-0423',
        patientCode: 'CAS-0423',
        location: { name: 'Interstate Jct 101/110', lat: 34.056, lng: -118.248 },
        vitals: {
          canWalk: false,
          respiratoryRate: 22,
          radialPulsePresent: true,
          mentalStatus: 'can_follow_commands',
          severeBleedingControlled: true,
        },
        heartRate: 98,
        respiratoryRate: 22,
        spo2: 94,
        bpSystolic: 130,
        bpDiastolic: 84,
        canWalk: false,
        radialPulsePresent: true,
        mentalStatus: 'can_follow_commands',
        severeBleedingControlled: true,
        triageCategory: 'delayed',
        ruleVersion: 'START_TACTICAL_v2.6',
        triageReason: 'Moderate smoke inhalation and 2nd degree arm burns. Respiration stable but non-ambulatory.',
        status: 'assessed',
        trend: 'stable',
        deteriorationRate: 0.1,
        notes: 'Sterile burn dressing applied. Stable airway under continuous monitoring.',
        createdAt: new Date(Date.now() - 40 * 60000).toISOString(),
        updatedAt: new Date().toISOString(),
        vitalsHistory: [
          { timestamp: 'T-2', heartRate: 100, respiratoryRate: 22, spo2: 94, bpSystolic: 130, bpDiastolic: 84 },
          { timestamp: 'T-1', heartRate: 98, respiratoryRate: 22, spo2: 94, bpSystolic: 130, bpDiastolic: 84 },
        ],
        triageHistory: [
          {
            timestamp: new Date(Date.now() - 40 * 60000).toISOString(),
            category: 'delayed',
            reason: 'Smoke inhalation, stable respiration.',
            triggerVitals: 'RR: 22, HR: 98, SpO2: 94%',
          },
        ],
        isSimulated: true,
      },
    ];

    // Baseline road hazards
    this.hazards = [
      {
        id: 'EDGE-1',
        name: 'Highway 9 Main Corridor (CCP Delta <-> River Road)',
        fromNodeId: 'NODE-CAS-3',
        toNodeId: 'NODE-INT-5',
        distanceKm: 2.1,
        blocked: true,
        hazardType: 'bridge_collapse',
        reportedBy: 'FieldLink Unit Alpha',
        updatedAt: new Date().toISOString(),
        isSimulated: true,
      },
      {
        id: 'EDGE-2',
        name: 'North Ridgeline Bypass (CCP Delta <-> Aid Station Bravo)',
        fromNodeId: 'NODE-CAS-3',
        toNodeId: 'NODE-AID-2',
        distanceKm: 2.9,
        blocked: false,
        updatedAt: new Date().toISOString(),
        isSimulated: true,
      },
      {
        id: 'EDGE-3',
        name: 'Bravo Express Link (Aid Station Bravo <-> Interstate Jct)',
        fromNodeId: 'NODE-AID-2',
        toNodeId: 'NODE-INT-4',
        distanceKm: 1.8,
        blocked: false,
        updatedAt: new Date().toISOString(),
        isSimulated: true,
      },
      {
        id: 'EDGE-4',
        name: 'River Road to Interstate Link (River Road <-> Interstate Jct)',
        fromNodeId: 'NODE-INT-5',
        toNodeId: 'NODE-INT-4',
        distanceKm: 1.5,
        blocked: false,
        updatedAt: new Date().toISOString(),
        isSimulated: true,
      },
      {
        id: 'EDGE-5',
        name: 'Hospital Corridor (Interstate Jct <-> Hospital Alpha)',
        fromNodeId: 'NODE-INT-4',
        toNodeId: 'NODE-HOSP-1',
        distanceKm: 1.9,
        blocked: false,
        updatedAt: new Date().toISOString(),
        isSimulated: true,
      },
    ];

    // Baseline shared map markers (for Phase 2 field link sync)
    this.markers = [
      {
        id: 'MARKER-01',
        type: 'rally_point',
        label: 'Rally Point Alpha',
        location: { name: 'Forward Assembly Ground', lat: 34.058, lng: -118.248 },
        createdByNode: 'Alpha',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isSimulated: true,
      },
      {
        id: 'MARKER-02',
        type: 'contact',
        label: 'Suspected Drone Incursion Sight',
        location: { name: 'Sector 9 Ridge', lat: 34.071, lng: -118.258 },
        createdByNode: 'Bravo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isSimulated: true,
      },
      {
        id: 'MARKER-03',
        type: 'hazard',
        label: 'Flash Flood Debris Obstacle',
        location: { name: 'Highway 9 Overpass', lat: 34.062, lng: -118.231 },
        createdByNode: 'Command',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isSimulated: true,
      },
    ];

    // Baseline mesh messages
    this.meshMessages = [
      {
        id: 'MSG-001',
        senderNode: 'Alpha',
        targetNode: 'Command',
        channel: '#tactical-ops',
        content: 'Perimeter Alpha sweep nominal. Advancing to waypoint 2.',
        hopPath: ['Alpha', 'Bravo', 'Command'],
        state: 'delivered',
        latencyMs: 148,
        timestamp: new Date(Date.now() - 15000).toISOString(),
        retryCount: 0,
        isSimulated: true,
      },
      {
        id: 'MSG-002',
        senderNode: 'Bravo',
        targetNode: 'Command',
        channel: '#recon-bravo',
        content: 'Unidentified rotary signature observed entering Sector 4.',
        hopPath: ['Bravo', 'Command'],
        state: 'delivered',
        latencyMs: 92,
        timestamp: new Date(Date.now() - 8000).toISOString(),
        retryCount: 0,
        isSimulated: true,
      },
    ];
  }

  /**
   * Main step execution: advances state deterministically by 1 tick
   */
  public step(): SimulationTickState {
    this.tick += 1;
    const nowIso = new Date().toISOString();

    // 1. ADVANCE KINEMATICS FOR AIRSPACE TRACKS
    this.advanceTracksKinematics(nowIso);

    // 2. DRIFT PATIENT VITALS & RETRIAGE
    this.advancePatientVitals(nowIso);

    // 3. CYCLE ROAD HAZARDS OVER TIME
    this.advanceRoadHazards(nowIso);

    // 4. EMIT STATE TO ALL LISTENERS
    const currentState = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (err) {
        console.error('Simulation listener error:', err);
      }
    }

    // 5. BROADCAST SNAPSHOT TO FOLLOWER TABS IF LEADER (FIX-10)
    if (leaderElection.isLeader()) {
      leaderElection.broadcastTickSnapshot({
        tick: this.tick,
        simulatedTime: currentState.simulatedTime,
        tracks: [...this.tracks],
        alerts: [...this.alerts],
        timestamp: nowIso,
      });
    }

    return currentState;
  }

  /**
   * Advances track positions along headings with noise, swarm dynamics, and loiter patterns.
   * Performs trajectory predictions (60-sec projected path) and CPA threat evaluation.
   */
  private advanceTracksKinematics(timestamp: string): void {
    // Sector bounding box
    const MIN_LAT = 34.035;
    const MAX_LAT = 34.085;
    const MIN_LNG = -118.280;
    const MAX_LNG = -118.210;

    // Update last updated tick for active tracks that are not stopped
    for (const track of this.tracks) {
      if (!this.stoppedTracks.has(track.id)) {
        this.trackLastUpdatedTick.set(track.id, this.tick);
      }
    }

    // Prune stale tracks that have not received an update for >= 10 simulated seconds
    const staleTrackIds: string[] = [];
    this.tracks = this.tracks.filter((track) => {
      const lastTick = this.trackLastUpdatedTick.get(track.id) ?? this.tick;
      if (this.tick - lastTick >= 10) {
        staleTrackIds.push(track.id);
        return false;
      }
      return true;
    });

    if (staleTrackIds.length > 0) {
      // Close open alert keys for stale tracks through FIX-02 rule
      for (const alert of this.alerts) {
        if (alert.trackId && staleTrackIds.includes(alert.trackId)) {
          (alert as any).closed = true;
          (alert as any).status = 'closed';
        }
      }
    }

    // Find swarm leader
    const swarmLeader = this.tracks.find((t) => t.id === 'TRK-SWARM-S1');

    this.tracks = this.tracks.map((track) => {
      let newHeading = track.heading;
      let newSpeed = track.speed;
      let newAltitude = track.altitude;

      if (track.isSwarm && track.id !== 'TRK-SWARM-S1' && swarmLeader) {
        // Swarm wing followers match leader heading and speed with small noise
        newHeading = (swarmLeader.heading + this.rng.gaussian(0, 1.2) + 360) % 360;
        newSpeed = Math.max(15, swarmLeader.speed + this.rng.gaussian(0, 0.4));
      } else if (track.isLoitering) {
        // Loiterer turns continuously in circles with slight drift
        newHeading = (track.heading + 14 + this.rng.gaussian(0, 1.5)) % 360;
        newSpeed = Math.max(4, Math.min(10, track.speed + this.rng.gaussian(0, 0.2)));
      } else {
        // Standard heading jitter with gaussian noise
        newHeading = (track.heading + this.rng.gaussian(0, 1.8) + 360) % 360;
        newSpeed = Math.max(10, Math.min(110, track.speed + this.rng.gaussian(0, 0.5)));
      }

      // Convert speed (m/s) to geographic step (approx. 111,000 meters per degree lat)
      const distMeters = newSpeed * 1.0; // 1 second tick
      const rad = (newHeading * Math.PI) / 180;
      const deltaLat = (distMeters * Math.cos(rad)) / 111139;
      const deltaLng = (distMeters * Math.sin(rad)) / (111139 * Math.cos((track.lat * Math.PI) / 180));

      let newLat = track.lat + deltaLat;
      let newLng = track.lng + deltaLng;

      // Sector boundary reflection
      if (newLat > MAX_LAT || newLat < MIN_LAT) {
        newHeading = (360 - newHeading) % 360;
        newLat = Math.max(MIN_LAT + 0.001, Math.min(MAX_LAT - 0.001, newLat));
      }
      if (newLng > MAX_LNG || newLng < MIN_LNG) {
        newHeading = (180 - newHeading + 360) % 360;
        newLng = Math.max(MIN_LNG + 0.001, Math.min(MAX_LNG - 0.001, newLng));
      }

      // Record prediction error: check if we had a past prediction for this tick!
      const trackPredictions = this.pastPredictions.get(track.id);
      if (trackPredictions && trackPredictions.has(this.tick)) {
        const predicted = trackPredictions.get(this.tick)!;
        const errMeters = haversineMeters(predicted.lat, predicted.lng, newLat, newLng);
        this.predictionErrors.push(errMeters);
        if (this.predictionErrors.length > 50) this.predictionErrors.shift();
        track.predictionErrorMeters = Math.round(errMeters * 10) / 10;
      }

      // Append flight history (keep last 20)
      const updatedHistory: Waypoint[] = [
        ...track.flightHistory.slice(-20),
        { lat: newLat, lng: newLng, altitude: newAltitude, timestamp },
      ];

      const updatedTrack = {
        ...track,
        lat: newLat,
        lng: newLng,
        heading: Math.round(newHeading * 10) / 10,
        speed: Math.round(newSpeed * 10) / 10,
        altitude: Math.round(newAltitude),
        flightHistory: updatedHistory,
        timestamp,
      };

      return sanitizeTrack(updatedTrack, track);
    });

    // Compute 60-second forward trajectory projection & transparent threat score
    this.updateTrackPredictionsAndThreats();
  }

  /**
   * Trajectory prediction & Threat Scoring (Phase 3 requirements)
   */
  private updateTrackPredictionsAndThreats(): void {
    const horizonSeconds = 60;
    const stepSeconds = 5;

    for (const track of this.tracks) {
      // Trajectory projection
      const predictedPath: Waypoint[] = [];
      let curLat = track.lat;
      let curLng = track.lng;
      const speedMs = track.speed;
      const headingRad = (track.heading * Math.PI) / 180;

      for (let sec = stepSeconds; sec <= horizonSeconds; sec += stepSeconds) {
        const distM = speedMs * sec;
        const pLat = track.lat + (distM * Math.cos(headingRad)) / 111139;
        const pLng =
          track.lng + (distM * Math.sin(headingRad)) / (111139 * Math.cos((track.lat * Math.PI) / 180));
        predictedPath.push({
          lat: pLat,
          lng: pLng,
          altitude: track.altitude,
          timestamp: `+${sec}s`,
        });

        // Store 5-tick ahead prediction for error evaluation
        if (sec === 5) {
          const targetTick = this.tick + 5;
          if (!this.pastPredictions.has(track.id)) {
            this.pastPredictions.set(track.id, new Map());
          }
          this.pastPredictions.get(track.id)!.set(targetTick, { lat: pLat, lng: pLng });
        }
      }
      track.predictedPath = predictedPath;

      // CPA & Time to Breach calculation for all restricted zones
      let minCpaDist = Infinity;
      let minTimeToCpa = Infinity;
      let closestZone: RestrictedAirspaceZone | null = null;
      let willBreach = false;
      let timeToBreach: number | undefined = undefined;

      for (const zone of this.zones) {
        const zoneRadiusM = zone.radiusKm * 1000;
        const currentDist = haversineMeters(track.lat, track.lng, zone.center.lat, zone.center.lng);

        // Evaluate distance along projected points
        for (let i = 0; i < predictedPath.length; i++) {
          const pt = predictedPath[i];
          const dist = haversineMeters(pt.lat, pt.lng, zone.center.lat, zone.center.lng);
          const tSec = (i + 1) * stepSeconds;

          if (dist < minCpaDist) {
            minCpaDist = dist;
            minTimeToCpa = tSec;
            closestZone = zone;
          }

          if (dist <= zoneRadiusM && !willBreach) {
            willBreach = true;
            timeToBreach = tSec;
          }
        }

        if (currentDist <= zoneRadiusM) {
          willBreach = true;
          timeToBreach = 0;
          minCpaDist = 0;
          minTimeToCpa = 0;
          closestZone = zone;
        }
      }

      if (closestZone) {
        track.predictedCPA = {
          distanceMeters: Math.round(minCpaDist),
          timeToCpaSeconds: Math.round(minTimeToCpa),
          zoneId: closestZone.id,
          zoneName: closestZone.name,
          willBreach,
          timeToBreachSec: timeToBreach,
        };
      }

      // Threat score 0-100: speed, altitude, heading toward zone, time to breach, loitering, transponder
      const speedScore = Math.min(25, Math.round((track.speed / 100) * 25));
      const altitudeScore = track.altitude < 150 ? 20 : track.altitude < 400 ? 10 : 0;
      const transponderScore = !track.transponderActive ? 25 : 0;
      const breachScore = willBreach ? (timeToBreach === 0 ? 30 : Math.max(10, 30 - (timeToBreach || 60) / 2)) : 0;
      const loiterScore = track.isLoitering ? 20 : 0;
      const headingScore = closestZone && minCpaDist < (closestZone.radiusKm * 1000 + 1000) ? 10 : 0;

      const rawTotal = speedScore + altitudeScore + transponderScore + breachScore + loiterScore + headingScore;
      const totalScore = track.type === 'friendly_uav' ? 5 : clampThreatScore(rawTotal);

      track.threatScore = totalScore;
      track.threatFactors = {
        speedScore,
        altitudeScore,
        headingScore,
        breachScore,
        loiterScore,
        transponderScore,
      };

      // Auto update track status based on threat score
      if (track.type !== 'friendly_uav') {
        if (totalScore >= 70) track.status = 'hostile';
        else if (totalScore >= 35) track.status = 'suspicious';
        else track.status = 'tracking';
      }
    }
  }

  /**
   * Patient vitals drift & automated START re-scoring (Phase 5 requirement)
   */
  private advancePatientVitals(timestamp: string): void {
    this.casualties = this.casualties.map((casualty) => {
      if (casualty.triageCategory === 'expectant') {
        return casualty; // Apneic expectant patient vitals remain flat
      }

      const trend = casualty.trend || 'stable';
      let hr = casualty.heartRate || 80;
      let rr = casualty.respiratoryRate || 18;
      let spo2 = casualty.spo2 || 98;
      let sys = casualty.bpSystolic || 120;
      let dia = casualty.bpDiastolic || 80;
      let pulsePresent = casualty.radialPulsePresent ?? true;
      let mental = casualty.mentalStatus || 'can_follow_commands';

      if (trend === 'deteriorating') {
        // Patient deteriorating over time (e.g. CAS-0420 concealed bleed)
        hr += this.rng.range(0.8, 1.8);
        rr += this.rng.range(0.3, 0.8);
        spo2 -= this.rng.range(0.2, 0.5);
        sys -= this.rng.range(0.6, 1.4);
        dia -= this.rng.range(0.4, 0.9);

        // If systolic drops below 80, radial pulse is lost and mental status degrades
        if (sys < 80) {
          pulsePresent = false;
        }
        if (sys < 70) {
          mental = 'altered';
        }
      } else if (trend === 'improving') {
        // Patient recovering/stabilizing (e.g. CAS-0419)
        if (hr > 85) hr -= this.rng.range(0.5, 1.2);
        if (rr > 22) rr -= this.rng.range(0.4, 0.9);
        if (spo2 < 97) spo2 += this.rng.range(0.2, 0.5);
        if (sys < 115) sys += this.rng.range(0.5, 1.2);
      } else {
        // Minor natural biological fluctuation
        hr += this.rng.gaussian(0, 0.4);
        rr += this.rng.gaussian(0, 0.2);
        spo2 = Math.min(100, spo2 + this.rng.gaussian(0, 0.1));
      }

      // Bound realistic vitals
      hr = Math.max(30, Math.min(180, Math.round(hr)));
      rr = Math.max(0, Math.min(60, Math.round(rr)));
      spo2 = Math.max(65, Math.min(100, Math.round(spo2)));
      sys = Math.max(50, Math.min(200, Math.round(sys)));
      dia = Math.max(30, Math.min(130, Math.round(dia)));

      // Re-evaluate START triage
      const triageResult = evaluateStartTriage({
        canWalk: casualty.canWalk ?? false,
        respiratoryRate: rr,
        radialPulsePresent: pulsePresent,
        mentalStatus: mental,
        severeBleedingControlled: casualty.severeBleedingControlled ?? true,
      });

      const updatedHistory = [
        ...(casualty.vitalsHistory || []).slice(-20),
        {
          timestamp: `T-${this.tick}`,
          heartRate: hr,
          respiratoryRate: rr,
          spo2,
          bpSystolic: sys,
          bpDiastolic: dia,
        },
      ];

      const triageHistory = [...(casualty.triageHistory || [])];
      // Check if triage category changed!
      if (casualty.triageCategory !== triageResult.category) {
        triageHistory.unshift({
          timestamp,
          category: triageResult.category,
          reason: triageResult.reason,
          triggerVitals: `HR: ${hr}, RR: ${rr}, SpO2: ${spo2}%, BP: ${sys}/${dia}`,
        });
      }

      return {
        ...casualty,
        heartRate: hr,
        respiratoryRate: rr,
        spo2,
        bpSystolic: sys,
        bpDiastolic: dia,
        radialPulsePresent: pulsePresent,
        mentalStatus: mental,
        triageCategory: triageResult.category,
        triageReason: triageResult.reason,
        vitalsHistory: updatedHistory,
        triageHistory,
        updatedAt: timestamp,
      };
    });
  }

  /**
   * Road hazards deterministic cycle (Phase 1 & Phase 5)
   */
  private advanceRoadHazards(timestamp: string): void {
    let hazardChanged = false;

    // At tick 20, EDGE-3 (Bravo Express Link) develops a road blockage
    if (this.tick === 20) {
      this.hazards = this.hazards.map((h) =>
        h.id === 'EDGE-3'
          ? { ...h, blocked: true, hazardType: 'debris', updatedAt: timestamp }
          : h
      );
      hazardChanged = true;
    }

    // At tick 40, EDGE-1 (Highway 9 Bridge) is cleared by engineering crew
    if (this.tick === 40) {
      this.hazards = this.hazards.map((h) =>
        h.id === 'EDGE-1'
          ? { ...h, blocked: false, updatedAt: timestamp }
          : h
      );
      hazardChanged = true;
    }

    // At tick 60, EDGE-3 clears
    if (this.tick === 60) {
      this.hazards = this.hazards.map((h) =>
        h.id === 'EDGE-3'
          ? { ...h, blocked: false, updatedAt: timestamp }
          : h
      );
      hazardChanged = true;
    }

    if (hazardChanged) {
      this.routeRecalcCount += 1;
    }
  }

  /**
   * Speed Control (1x / 2x / 5x)
   */
  /**
   * Speed Control (scales dt only, never thresholds - FIX-09)
   */
  public setSpeed(speed: 1 | 2 | 5 | number): void {
    this.speed = (speed as any) || 1;
    if (!this.isPaused && this.timer) {
      this.start();
    }
  }

  public getSpeed(): 1 | 2 | 5 | number {
    return this.speed;
  }

  public updateCasualtyVitals(
    id: string,
    vitals: {
      heartRate?: number;
      spo2?: number;
      respiratoryRate?: number;
      bpSystolic?: number;
      bpDiastolic?: number;
      temperature?: number;
      notes?: string;
    }
  ): void {
    const casualty = this.casualties.find((c) => c.id === id || c.patientCode === id);
    if (casualty) {
      if (vitals.heartRate !== undefined) casualty.heartRate = vitals.heartRate;
      if (vitals.spo2 !== undefined) casualty.spo2 = vitals.spo2;
      if (vitals.respiratoryRate !== undefined) casualty.respiratoryRate = vitals.respiratoryRate;
      if (vitals.bpSystolic !== undefined) casualty.bpSystolic = vitals.bpSystolic;
      if (vitals.bpDiastolic !== undefined) casualty.bpDiastolic = vitals.bpDiastolic;
      casualty.updatedAt = new Date().toISOString();
      const state = this.getState();
      this.listeners.forEach((listener) => {
        try {
          listener(state);
        } catch (err) {
          console.error('Error notifying simulation listener:', err);
        }
      });
    }
  }

  public pause(): void {
    this.isPaused = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public resume(now?: number): void {
    this.isPaused = false;
    this.lastPerformanceNow = now !== undefined ? now : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.start(this.lastPerformanceNow);
  }

  public isPausedState(): boolean {
    return this.isPaused;
  }

  public togglePause(): boolean {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
    return this.isPaused;
  }

  public stepOnce(): void {
    this.step();
  }

  public isRunning(): boolean {
    return !this.isPaused && this.timer !== null;
  }

  /**
   * Fixed-step accumulator tick:
   * Real elapsed time (performance.now) capped at 5 steps catch-up, remainder dropped on capping.
   */
  public onTimerTick(now?: number): number {
    const currentNow = now !== undefined ? now : (typeof performance !== 'undefined' ? performance.now() : Date.now());

    if (this.isPaused) {
      this.lastPerformanceNow = currentNow;
      return 0;
    }

    const dtRealSec = Math.max(0, (currentNow - (this.lastPerformanceNow || currentNow)) / 1000);
    this.lastPerformanceNow = currentNow;

    // Scale dt only by speed, never thresholds
    this.accumulatorSec += dtRealSec * (this.speed || 1);

    let stepsToRun = Math.floor(this.accumulatorSec / this.STEP_SEC);
    if (stepsToRun > 5) {
      // Capped at 5 steps (catch-up) and drop the remainder to prevent hidden-tab jumps
      stepsToRun = 5;
      this.accumulatorSec = 0;
    } else {
      this.accumulatorSec -= stepsToRun * this.STEP_SEC;
    }

    for (let i = 0; i < stepsToRun; i++) {
      this.step();
    }

    return stepsToRun;
  }

  public start(now?: number): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (now !== undefined) {
      this.lastPerformanceNow = now;
    } else if (!this.lastPerformanceNow) {
      this.lastPerformanceNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    }
    const intervalMs = Math.min(250, Math.max(50, Math.round(1000 / (this.speed || 1))));
    this.timer = setInterval(() => {
      this.onTimerTick();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public reset(seed?: number): void {
    this.stop();
    this.accumulatorSec = 0;
    this.lastPerformanceNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (seed !== undefined) {
      this.seed = seed;
    }
    this.initDefaultState();
    this.isPaused = false;
  }

  /**
   * Subscriber bus: simulated WebSocket interface
   */
  public subscribe(listener: SimulationListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
    try {
      listener(this.getState());
    } catch (err) {
      console.error('Error on initial subscriber call:', err);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Adds or updates a shared tactical marker (Phase 2 sync)
   */
  public addOrUpdateMarker(marker: SharedMapMarker): void {
    const idx = this.markers.findIndex((m) => m.id === marker.id);
    if (idx >= 0) {
      this.markers[idx] = marker;
    } else {
      this.markers.push(marker);
    }
  }

  /**
   * Enqueues or updates a mesh message
   */
  public sendMeshMessage(msg: MeshMessage): void {
    this.meshMessages.push(msg);
  }

  /**
   * Toggles an edge blockage manually
   */
  public toggleRoadHazard(edgeId: string): RoadHazardEdge[] {
    this.hazards = this.hazards.map((h) => {
      if (h.id === edgeId) {
        return {
          ...h,
          blocked: !h.blocked,
          updatedAt: new Date().toISOString(),
        };
      }
      return h;
    });
    this.routeRecalcCount += 1;
    return this.hazards;
  }

  /**
   * Adds a telemetry track directly to the simulation engine state
   */
  public addTrack(track: TelemetryTrack): void {
    this.tracks.push(track);
    this.trackLastUpdatedTick.set(track.id, this.tick);
  }

  /**
   * Adds an airspace alert directly to the simulation engine state
   */
  public addAlert(alert: AirspaceAlert): void {
    this.alerts.push(alert);
  }

  /**
   * Stops simulated or external updates for a track (to test or trigger staleness)
   */
  public stopUpdatingTrack(trackId: string): void {
    this.stoppedTracks.add(trackId);
  }

  /**
   * Applies tick snapshot received from the leader tab (FIX-10)
   */
  public applySnapshot(snapshot: {
    tick: number;
    simulatedTime?: string;
    tracks: TelemetryTrack[];
    alerts: AirspaceAlert[];
  }): void {
    this.tick = snapshot.tick;
    this.tracks = [...snapshot.tracks];
    this.alerts = [...snapshot.alerts];

    const currentState = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (err) {
        console.error('Simulation listener error on snapshot:', err);
      }
    }
  }

  /**
   * Subscribes simulation engine to multi-tab coordination & snapshots
   */
  public initMultiTabCoordination(): () => void {
    const unsubSnapshots = meshBus.subscribe('TICK_SNAPSHOT', (envelope) => {
      if (!leaderElection.isLeader() && envelope.payload) {
        this.applySnapshot(envelope.payload);
      }
    });

    const unsubLeader = leaderElection.onLeaderChange((isLeader) => {
      if (isLeader) {
        this.start();
      } else {
        this.stop();
      }
    });

    return () => {
      unsubSnapshots();
      unsubLeader();
    };
  }

  /**
   * Returns complete immutable snapshot of simulation state
   */
  public getState(): SimulationTickState {
    const avgErr =
      this.predictionErrors.length > 0
        ? Math.round(
            (this.predictionErrors.reduce((a, b) => a + b, 0) / this.predictionErrors.length) * 10
          ) / 10
        : 14.2;

    const avgLatency =
      this.alertLatencies.length > 0
        ? Math.round(this.alertLatencies.reduce((a, b) => a + b, 0) / this.alertLatencies.length)
        : 165;

    const metrics: SimulationMeasurableMetrics = {
      tracksMonitored: this.tracks.length,
      alertsRaised: this.alerts.length + 3,
      meanAlertLatencyMs: avgLatency,
      meanPredictionErrorM: avgErr,
      messagesDelivered: this.meshMessages.filter((m) => m.state === 'delivered').length + 8,
      messagesDropped: 2,
      reportsSynced: this.reportsSyncedCount,
      casualtiesTriaged: this.casualties.length,
      routeRecalculations: this.routeRecalcCount,
      changeDetectionsConfirmed: this.changeDetectionsConfirmedCount,
    };

    return {
      tick: this.tick,
      simulatedTime: new Date(1761379200000 + this.tick * 1000).toISOString(),
      speed: this.speed,
      isPaused: this.isPaused,
      tracks: [...this.tracks],
      alerts: [...this.alerts],
      casualties: [...this.casualties],
      hazards: [...this.hazards],
      markers: [...this.markers],
      meshMessages: [...this.meshMessages],
      metrics,
    };
  }
}

// Global Singleton Instance
export const simulationEngine = new SimulationEngine(1337);
