import fs from 'fs';
import path from 'path';
import {
  Incident,
  TelemetryTrack,
  Alert,
  GeoIntelObservation,
  Patient,
  HazardEdge,
  RoadGraphNode,
  RoadGraphEdge,
  SyncItemResult,
  SoldierProfile,
  SoldierVitalsRecord,
  AccountProfile,
  RegistrationDecisionAudit,
  SoldierActivity,
  ActivityRiskReview,
  ApprovalStatus,
} from '../../../shared/types';
import {
  INITIAL_INCIDENTS,
  INITIAL_TRACKS,
  INITIAL_ALERTS,
  INITIAL_GEO_OBSERVATIONS,
  INITIAL_PATIENTS,
  INITIAL_HAZARDS,
  ROAD_GRAPH_NODES,
  ROAD_GRAPH_EDGES,
  INITIAL_SOLDIERS,
  INITIAL_SOLDIER_VITALS,
} from '../../../shared/fixtures';
import { config } from '../config';
import { supabaseRepo } from './supabaseRepository';
import { isSupabaseConfigured } from './supabaseClient';

export interface DatabaseState {
  incidents: Record<string, Incident>;
  syncRegistry: Record<string, SyncItemResult>; // maps clientId -> previous outcome
  tracks: Record<string, TelemetryTrack>;
  alerts: Record<string, Alert>;
  observations: Record<string, GeoIntelObservation>;
  patients: Record<string, Patient>;
  hazards: Record<string, HazardEdge>;
  soldiers: Record<string, SoldierProfile>;
  soldierVitals: Record<string, SoldierVitalsRecord>;
  registrations: Record<string, AccountProfile>;
  decisionAudits: Record<string, RegistrationDecisionAudit>;
  activities: Record<string, SoldierActivity>;
  activityReviews: Record<string, ActivityRiskReview>;
  graphNodes: RoadGraphNode[];
  graphEdges: RoadGraphEdge[];
  metadata: {
    lastResetAt: string;
    version: string;
    isSimulated: true;
  };
}

export class Database {
  private state: DatabaseState;
  private filePath: string;
  private isMemoryMode: boolean;

  constructor(filePath?: string, isMemoryMode = config.storageMode === 'memory') {
    this.isMemoryMode = isMemoryMode;
    const resolvedDir = path.resolve(config.dataDir);
    this.filePath = filePath || path.join(resolvedDir, 'sentinel_store.json');

    if (!this.isMemoryMode && !fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }

    this.state = this.loadFromDisk();
  }

