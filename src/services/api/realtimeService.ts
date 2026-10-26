/**
 * SENTINEL Real-time Server-Sent Events (SSE) Service
 * Manages resilient client connection to `/api/events`, handles auto-reconnect,
 * heartbeat staleness detection, event multiplexing, and simulation control.
 */

import {
  TelemetryTrack,
  AirspaceAlert,
  IncidentReport,
  RoadHazardEdge,
  GeoIntelObservation,
  CasualtyRecord,
} from '@shared/types';

export type RealtimeConnectionStatus = 'connected' | 'reconnecting' | 'disconnected' | 'stale';

export interface RealtimeState {
  status: RealtimeConnectionStatus;
  lastEventTimestamp: string | null;
  clientCount?: number;
  reconnectAttempts: number;
}

export type RealtimeListener = (state: RealtimeState) => void;
export type TelemetryListener = (tracks: TelemetryTrack[]) => void;
export type AlertListener = (alert: AirspaceAlert) => void;
export type IncidentListener = (incident: IncidentReport) => void;
export type HazardListener = (hazard: RoadHazardEdge) => void;
export type GeoIntelListener = (observation: GeoIntelObservation) => void;
export type PatientListener = (casualty: CasualtyRecord) => void;
export type ResetListener = () => void;

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

const API_BASE_URL = resolveApiBaseUrl();

export class RealtimeService {
  private eventSource: EventSource | null = null;
  private status: RealtimeConnectionStatus = 'disconnected';
  private lastEventTimestamp: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private staleTimer: any = null;
  private isExplicitlyDisconnected = true;

  // Safe Event Deduplication Cache
  private seenEventKeys = new Set<string>();
  private eventKeyTimestamps: { key: string; time: number }[] = [];

  private stateListeners = new Set<RealtimeListener>();
  private telemetryListeners = new Set<TelemetryListener>();
  private alertListeners = new Set<AlertListener>();
  private alertAckListeners = new Set<AlertListener>();
  private incidentListeners = new Set<IncidentListener>();
  private hazardListeners = new Set<HazardListener>();
  private geoIntelListeners = new Set<GeoIntelListener>();
  private patientListeners = new Set<PatientListener>();
  private resetListeners = new Set<ResetListener>();

