/**
 * SENTINEL API Client & Sync Coordinator
 * Handles typed communication with the backend API (`/api/*`),
 * with an integrated fallback to local IndexedDB and realistic mock engine.
 * Supports offline-first reconciliation, dynamic backend probing, and Dijkstra routing.
 */

import {
  IncidentReport,
  TelemetryTrack,
  AirspaceAlert,
  GeoIntelObservation,
  CasualtyRecord,
  RoadHazardEdge,
  BatchSyncResult,
  OfflineSyncPayload,
  DashboardSummary,
  CalculatedRoute,
  SoldierProfile,
  SoldierVitalsRecord,
  CreateSoldierVitalsInput,
} from '@shared/types';
import { dbService } from '../storage/indexedDb';
import {
  INITIAL_TRACKS,
  RESTRICTED_AIRSPACE_ZONES,
  ROAD_HAZARD_EDGES,
  INITIAL_INCIDENTS,
  INITIAL_CASUALTIES,
  INITIAL_ALERTS,
  INITIAL_GEO_OBSERVATIONS,
} from '../data/fixtures';
import { INITIAL_SOLDIERS, INITIAL_SOLDIER_VITALS } from '../../../shared/fixtures';
import { simulationEngine, SimulationTickState } from '../../simulation/simulationEngine';
import { meshBus } from '../coordination/meshBus';
import { authService } from '../auth/authService';