  private getDefaultState(): DatabaseState {
    const incidents: Record<string, Incident> = {};
    INITIAL_INCIDENTS.forEach((inc) => {
      incidents[inc.id] = { ...inc };
    });

    const syncRegistry: Record<string, SyncItemResult> = {};
    INITIAL_INCIDENTS.forEach((inc) => {
      if (inc.clientId) {
        syncRegistry[inc.clientId] = {
          clientId: inc.clientId,
          serverId: inc.id,
          outcome: 'accepted',
          status: 'accepted',
          syncedAt: inc.syncedAt || inc.createdAt,
        };
      }
    });

    const tracks: Record<string, TelemetryTrack> = {};
    INITIAL_TRACKS.forEach((trk) => {
      tracks[trk.id] = { ...trk };
    });

    const alerts: Record<string, Alert> = {};
    INITIAL_ALERTS.forEach((alt) => {
      alerts[alt.id] = { ...alt };
    });

    const observations: Record<string, GeoIntelObservation> = {};
    INITIAL_GEO_OBSERVATIONS.forEach((obs) => {
      observations[obs.id] = { ...obs };
    });

    const patients: Record<string, Patient> = {};
    INITIAL_PATIENTS.forEach((pat) => {
      patients[pat.id] = { ...pat };
    });

    const hazards: Record<string, HazardEdge> = {};
    INITIAL_HAZARDS.forEach((haz) => {
      hazards[haz.id] = { ...haz };
    });

    const soldiers: Record<string, SoldierProfile> = {};
    INITIAL_SOLDIERS.forEach((sol) => {
      soldiers[sol.id] = { ...sol };
    });

    const soldierVitals: Record<string, SoldierVitalsRecord> = {};
    INITIAL_SOLDIER_VITALS.forEach((vit) => {
      soldierVitals[vit.id] = { ...vit };
    });

    // Default bootstrap administrator account
    const registrations: Record<string, AccountProfile> = {
      'reg-admin-bootstrap': {
        id: 'reg-admin-bootstrap',
        authUserId: 'usr-admin-01',
        email: 'admin@sentinel.mil',
        role: 'administrator',
        approvalStatus: 'approved',
        soldierId: 'SOL-101',
        badgeName: 'Commander Alpha',
        regimentNo: '001',
        heightCm: 180,
        weightKg: 78,
        ageYears: 38,
        profileRecordedAt: '2026-10-25T00:00:00.000Z',
        submittedAt: '2026-10-25T00:00:00.000Z',
        reviewedAt: '2026-10-25T00:00:00.000Z',
        reviewedBy: 'SYSTEM_BOOTSTRAP',
        decisionReason: 'Initial administrative bootstrap',
      },
      'reg-demo-official': {
        id: 'reg-demo-official',
        authUserId: 'usr-demo-official-01',
        email: 'demo.official@sentinel-demo.local',
        role: 'operations_officer',
        approvalStatus: 'approved',
        soldierId: 'SOL-002',
        badgeName: 'Demo Official',
        regimentNo: '042',
        heightCm: 178,
        weightKg: 76,
        ageYears: 34,
        profileRecordedAt: '2026-10-26T00:00:00.000Z',
        submittedAt: '2026-10-26T00:00:00.000Z',
        reviewedAt: '2026-10-26T00:00:00.000Z',
        reviewedBy: 'TRUSTED_PROVISIONING_SETUP',
        decisionReason: 'Provisioned demo official account for login verification',
      },
    };

    const decisionAudits: Record<string, RegistrationDecisionAudit> = {};
    const activities: Record<string, SoldierActivity> = {};
    const activityReviews: Record<string, ActivityRiskReview> = {};

    return {
      incidents,
      syncRegistry,
      tracks,
      alerts,
      observations,
      patients,
      hazards,
      soldiers,
      soldierVitals,
      registrations,
      decisionAudits,
      activities,
      activityReviews,
      graphNodes: [...ROAD_GRAPH_NODES],
      graphEdges: [...ROAD_GRAPH_EDGES],
      metadata: {
        lastResetAt: new Date().toISOString(),
        version: '1.0.0',
        isSimulated: true,
      },
    };
  }