  constructor() {
    // Listen for hardware online/offline to handle disconnect/reconnect safely
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.isExplicitlyDisconnected) {
          this.connect();
        }
      });
      window.addEventListener('offline', () => {
        this.setStatus('disconnected');
      });
    }
  }

  public connect(): void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.isExplicitlyDisconnected = false;
    this.setStatus('reconnecting');

    try {
      const url = `${API_BASE_URL}/events`;
      const es = new EventSource(url);
      this.eventSource = es;

      es.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        this.resetStaleTimer();
      };

      es.onmessage = (e: MessageEvent) => {
        this.handleMessage(e.data);
      };

      es.onerror = () => {
        if (this.isExplicitlyDisconnected) return;
        this.setStatus('reconnecting');
        es.close();
        this.eventSource = null;
        this.scheduleReconnect();
      };
    } catch (err) {
      console.warn('[RealtimeService] EventSource creation error:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isExplicitlyDisconnected = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setStatus('disconnected');
  }

  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw);
      const now = new Date().toISOString();
      this.lastEventTimestamp = data.timestamp || now;
      this.resetStaleTimer();

      // Deduplication check for discrete events (alerts, incidents, patients, geointel, hazards)
      if (data.type && data.type !== 'ping' && data.type !== 'connected' && data.type !== 'telemetry:update') {
        const payloadObj = data.data || data.payload;
        const targetId = payloadObj?.id || '';
        const eventKey = `${data.type}:${targetId}:${data.timestamp || ''}`;

        if (this.seenEventKeys.has(eventKey)) {
          return; // Skip duplicate event transmission
        }

        this.seenEventKeys.add(eventKey);
        this.eventKeyTimestamps.push({ key: eventKey, time: Date.now() });

        // Prune entries older than 60 seconds
        const cutoff = Date.now() - 60000;
        while (this.eventKeyTimestamps.length > 0 && this.eventKeyTimestamps[0].time < cutoff) {
          const expired = this.eventKeyTimestamps.shift();
          if (expired) this.seenEventKeys.delete(expired.key);
        }
      }

      if (data.type === 'connected') {
        this.setStatus('connected');
      } else if (data.type === 'ping') {
        this.setStatus('connected');
      } else if (data.type === 'telemetry:update') {
        const tracks: TelemetryTrack[] = Array.isArray(data.data) ? data.data : (Array.isArray(data.payload) ? data.payload : []);
        if (tracks.length > 0) {
          this.telemetryListeners.forEach((cb) => cb(tracks));
        }
      } else if (data.type === 'alert:triggered') {
        const alert: AirspaceAlert = data.data || data.payload;
        if (alert) {
          this.alertListeners.forEach((cb) => cb(alert));
        }
      } else if (data.type === 'alert:acknowledged') {
        const alert: AirspaceAlert = data.data || data.payload;
        if (alert) {
          this.alertAckListeners.forEach((cb) => cb(alert));
        }
      } else if (data.type === 'incident:created' || data.type === 'incident:updated') {
        const incident: IncidentReport = data.data || data.payload;
        if (incident) {
          this.incidentListeners.forEach((cb) => cb(incident));
        }
      } else if (data.type === 'hazard:updated') {
        const hazard: RoadHazardEdge = data.data || data.payload;
        if (hazard) {
          this.hazardListeners.forEach((cb) => cb(hazard));
        }
      } else if (data.type === 'geointel:reviewed' || data.type === 'geointel:candidate_added') {
        const obs: GeoIntelObservation = data.data || data.payload;
        if (obs) {
          this.geoIntelListeners.forEach((cb) => cb(obs));
        }
      } else if (data.type === 'patient:created' || data.type === 'patient:updated') {
        const patient: CasualtyRecord = data.data || data.payload;
        if (patient) {
          this.patientListeners.forEach((cb) => cb(patient));
        }
      } else if (data.type === 'demo:reset') {
        this.resetListeners.forEach((cb) => cb());
      }

      this.notifyState();
    } catch (err) {
      console.warn('[RealtimeService] Could not parse SSE event payload:', err);
    }
  }

  private resetStaleTimer(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
    }
    // If no heartbeat/event received in 35 seconds, mark state as stale
    this.staleTimer = setTimeout(() => {
      if (this.status === 'connected') {
        this.setStatus('stale');
      }
    }, 35000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isExplicitlyDisconnected) return;
    this.reconnectAttempts++;
    // Exponential backoff capped at 10 seconds
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private setStatus(newStatus: RealtimeConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.notifyState();
    }
  }

  private notifyState(): void {
    const state: RealtimeState = {
      status: this.status,
      lastEventTimestamp: this.lastEventTimestamp,
      reconnectAttempts: this.reconnectAttempts,
    };
    this.stateListeners.forEach((cb) => cb(state));
  }

  // --- Subscriptions ---
  public onStateChange(listener: RealtimeListener): () => void {
    this.stateListeners.add(listener);
    listener({
      status: this.status,
      lastEventTimestamp: this.lastEventTimestamp,
      reconnectAttempts: this.reconnectAttempts,
    });
    return () => this.stateListeners.delete(listener);
  }

  public onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  public onAlertTriggered(listener: AlertListener): () => void {
    this.alertListeners.add(listener);
    return () => this.alertListeners.delete(listener);
  }

  public onAlertAcknowledged(listener: AlertListener): () => void {
    this.alertAckListeners.add(listener);
    return () => this.alertAckListeners.delete(listener);
  }

  public onIncident(listener: IncidentListener): () => void {
    this.incidentListeners.add(listener);
    return () => this.incidentListeners.delete(listener);
  }

  public onHazard(listener: HazardListener): () => void {
    this.hazardListeners.add(listener);
    return () => this.hazardListeners.delete(listener);
  }

  public onGeoIntel(listener: GeoIntelListener): () => void {
    this.geoIntelListeners.add(listener);
    return () => this.geoIntelListeners.delete(listener);
  }

  public onPatient(listener: PatientListener): () => void {
    this.patientListeners.add(listener);
    return () => this.patientListeners.delete(listener);
  }

  public onReset(listener: ResetListener): () => void {
    this.resetListeners.add(listener);
    return () => this.resetListeners.delete(listener);
  }

  // --- Simulation Controls (Triggered to Backend) ---
  public async pauseSimulation(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/telemetry/pause`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async resumeSimulation(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/telemetry/resume`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async stepSimulation(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/telemetry/tick`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }

  public getState(): RealtimeState {
    return {
      status: this.status,
      lastEventTimestamp: this.lastEventTimestamp,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

export const realtimeService = new RealtimeService();