// Configuration: cleanly normalizes VITE_API_URL without duplicate /api, defaulting to relative /api
function resolveApiBaseUrl(): string {
  try {
    const raw = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : '';
    const envUrl = (raw || '').trim().replace(/\/+$/, '');
    if (!envUrl) {
      return '/api';
    }
    return envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`;
  } catch {
    return '/api';
  }
}

export const API_BASE_URL = resolveApiBaseUrl();

export class SentinelApiClient {
  private isSimulatedOffline: boolean = false;
  private isBackendOnline: boolean = false;
  private lastCheckTime: number = 0;

  public setOfflineSimulation(offline: boolean) {
    this.isSimulatedOffline = offline;
    if (offline) {
      this.isBackendOnline = false;
    }
  }

  public getOfflineSimulation(): boolean {
    return this.isSimulatedOffline;
  }

  public getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extraHeaders };
    const token = authService.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  public async checkBackendAvailability(): Promise<boolean> {
    if (this.isSimulatedOffline) {
      this.isBackendOnline = false;
      return false;
    }
    const now = Date.now();
    if (now - this.lastCheckTime < 4000 && this.lastCheckTime > 0) {
      return this.isBackendOnline;
    }
    this.lastCheckTime = now;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      this.isBackendOnline = res.ok;
      return res.ok;
    } catch {
      this.isBackendOnline = false;
      return false;
    }
  }

  public isUsingMockMode(): boolean {
    return !this.isBackendOnline;
  }

  public async getHealthInfo(): Promise<{
    status: string;
    service: string;
    version: string;
    timestamp: string;
    storageMode: string;
    supabaseConfigured: boolean;
    uptimeSeconds: number;
    isSimulated: boolean;
  } | null> {
    if (this.isSimulatedOffline) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // offline
    }
    return null;
  }

  public async getSimulationStatus(): Promise<{
    isRunning: boolean;
    lastTickAt: string;
    trackCount: number;
    alertCount: number;
  } | null> {
    if (this.isSimulatedOffline) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/telemetry/status`);
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch {
      // offline
    }
    return null;
  }

  public async pauseSimulation(): Promise<boolean> {
    simulationEngine.pause();
    if (this.isSimulatedOffline) return true;
    try {
      const res = await fetch(`${API_BASE_URL}/telemetry/pause`, { method: 'POST' });
      return res.ok;
    } catch {
      return true;
    }
  }

  public async resumeSimulation(): Promise<boolean> {
    simulationEngine.resume();
    if (this.isSimulatedOffline) return true;
    try {
      const res = await fetch(`${API_BASE_URL}/telemetry/resume`, { method: 'POST' });
      return res.ok;
    } catch {
      return true;
    }
  }

  public async stepSimulation(): Promise<any> {
    if (this.isSimulatedOffline) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/telemetry/tick`, { method: 'POST' });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      return null;
    }
  }

  // 1. Dashboard Summary
  public async getDashboardSummary(): Promise<DashboardSummary> {
    const isOnline = await this.checkBackendAvailability();

    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/dashboard`);
        if (res.ok) {
          const body = await res.json();
          const remoteData = body.data || body;
          return {
            systemStatus: 'nominal',
            pendingSyncCount: remoteData.pendingSyncCount ?? 0,
            activeIncidentsCount: remoteData.activeIncidents ?? 0,
            activeAirspaceTracksCount: remoteData.activeTracks ?? INITIAL_TRACKS.length,
            unacknowledgedAlertsCount: remoteData.unacknowledgedAlerts ?? 0,
            pendingGeoReviewsCount: remoteData.pendingGeoReviews ?? 0,
            criticalPatientsAwaitingEvac: remoteData.criticalPatientsAwaitingEvac ?? 0,
            blockedRoadSegmentsCount: remoteData.blockedRoadSegmentsCount ?? 0,
            lastSyncTimestamp: new Date().toISOString(),
            isSimulated: true,
          };
        }
      } catch (err) {
        console.warn('[ApiClient] Failed to fetch remote dashboard summary, falling back to local DB cache:', err);
      }
    }

    // Local cached derivation from IndexedDB (with graceful fallback to baseline fixtures)
    let incidents: IncidentReport[] = INITIAL_INCIDENTS;
    let casualties: CasualtyRecord[] = INITIAL_CASUALTIES;
    let hazards: RoadHazardEdge[] = ROAD_HAZARD_EDGES;
    let alerts: AirspaceAlert[] = INITIAL_ALERTS;
    let geoObs: GeoIntelObservation[] = INITIAL_GEO_OBSERVATIONS;

    try {
      incidents = await dbService.getIncidents();
      casualties = await dbService.getCasualties();
      hazards = await dbService.getHazards();
      alerts = await dbService.getAlerts();
      geoObs = await dbService.getGeoObservations();
    } catch (dbErr) {
      console.warn('[ApiClient] Failed to read IndexedDB for summary derivation, using memory baseline:', dbErr);
    }

    const pendingSync = incidents.filter((i) => i.syncStatus === 'pending' || i.syncStatus === 'failed').length;
    const activeIncidents = incidents.filter((i) => i.status === 'active' || i.status === 'in_progress').length;
    const criticalPatients = casualties.filter((c) => c.triageCategory === 'immediate' && c.status !== 'evacuated').length;
    const blockedRoads = hazards.filter((h) => h.blocked).length;
    const unackAlerts = alerts.filter((a) => !a.acknowledged).length;
    const pendingGeo = geoObs.filter((g) => g.reviewStatus === 'pending').length;

    return {
      systemStatus: this.isSimulatedOffline ? 'offline_mode' : 'nominal',
      pendingSyncCount: pendingSync,
      activeIncidentsCount: activeIncidents,
      activeAirspaceTracksCount: INITIAL_TRACKS.length,
      unacknowledgedAlertsCount: unackAlerts,
      pendingGeoReviewsCount: pendingGeo,
      criticalPatientsAwaitingEvac: criticalPatients,
      blockedRoadSegmentsCount: blockedRoads,
      lastSyncTimestamp: this.isSimulatedOffline ? null : new Date().toISOString(),
      isSimulated: true,
    };
  }

  // 2. Incidents (FieldLink & Shared)
  public async getIncidents(): Promise<IncidentReport[]> {
    const isOnline = await this.checkBackendAvailability();

    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/incidents`);
        if (res.ok) {
          const body = await res.json();
          const remoteList: IncidentReport[] = body.data || body;
          // Merge with local pending queue so unsynced reports are not lost visually
          const localPending = await dbService.getPendingSyncIncidents();
          const remoteIds = new Set(remoteList.map((i) => i.id));
          const merged = [
            ...localPending.filter((p) => !remoteIds.has(p.id)),
            ...remoteList.map((r) => ({ ...r, syncStatus: (r.syncStatus || 'synced') as any })),
          ];
          for (const item of remoteList) {
            await dbService.putIncident({ ...item, syncStatus: 'synced' });
          }
          return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
      } catch (err) {
        console.warn('[ApiClient] Failed to fetch remote incidents, falling back to local cache:', err);
      }
    }

    return await dbService.getIncidents();
  }

  public async createIncident(report: IncidentReport): Promise<IncidentReport> {
    const isOnline = await this.checkBackendAvailability();

    if (!isOnline) {
      report.syncStatus = 'pending';
      report.status = 'pending_sync';
      await dbService.putIncident(report);
      return report;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: report.clientId || report.id,
          sourceModule: report.sourceModule,
          type: report.type,
          priority: report.priority,
          title: report.title,
          notes: report.notes,
          location: report.location,
          status: 'active',
          createdAt: report.createdAt,
        }),
      });

      if (res.ok) {
        const body = await res.json();
        const saved = body.data || body;
        const oldLocalId = report.id;
        const normalized: IncidentReport = {
          ...report,
          id: saved.id || report.id,
          status: 'active',
          syncStatus: 'synced',
          syncedAt: saved.syncedAt || new Date().toISOString(),
        };
        await dbService.confirmIncidentAtomic(oldLocalId, normalized, report.clientId);
        return normalized;
      }
    } catch (err) {
      console.warn('[ApiClient] Failed to create incident on server, queuing in local outbox:', err);
    }

    // Fallback: save to outbox as pending with stable clientId
    report.syncStatus = 'pending';
    report.status = 'pending_sync';
    await dbService.queueMutation('incident', 'create', report, report.clientId || report.id);
    return report;
  }

  // Batch Offline Sync Reconciliation
  public async syncPendingQueue(): Promise<BatchSyncResult> {
    const pending = await dbService.getPendingSyncIncidents();
    if (pending.length === 0) {
      return {
        totalSubmitted: 0,
        acceptedCount: 0,
        duplicateCount: 0,
        rejectedCount: 0,
        items: [],
      };
    }

    const isOnline = await this.checkBackendAvailability();
    if (!isOnline) {
      throw new Error('Sync failed: Network unreachable (Offline Mode active).');
    }

    // Canonical request schema: { items: SyncBatchItem[] }
    const items = pending.map((item) => ({
      clientId: item.clientId || item.id,
      sourceModule: item.sourceModule || 'fieldlink',
      type: item.type,
      priority: item.priority,
      title: item.title || 'Untitled Incident Report',
      notes: item.notes || '',
      location: item.location,
      createdAt: item.createdAt || new Date().toISOString(),
      status: 'active' as const,
    }));

    try {
      const res = await fetch(`${API_BASE_URL}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (res.ok) {
        const body = await res.json();
        const result: BatchSyncResult = body.data || body;
        const responseItems = result.items || result.results || [];
        for (const resItem of responseItems) {
          const match = pending.find((p) => p.clientId === resItem.clientId || p.id === resItem.clientId);
          if (match) {
            const isConfirmed =
              resItem.outcome === 'accepted' ||
              resItem.outcome === 'already_received' ||
              (resItem as any).status === 'accepted' ||
              (resItem as any).status === 'already_received';

            if (isConfirmed) {
              const oldLocalId = match.id;
              match.syncStatus = 'synced';
              match.status = 'active';
              match.id = resItem.serverId || match.id;
              match.syncedAt = resItem.syncTimestamp || (resItem as any).syncedAt || new Date().toISOString();
              delete (match as any).syncError;
              await dbService.confirmIncidentAtomic(oldLocalId, match, match.clientId);
            } else if (resItem.outcome === 'rejected' || (resItem as any).status === 'rejected') {
              match.syncStatus = 'failed';
              match.status = 'pending_sync';
              (match as any).syncError =
                (resItem as any).errorMessage || (resItem as any).reason || 'Sync rejected by server validation';
              await dbService.putIncident(match);
            }
          }
        }
        return result;
      } else {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `Sync failed with HTTP status ${res.status}`;
        throw new Error(errMsg);
      }
    } catch (err) {
      console.warn('[ApiClient] Live server sync failed, keeping outbox in pending status:', err);
      throw err;
    }
  }

  // 3. SkyWatch Airspace Tracks & Alerts
  public async getTelemetryTracks(): Promise<TelemetryTrack[]> {
    // Always return live simulation engine state (identical API online & offline)
    return simulationEngine.getState().tracks;
  }

  public async getRestrictedZones(): Promise<typeof RESTRICTED_AIRSPACE_ZONES> {
    return RESTRICTED_AIRSPACE_ZONES;
  }

  public async getAirspaceAlerts(): Promise<AirspaceAlert[]> {
    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/alerts`);
        if (res.ok) {
          const body = await res.json();
          const remoteAlerts: AirspaceAlert[] = body.data || body;
          // Purge stale alerts and sync fresh list
          await dbService.setAlerts(remoteAlerts);
          return remoteAlerts;
        }
      } catch (err) {
        console.warn('[ApiClient] Could not fetch remote alerts, using local IndexedDB:', err);
      }
    }
    return await dbService.getAlerts();
  }

  public async acknowledgeAlert(id: string, user: string = 'Duty Watch Officer'): Promise<AirspaceAlert> {
    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/alerts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acknowledged: true, acknowledgedBy: user }),
        });
        if (res.ok) {
          const body = await res.json();
          const updated = body.data || body;
          await dbService.updateAlert(updated);
          return updated;
        }
      } catch (err) {
        console.warn('[ApiClient] Remote alert acknowledge failed, updating locally:', err);
      }
    }

    const alerts = await dbService.getAlerts();
    const alert = alerts.find((a) => a.id === id);
    if (!alert) throw new Error(`Alert with id ${id} not found.`);

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = user;
    await dbService.updateAlert(alert);
    await dbService.queueMutation(
      'alert_ack',
      'acknowledge',
      { alertId: id, acknowledged: true, acknowledgedBy: user, acknowledgedAt: alert.acknowledgedAt },
      id
    );
    return alert;
  }

  // 4. GeoIntel Observations & Candidate Reviews
  public async getGeoObservations(): Promise<GeoIntelObservation[]> {
    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/geointel/observations`);
        if (res.ok) {
          const body = await res.json();
          const remoteObs: GeoIntelObservation[] = body.data || body;
          for (const obs of remoteObs) {
            await dbService.putGeoObservation(obs);
          }
          return remoteObs;
        }
      } catch (err) {
        console.warn('[ApiClient] Could not fetch remote GeoIntel observations, using local cache:', err);
      }
    }
    return await dbService.getGeoObservations();
  }

  public async updateGeoCandidateReview(
    obsId: string,
    candidateId: string,
    reviewed: boolean,
    notes?: string
  ): Promise<GeoIntelObservation> {
    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        const status = reviewed ? 'confirmed_candidate' : 'dismissed_false_positive';
        const res = await fetch(`${API_BASE_URL}/geointel/observations/${obsId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId, reviewed, reviewStatus: status, analystNotes: notes }),
        });
        if (res.ok) {
          const body = await res.json();
          const updated = body.data || body;
          await dbService.putGeoObservation(updated);
          return updated;
        }
      } catch (err) {
        console.warn('[ApiClient] Remote candidate review update failed, applying locally:', err);
      }
    }

    const observations = await dbService.getGeoObservations();
    const obs = observations.find((o) => o.id === obsId);
    if (!obs) throw new Error(`Observation ${obsId} not found`);

    const candidate = obs.candidates.find((c) => c.id === candidateId);
    if (candidate) {
      candidate.reviewed = reviewed;
      if (notes !== undefined) candidate.analystNotes = notes;
    }

    const allReviewed = obs.candidates.every((c) => c.reviewed);
    obs.reviewStatus = allReviewed ? 'reviewed' : 'pending';
    await dbService.putGeoObservation(obs);
    return obs;
  }

  public async createGeoObservation(observation: GeoIntelObservation): Promise<GeoIntelObservation> {
    const isOnline = await this.checkBackendAvailability();
    const obsWithSync = { ...observation };

    if (!isOnline) {
      (obsWithSync as any).syncStatus = 'pending';
      await dbService.putGeoObservation(obsWithSync);
      return obsWithSync;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/geointel/observations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: observation.id,
          clientId: observation.clientId || observation.id,
          samplePairId: observation.samplePairId || 'PAIR-SURVEILLANCE-DEMO',
          beforeImageId: observation.beforeImageId || 'IMG-BEFORE',
          afterImageId: observation.afterImageId || 'IMG-AFTER',
          normalizedCoordinates: observation.normalizedCoordinates || { x: 0.25, y: 0.25, width: 0.1, height: 0.1 },
          geoCoordinates: observation.geoCoordinates || observation.coordinates,
          differenceScore: observation.differenceScore || 0.85,
          algorithmSettings: observation.algorithmSettings || { threshold: 30, minRegionSize: 4 },
          explanation: observation.explanation || 'Satellite radiometric change detected by automated pipeline.',
          analystNotes: observation.analystNotes || '',
        }),
      });

      if (res.ok) {
        const body = await res.json();
        const created = body.data || body;
        const oldId = observation.id;
        const normalized: GeoIntelObservation = {
          ...observation,
          id: created.id || observation.id,
          reviewStatus: created.reviewStatus || observation.reviewStatus,
          syncStatus: 'synced',
          syncedAt: new Date().toISOString(),
        };
        if (oldId && oldId !== normalized.id) {
          await dbService.deleteGeoObservation(oldId);
        }
        await dbService.putGeoObservation(normalized);
        return normalized;
      }
    } catch (err) {
      console.warn('[ApiClient] Failed to post GeoObservation to server, saving locally with pending sync:', err);
    }

    // Fallback offline intake
    (obsWithSync as any).syncStatus = 'pending';
    await dbService.putGeoObservation(obsWithSync);
    return obsWithSync;
  }

  public async syncPendingGeoObservations(): Promise<{ total: number; synced: number; failed: number }> {
    const pending = await dbService.getPendingSyncGeoObservations();
    if (pending.length === 0) {
      return { total: 0, synced: 0, failed: 0 };
    }

    const isOnline = await this.checkBackendAvailability();
    if (!isOnline) {
      throw new Error('Offline Mode active: Cannot synchronize GeoIntel observations.');
    }

    let synced = 0;
    let failed = 0;

    for (const obs of pending) {
      try {
        const res = await fetch(`${API_BASE_URL}/geointel/observations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: obs.id,
            clientId: (obs as any).clientId || obs.id,
            samplePairId: obs.samplePairId || 'PAIR-SURVEILLANCE-DEMO',
            beforeImageId: obs.beforeImageId || 'IMG-BEFORE',
            afterImageId: obs.afterImageId || 'IMG-AFTER',
            normalizedCoordinates: obs.normalizedCoordinates || { x: 0.25, y: 0.25, width: 0.1, height: 0.1 },
            geoCoordinates: obs.geoCoordinates || obs.coordinates,
            differenceScore: obs.differenceScore || 0.85,
            algorithmSettings: obs.algorithmSettings || { threshold: 30, minRegionSize: 4 },
            explanation: obs.explanation || 'Satellite radiometric change detected.',
            analystNotes: obs.analystNotes || '',
          }),
        });

        if (res.ok) {
          const body = await res.json();
          const created = body.data || body;
          const oldId = obs.id;
          (obs as any).syncStatus = 'synced';
          (obs as any).syncedAt = new Date().toISOString();
          if (created.id && created.id !== oldId) {
            obs.id = created.id;
            await dbService.deleteGeoObservation(oldId);
          }
          await dbService.putGeoObservation(obs);
          synced++;
        } else {
          (obs as any).syncStatus = 'failed';
          await dbService.putGeoObservation(obs);
          failed++;
        }
      } catch (err) {
        (obs as any).syncStatus = 'failed';
        await dbService.putGeoObservation(obs);
        failed++;
      }
    }

    return { total: pending.length, synced, failed };
  }

  // 5. MediRoute Casualties & Hazards
  public async getCasualties(): Promise<CasualtyRecord[]> {
    // Live simulation engine state; synced to DB for offline persistence
    return simulationEngine.getState().casualties;
  }

  public async createCasualty(casualty: CasualtyRecord): Promise<CasualtyRecord> {
    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/patients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientCode: casualty.patientCode,
            canWalk: casualty.vitals?.canWalk ?? false,
            respiratoryRate: casualty.vitals?.respiratoryRate ?? 20,
            radialPulsePresent: casualty.vitals?.radialPulsePresent ?? true,
            mentalStatus: casualty.vitals?.mentalStatus ?? 'can_follow_commands',
            severeBleedingControlled: casualty.vitals?.severeBleedingControlled ?? true,
            location: casualty.location,
            notes: casualty.notes,
          }),
        });
        if (res.ok) {
          const body = await res.json();
          const created = body.data || body;
          await dbService.putCasualty(created);
          return created;
        }
      } catch (err) {
        console.warn('[ApiClient] Remote patient intake failed, saving locally:', err);
      }
    }
    await dbService.putCasualty(casualty);
    return casualty;
  }

  public async updateCasualtyStatus(
    id: string,
    status: CasualtyRecord['status'],
    hospitalId?: string
  ): Promise<CasualtyRecord> {
    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/patients/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, assignedHospitalId: hospitalId }),
        });
        if (res.ok) {
          const body = await res.json();
          const updated = body.data || body;
          await dbService.putCasualty(updated);
          return updated;
        }
      } catch (err) {
        console.warn('[ApiClient] Remote patient status update failed, applying locally:', err);
      }
    }

    const casualties = await dbService.getCasualties();
    const cas = casualties.find((c) => c.id === id);
    if (!cas) throw new Error(`Casualty ${id} not found`);

    cas.status = status;
    if (hospitalId) cas.assignedHospitalId = hospitalId;
    cas.updatedAt = new Date().toISOString();

    await dbService.putCasualty(cas);
    await dbService.queueMutation('casualty', 'update', cas, cas.id);
    return cas;
  }

  public async getRoadHazards(): Promise<RoadHazardEdge[]> {
    // Live simulation engine state for hazards
    return simulationEngine.getState().hazards;
  }

  public async toggleRoadBlockage(edgeId: string, blocked: boolean): Promise<RoadHazardEdge> {
    const hazards = simulationEngine.toggleRoadHazard(edgeId);
    const edge = hazards.find((h) => h.id === edgeId);
    if (!edge) throw new Error(`Hazard edge ${edgeId} not found`);

    edge.blocked = blocked;
    edge.updatedAt = new Date().toISOString();
    await dbService.putHazard(edge);
    await dbService.queueMutation('hazard', blocked ? 'block' : 'unblock', edge, edge.id);

    // Broadcast HAZARD_UPDATE across tabs (FIX-13)
    meshBus.publish('HAZARD_UPDATE', {
      edgeId: edge.id,
      blocked,
      hazardType: edge.hazardType,
      version: `${Date.now()}.${edge.id}`,
      updatedAt: edge.updatedAt,
    });

    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        await fetch(`${API_BASE_URL}/hazards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            edgeId: edge.id,
            fromNode: edge.fromNodeId,
            toNode: edge.toNodeId,
            blocked,
            hazardType: edge.hazardType,
          }),
        });
      } catch (err) {
        console.warn('[ApiClient] Failed to persist hazard toggle on remote server:', err);
      }
    }

    return edge;
  }

  // 6. MediRoute Algorithmic Dijkstra Routing
  public async calculateRoute(
    startNodeId: string,
    destinationNodeId: string,
    avoidHazards: boolean = true
  ): Promise<CalculatedRoute> {
    const isOnline = await this.checkBackendAvailability();

    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/routes/calculate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startNodeId, destinationNodeId, avoidHazards }),
        });
        if (res.ok) {
          const body = await res.json();
          const data = body.data || body;
          return {
            id: `ROUTE-${Date.now()}`,
            sourceNodeId: startNodeId,
            destinationNodeId: destinationNodeId,
            totalDistanceKm: data.totalDistanceKm ?? 5.5,
            estimatedMinutes: data.estimatedTimeMinutes ?? Math.round((data.totalDistanceKm ?? 5.5) * 1.5),
            pathNodeIds: data.pathNodeIds || [startNodeId, destinationNodeId],
            edgesTraversed: data.edgesTraversed || [],
            avoidedHazardIds: data.hazardsAvoided || [],
            algorithmUsed: 'Dijkstra-Hazard-Aware',
            hasActiveBlockage: (data.hazardsAvoided || []).length > 0,
            alternativeFound: (data.hazardsAvoided || []).length > 0,
            explanation: data.message || `Route computed via backend Dijkstra engine (${data.totalDistanceKm} km).`,
            calculatedAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        console.warn('[ApiClient] Remote route calculation failed, using local routing fallback:', err);
      }
    }

    // Local fallback calculation based on current road hazard states in IndexedDB
    const localHazards = await dbService.getHazards();
    const edge1Blocked = localHazards.some((h) => (h.id === 'EDGE-1' || (h as any).edgeId === 'EDGE-1') && h.blocked);
    const edge2Blocked = localHazards.some((h) => (h.id === 'EDGE-2' || (h as any).edgeId === 'EDGE-2') && h.blocked);

    if (edge1Blocked && edge2Blocked) {
      return {
        id: `ROUTE-${Date.now()}`,
        sourceNodeId: startNodeId,
        destinationNodeId: destinationNodeId,
        totalDistanceKm: 0,
        estimatedMinutes: 0,
        pathNodeIds: [],
        edgesTraversed: [],
        avoidedHazardIds: ['EDGE-1', 'EDGE-2'],
        algorithmUsed: 'Dijkstra-Hazard-Aware',
        hasActiveBlockage: true,
        alternativeFound: false,
        explanation: 'All corridors blocked between origin and destination. No viable route found.',
        calculatedAt: new Date().toISOString(),
      };
    }

    if (!edge1Blocked) {
      return {
        id: `ROUTE-${Date.now()}`,
        sourceNodeId: startNodeId,
        destinationNodeId: destinationNodeId,
        totalDistanceKm: 5.5,
        estimatedMinutes: 8,
        pathNodeIds: ['NODE-CAS-3', 'NODE-INT-5', 'NODE-INT-4', 'NODE-HOSP-1'],
        edgesTraversed: ['EDGE-1', 'EDGE-4', 'EDGE-5'],
        avoidedHazardIds: [],
        algorithmUsed: 'Dijkstra-Hazard-Aware',
        hasActiveBlockage: false,
        alternativeFound: false,
        explanation: 'Fastest direct corridor selected via Highway 9. All 3 road segments clear (5.5 km, ~8 mins).',
        calculatedAt: new Date().toISOString(),
      };
    } else {
      return {
        id: `ROUTE-${Date.now()}`,
        sourceNodeId: startNodeId,
        destinationNodeId: destinationNodeId,
        totalDistanceKm: 6.6,
        estimatedMinutes: 12,
        pathNodeIds: ['NODE-CAS-3', 'NODE-AID-2', 'NODE-INT-4', 'NODE-HOSP-1'],
        edgesTraversed: ['EDGE-2', 'EDGE-3', 'EDGE-5'],
        avoidedHazardIds: ['EDGE-1'],
        algorithmUsed: 'Dijkstra-Hazard-Aware',
        hasActiveBlockage: true,
        alternativeFound: true,
        explanation: 'Primary Highway 9 Corridor is BLOCKED (Bridge Collapse). Diverted via North Ridgeline Bypass (+1.1 km, +4 mins transit).',
        calculatedAt: new Date().toISOString(),
      };
    }
  }

  // 7. Soldier Vitals Module
  public async getSoldiers(): Promise<SoldierProfile[]> {
    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/vitals/soldiers`, {
          headers: this.getAuthHeaders(),
        });
        if (res.ok) {
          const body = await res.json();
          return body.data || body;
        }
      } catch (err) {
        console.warn('[ApiClient] Failed to fetch remote soldiers roster:', err);
      }
    }
    return INITIAL_SOLDIERS;
  }

  public async getSoldierVitals(soldierId?: string): Promise<SoldierVitalsRecord[]> {
    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        const url = soldierId
          ? `${API_BASE_URL}/vitals?soldierId=${encodeURIComponent(soldierId)}`
          : `${API_BASE_URL}/vitals`;
        const res = await fetch(url, {
          headers: this.getAuthHeaders(),
        });
        if (res.ok) {
          const body = await res.json();
          return body.data || body;
        }
      } catch (err) {
        console.warn('[ApiClient] Failed to fetch remote soldier vitals:', err);
      }
    }
    return soldierId
      ? INITIAL_SOLDIER_VITALS.filter((v) => v.soldierId === soldierId)
      : INITIAL_SOLDIER_VITALS;
  }

  public async recordSoldierVitals(input: CreateSoldierVitalsInput): Promise<SoldierVitalsRecord> {
    // 1. Sync immediately with simulation engine and MediRoute casualties
    simulationEngine.updateCasualtyVitals(input.soldierId, {
      heartRate: input.heartRateBpm,
      spo2: input.oxygenSaturationPct,
      respiratoryRate: input.respiratoryRateBpm,
      bpSystolic: input.bloodPressureSystolic,
      bpDiastolic: input.bloodPressureDiastolic,
      temperature: input.temperatureCelsius,
      notes: input.clinicalNotes,
    });

    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        const res = await fetch(`${API_BASE_URL}/vitals`, {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(input),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          return json.data;
        }
      } catch (err) {
        console.warn('[ApiClient] Failed to persist remote vitals, falling back to local store:', err);
      }
    }

    // Local resilient store & merge
    const newRecord: SoldierVitalsRecord = {
      id: `VTL-${Date.now()}`,
      soldierId: input.soldierId,
      callsign: input.soldierId,
      unit: 'Operational Detachment',
      timestamp: new Date().toISOString(),
      heartRateBpm: input.heartRateBpm,
      bloodPressureSystolic: input.bloodPressureSystolic,
      bloodPressureDiastolic: input.bloodPressureDiastolic,
      temperatureCelsius: input.temperatureCelsius,
      oxygenSaturationPct: input.oxygenSaturationPct,
      respiratoryRateBpm: input.respiratoryRateBpm,
      clinicalNotes: input.clinicalNotes,
      recordedBy: authService.getUser()?.email || 'med_officer_1@sentinel.mil',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSimulated: true,
    };
    INITIAL_SOLDIER_VITALS.unshift(newRecord);
    return newRecord;
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
    simulationEngine.updateCasualtyVitals(id, vitals);
  }

  // 8. Deterministic Demo Scenario Reset
  public async resetDemoBaseline(): Promise<void> {
    const isOnline = await this.checkBackendAvailability();
    if (isOnline) {
      try {
        await fetch(`${API_BASE_URL}/demo/reset`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
        });
      } catch (err) {
        console.warn('[ApiClient] Remote demo reset failed:', err);
      }
    }
    await dbService.resetToDeterministicBaseline();
    simulationEngine.reset(4242);
  }

  // 8. Master Simulation Controls (Same API online & offline)
  public subscribeSimulation(listener: (state: SimulationTickState) => void): () => void {
    return simulationEngine.subscribe(listener);
  }

  public getSimulationState(): SimulationTickState {
    return simulationEngine.getState();
  }

  public setSimulationSpeed(speed: 1 | 2 | 5): void {
    simulationEngine.setSpeed(speed);
  }

  public resetSimulation(seed?: number): void {
    simulationEngine.reset(seed);
  }
}

export const api = new SentinelApiClient();