  private loadFromDisk(): DatabaseState {
    if (this.isMemoryMode) {
      return this.getDefaultState();
    }

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseState;

        // Deduplicate any runaway alerts if present
        if (parsed.alerts) {
          const deduplicated: Record<string, Alert> = {};
          const seen = new Set<string>();
          const alertList = Object.values(parsed.alerts).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          for (const a of alertList) {
            const key = `${a.trackId || 'unknown'}:${a.ruleName}:${a.acknowledged}`;
            if (!seen.has(key) || a.acknowledged) {
              seen.add(key);
              deduplicated[a.id] = a;
            }
          }
          if (Object.keys(deduplicated).length < Object.keys(parsed.alerts).length) {
            parsed.alerts = deduplicated;
            this.persist(parsed);
          }
        }

        // Hydrate soldiers and soldierVitals if upgrading from previous schema version
        let needsSave = false;
        if (!parsed.soldiers || Object.keys(parsed.soldiers).length === 0) {
          const defaultState = this.getDefaultState();
          parsed.soldiers = defaultState.soldiers;
          if (!parsed.soldierVitals) {
            parsed.soldierVitals = defaultState.soldierVitals;
          }
          needsSave = true;
        }

        // Ensure any new baseline soldiers are present
        if (!parsed.soldiers) {
          parsed.soldiers = {};
        }
        INITIAL_SOLDIERS.forEach((sol) => {
          if (!parsed.soldiers[sol.id]) {
            parsed.soldiers[sol.id] = { ...sol };
            needsSave = true;
          }
        });

        // Hydrate registrations, decisionAudits, activities, activityReviews
        if (!parsed.registrations || Object.keys(parsed.registrations).length === 0) {
          const defaultState = this.getDefaultState();
          parsed.registrations = defaultState.registrations;
          needsSave = true;
        } else if (!parsed.registrations['reg-demo-official']) {
          const defaultState = this.getDefaultState();
          if (defaultState.registrations['reg-demo-official']) {
            parsed.registrations['reg-demo-official'] = defaultState.registrations['reg-demo-official'];
            needsSave = true;
          }
        }
        if (!parsed.decisionAudits) {
          parsed.decisionAudits = {};
          needsSave = true;
        }
        if (!parsed.activities) {
          parsed.activities = {};
          needsSave = true;
        }
        if (!parsed.activityReviews) {
          parsed.activityReviews = {};
          needsSave = true;
        }
        if (needsSave) {
          this.persist(parsed);
        }

        return parsed;
      }
    } catch (err) {
      console.warn(`[DB] Could not load persisted data from ${this.filePath}, initializing fresh baseline:`, err);
    }

    const defaultState = this.getDefaultState();
    this.persist(defaultState);
    return defaultState;
  }

  private persist(stateToSave: DatabaseState = this.state): void {
    if (this.isMemoryMode) {
      return;
    }

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
      fs.writeFileSync(tempPath, JSON.stringify(stateToSave, null, 2), 'utf-8');
      try {
        fs.renameSync(tempPath, this.filePath);
      } catch (renameErr) {
        // Fallback for Windows file locks / OneDrive sync
        fs.copyFileSync(tempPath, this.filePath);
        try { fs.unlinkSync(tempPath); } catch {}
      }
    } catch (err) {
      console.error(`[DB] Failed to persist database state to ${this.filePath}:`, err);
    }
  }

  public resetToBaseline(preservePending: boolean = true): void {
    const defaultState = this.getDefaultState();
    if (preservePending && this.state) {
      // Preserve pending offline reports awaiting synchronization
      Object.values(this.state.incidents || {}).forEach((inc) => {
        if (inc.syncStatus === 'pending' || inc.syncStatus === 'failed') {
          defaultState.incidents[inc.id] = inc;
        }
      });

      // Preserve pending offline GeoIntel observations
      Object.values(this.state.observations || {}).forEach((obs) => {
        if ((obs as any).syncStatus === 'pending' || (obs as any).syncStatus === 'failed') {
          defaultState.observations[obs.id] = obs;
        }
      });
    }

    this.state = defaultState;
    this.persist();
  }

  public getStorageMode(): 'supabase' | 'file' | 'memory' {
    if (this.isMemoryMode) return 'memory';
    if (config.storageMode === 'supabase' && isSupabaseConfigured()) return 'supabase';
    return 'file';
  }

  public getRawState(): Readonly<DatabaseState> {
    return this.state;
  }

  // ------------------------------------------------------------------------
  // Incidents
  // ------------------------------------------------------------------------
  public getIncidents(filter?: {
    sourceModule?: string;
    type?: string;
    priority?: string;
    status?: string;
    search?: string;
  }): Incident[] {
    let list = Object.values(this.state.incidents);

    if (filter) {
      if (filter.sourceModule) {
        list = list.filter((i) => i.sourceModule === filter.sourceModule);
      }
      if (filter.type) {
        list = list.filter((i) => i.type === filter.type);
      }
      if (filter.priority) {
        list = list.filter((i) => i.priority === filter.priority);
      }
      if (filter.status) {
        list = list.filter((i) => i.status === filter.status);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        list = list.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.notes.toLowerCase().includes(q) ||
            (i.location.name && i.location.name.toLowerCase().includes(q))
        );
      }
    }

    // Stable sort: newest first
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getIncidentById(id: string): Incident | null {
    return this.state.incidents[id] || null;
  }

  public findIncidentByClientId(clientId: string): Incident | null {
    return Object.values(this.state.incidents).find((i) => i.clientId === clientId) || null;
  }

  public saveIncident(incident: Incident): Incident {
    this.state.incidents[incident.id] = { ...incident };
    if (incident.clientId) {
      this.state.syncRegistry[incident.clientId] = {
        clientId: incident.clientId,
        serverId: incident.id,
        outcome: 'accepted',
        status: 'accepted',
        syncedAt: incident.syncedAt || new Date().toISOString(),
      };
      if (isSupabaseConfigured() && !this.isMemoryMode) {
        supabaseRepo.upsertSyncRegistryItem(this.state.syncRegistry[incident.clientId]).catch(() => {});
      }
    }
    this.persist();

    // Async write-through to genuine Supabase database
    if (isSupabaseConfigured() && !this.isMemoryMode) {
      supabaseRepo.upsertIncident(incident).catch((err) => {
        console.warn('[DB] Supabase async saveIncident failed:', err.message);
      });
    }

    return this.state.incidents[incident.id];
  }

  // ------------------------------------------------------------------------
  // Sync Registry (Idempotency)
  // ------------------------------------------------------------------------
  public getSyncRegistryItem(clientId: string): SyncItemResult | null {
    return this.state.syncRegistry[clientId] || null;
  }

  public recordSyncOutcome(item: SyncItemResult): void {
    this.state.syncRegistry[item.clientId] = { ...item };
    this.persist();

    if (isSupabaseConfigured() && !this.isMemoryMode) {
      supabaseRepo.upsertSyncRegistryItem(item).catch(() => {});
    }
  }

  // ------------------------------------------------------------------------
  // SkyWatch Telemetry & Alerts
  // ------------------------------------------------------------------------
  public getTracks(): TelemetryTrack[] {
    return Object.values(this.state.tracks);
  }

  public getTrackById(id: string): TelemetryTrack | null {
    return this.state.tracks[id] || null;
  }

  public updateTrack(track: TelemetryTrack): TelemetryTrack {
    this.state.tracks[track.id] = { ...track };
    this.persist();
    return this.state.tracks[track.id];
  }

  public getAlerts(filter?: { acknowledged?: boolean; trackId?: string; severity?: string }): Alert[] {
    let list = Object.values(this.state.alerts);
    if (filter) {
      if (filter.acknowledged !== undefined) {
        list = list.filter((a) => a.acknowledged === filter.acknowledged);
      }
      if (filter.trackId) {
        list = list.filter((a) => a.trackId === filter.trackId);
      }
      if (filter.severity) {
        list = list.filter((a) => a.severity === filter.severity);
      }
    }
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public getAlertById(id: string): Alert | null {
    return this.state.alerts[id] || null;
  }

  public saveAlert(alert: Alert): Alert {
    // If an unacknowledged alert already exists for the same track & rule, update it instead of creating duplicates
    const existing = Object.values(this.state.alerts).find(
      (a) => a.trackId === alert.trackId && a.ruleName === alert.ruleName && !a.acknowledged
    );

    if (existing && existing.id !== alert.id) {
      existing.observedValue = alert.observedValue;
      existing.timestamp = alert.timestamp;
      existing.explanation = alert.explanation;
      this.persist();
      return existing;
    }

    this.state.alerts[alert.id] = { ...alert };
    this.persist();

    if (isSupabaseConfigured() && !this.isMemoryMode) {
      supabaseRepo.upsertAlert(alert).catch(() => {});
    }

    return this.state.alerts[alert.id];
  }

  // ------------------------------------------------------------------------
  // GeoIntel Observations
  // ------------------------------------------------------------------------
  public getObservations(filter?: { reviewStatus?: string; samplePairId?: string }): GeoIntelObservation[] {
    let list = Object.values(this.state.observations);
    if (filter) {
      if (filter.reviewStatus) {
        list = list.filter((o) => o.reviewStatus === filter.reviewStatus);
      }
      if (filter.samplePairId) {
        list = list.filter((o) => o.samplePairId === filter.samplePairId);
      }
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getObservationById(id: string): GeoIntelObservation | null {
    return this.state.observations[id] || null;
  }

  public saveObservation(observation: GeoIntelObservation): GeoIntelObservation {
    this.state.observations[observation.id] = { ...observation };
    this.persist();

    if (isSupabaseConfigured() && !this.isMemoryMode) {
      supabaseRepo.upsertObservation(observation).catch(() => {});
    }

    return this.state.observations[observation.id];
  }

  // ------------------------------------------------------------------------
  // MediRoute Patients & Hazards
  // ------------------------------------------------------------------------
  public getPatients(filter?: { workflowStatus?: string; triageCategory?: string }): Patient[] {
    let list = Object.values(this.state.patients);
    if (filter) {
      if (filter.workflowStatus) {
        list = list.filter((p) => p.workflowStatus === filter.workflowStatus);
      }
      if (filter.triageCategory) {
        list = list.filter((p) => p.triageCategory === filter.triageCategory);
      }
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getPatientById(id: string): Patient | null {
    return this.state.patients[id] || null;
  }

  public savePatient(patient: Patient): Patient {
    this.state.patients[patient.id] = { ...patient };
    this.persist();

    if (isSupabaseConfigured() && !this.isMemoryMode) {
      supabaseRepo.upsertPatient(patient).catch(() => {});
    }

    return this.state.patients[patient.id];
  }

  public getHazards(filter?: { blocked?: boolean }): HazardEdge[] {
    let list = Object.values(this.state.hazards);
    if (filter && filter.blocked !== undefined) {
      list = list.filter((h) => h.blocked === filter.blocked);
    }
    return list;
  }

  public getHazardById(id: string): HazardEdge | null {
    return this.state.hazards[id] || null;
  }

  public getHazardByEdgeId(edgeId: string): HazardEdge | null {
    return Object.values(this.state.hazards).find((h) => h.edgeId === edgeId) || null;
  }

  public saveHazard(hazard: HazardEdge): HazardEdge {
    this.state.hazards[hazard.id] = { ...hazard };
    this.persist();

    if (isSupabaseConfigured() && !this.isMemoryMode) {
      supabaseRepo.upsertHazard(hazard).catch(() => {});
    }

    return this.state.hazards[hazard.id];
  }

  // ------------------------------------------------------------------------
  // Soldier Vitals
  // ------------------------------------------------------------------------
  public getSoldiers(): SoldierProfile[] {
    return Object.values(this.state.soldiers || {});
  }

  public getSoldierById(id: string): SoldierProfile | null {
    return this.state.soldiers?.[id] || null;
  }

  public getSoldierVitals(soldierId?: string): SoldierVitalsRecord[] {
    let list = Object.values(this.state.soldierVitals || {});
    if (soldierId) {
      list = list.filter((v) => v.soldierId === soldierId);
    }
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public getSoldierVitalById(id: string): SoldierVitalsRecord | null {
    return this.state.soldierVitals?.[id] || null;
  }

  public saveSoldierVitals(record: SoldierVitalsRecord): SoldierVitalsRecord {
    if (!this.state.soldierVitals) {
      this.state.soldierVitals = {};
    }
    this.state.soldierVitals[record.id] = { ...record };
    this.persist();

    if (isSupabaseConfigured() && !this.isMemoryMode) {
      supabaseRepo.insertSoldierVitals(record).catch((err) => {
        console.warn('[DB] Supabase async insertSoldierVitals failed:', err.message);
      });
    }

    return this.state.soldierVitals[record.id];
  }

  public saveSoldier(soldier: SoldierProfile): SoldierProfile {
    if (!this.state.soldiers) {
      this.state.soldiers = {};
    }
    this.state.soldiers[soldier.id] = { ...soldier };
    this.persist();
    return this.state.soldiers[soldier.id];
  }

  // ------------------------------------------------------------------------
  // Registrations & Approvals
  // ------------------------------------------------------------------------
  public getRegistrations(filter?: { status?: ApprovalStatus }): AccountProfile[] {
    let list = Object.values(this.state.registrations || {});
    if (filter?.status) {
      list = list.filter((r) => r.approvalStatus === filter.status);
    }
    return list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }

  public getRegistrationById(id: string): AccountProfile | null {
    return this.state.registrations?.[id] || null;
  }

  public getRegistrationByEmail(email: string): AccountProfile | null {
    const norm = email.toLowerCase().trim();
    return Object.values(this.state.registrations || {}).find((r) => r.email.toLowerCase().trim() === norm) || null;
  }

  public getRegistrationByAuthUserId(authUserId: string): AccountProfile | null {
    return Object.values(this.state.registrations || {}).find((r) => r.authUserId === authUserId) || null;
  }

  public saveRegistration(reg: AccountProfile): AccountProfile {
    if (!this.state.registrations) {
      this.state.registrations = {};
    }
    this.state.registrations[reg.id] = { ...reg };
    this.persist();
    return this.state.registrations[reg.id];
  }

  public recordDecisionAudit(audit: RegistrationDecisionAudit): RegistrationDecisionAudit {
    if (!this.state.decisionAudits) {
      this.state.decisionAudits = {};
    }
    this.state.decisionAudits[audit.id] = { ...audit };
    this.persist();
    return this.state.decisionAudits[audit.id];
  }

  public getDecisionAudits(registrationId?: string): RegistrationDecisionAudit[] {
    let list = Object.values(this.state.decisionAudits || {});
    if (registrationId) {
      list = list.filter((a) => a.registrationId === registrationId);
    }
    return list.sort((a, b) => new Date(b.decisionAt).getTime() - new Date(a.decisionAt).getTime());
  }

  // ------------------------------------------------------------------------
  // Soldier Activities & Risk Reviews
  // ------------------------------------------------------------------------
  public saveActivity(activity: SoldierActivity): SoldierActivity {
    if (!this.state.activities) {
      this.state.activities = {};
    }
    this.state.activities[activity.id] = { ...activity };
    this.persist();
    return this.state.activities[activity.id];
  }

  public getActivityById(id: string): SoldierActivity | null {
    return this.state.activities?.[id] || null;
  }

  public getActivitiesBySoldier(soldierId: string): SoldierActivity[] {
    return Object.values(this.state.activities || {})
      .filter((a) => a.soldierId === soldierId)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  public saveActivityReview(review: ActivityRiskReview): ActivityRiskReview {
    if (!this.state.activityReviews) {
      this.state.activityReviews = {};
    }
    this.state.activityReviews[review.id] = { ...review };
    this.persist();
    return this.state.activityReviews[review.id];
  }

  public getActivityReviewByActivityId(activityId: string): ActivityRiskReview | null {
    return Object.values(this.state.activityReviews || {})
      .find((r) => r.activityId === activityId) || null;
  }

  public getRoadGraph(): { nodes: RoadGraphNode[]; edges: RoadGraphEdge[] } {
    return {
      nodes: this.state.graphNodes,
      edges: this.state.graphEdges,
    };
  }
}

// Singleton database instance
export const db = new Database();
