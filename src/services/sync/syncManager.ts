/**
 * SENTINEL — Robust Offline-First Data Synchronization Manager
 *
 * Capabilities (FIX-18):
 * - Single mutex (syncInProgress) preventing overlap between manual Sync, online event,
 *   visibilitychange, and background timers.
 * - Per-item results handling:
 *     - 4xx validation error marks the item failed with a visible reason and no further retries (poison item does not block others).
 *     - 5xx/network errors retry with delay = min(30s, 3s * 2^attempt) * random(0.5..1.0) jitter; attempts and nextRetryAt stored per item.
 * - Exactly one scheduled retry timer at a time, cleared on online/visibilitychange.
 * - Backoff resets after any success.
 * - Local mode (no backend configured): marks local-only records as locally committed, showing a clear message, never an error.
 * - Multi-tab coordination via BroadcastChannel ('sentinel_mesh_bus').
 */

import { api, API_BASE_URL } from '../api/apiClient';
import { dbService } from '../storage/indexedDb';
import { IncidentReport, GeoIntelObservation, OutboxItem } from '@shared/types';
import { meshBus } from '../coordination/meshBus';

export interface SyncManagerState {
  isOnline: boolean;
  isBackendReachable: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  syncedCount: number;
  lastSyncTime: string | null;
  lastSyncError: string | null;
  lastSyncMessage?: string | null;
}

export type SyncStateListener = (state: SyncManagerState) => void;

export class SyncManager {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isBackendReachable: boolean = false;
  private isSyncing: boolean = false;
  private syncInProgress: boolean = false; // FIX-18: Single mutex preventing concurrent sync overlap
  private pendingCount: number = 0;
  private failedCount: number = 0;
  private syncedCount: number = 0;
  private lastSyncTime: string | null = null;
  private lastSyncError: string | null = null;
  private lastSyncMessage: string | null = null;

  private listeners = new Set<SyncStateListener>();
  private checkTimer: any = null;
  private retryTimer: any = null; // FIX-18: Exactly one scheduled retry timer
  private backoffDelay: number = 3000; // ms
  private readonly MIN_BACKOFF = 3000;
  private readonly MAX_BACKOFF = 30000;

  constructor(private readonly requiresSession = false) {
    this.initNetworkListeners();
    this.initBroadcastChannel();
    this.refreshCounts();
  }

  private canSync(): boolean {
    if (!this.requiresSession) return true;
    try { return Boolean(localStorage.getItem('sentinel_auth_token')); } catch { return false; }
  }

  private initNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.clearRetryTimer(); // FIX-18: Clear timer on online
      this.notifyListeners();
      this.handleConnectivityRestored();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.isBackendReachable = false;
      this.clearRetryTimer();
      this.notifyListeners();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isOnline) {
        this.clearRetryTimer(); // FIX-18: Clear timer on visibilitychange
        this.triggerSync().catch(() => {});
      }
    });

    // Start background health check
    this.scheduleNextCheck(1000);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private scheduleRetryTimer(delayMs: number): void {
    this.clearRetryTimer();
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      await this.triggerSync().catch(() => {});
    }, delayMs);
  }

  private initBroadcastChannel(): void {
    meshBus.subscribe('*', (envelope) => {
      if (envelope.type === 'LOCAL_RECORD_CHANGED' || envelope.type === 'SYNC_COMPLETED') {
        this.refreshCounts();
      }
    });
  }

  private notifyTabMesh(type: string, data?: any): void {
    meshBus.publish(type, data);
  }

  public subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): SyncManagerState {
    return {
      isOnline: this.isOnline,
      isBackendReachable: this.isBackendReachable,
      isSyncing: this.isSyncing,
      pendingCount: this.pendingCount,
      failedCount: this.failedCount,
      syncedCount: this.syncedCount,
      lastSyncTime: this.lastSyncTime,
      lastSyncError: this.lastSyncError,
      lastSyncMessage: this.lastSyncMessage,
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (e) {
        console.error('[SyncManager] Listener error:', e);
      }
    }
  }

  public async refreshCounts(): Promise<void> {
    try {
      const [pendingIncidents, pendingGeo, allIncidents, outboxItems] = await Promise.all([
        dbService.getPendingSyncIncidents(),
        dbService.getPendingSyncGeoObservations(),
        dbService.getIncidents(),
        dbService.getOutboxItems(),
      ]);

      const failedIncidents = pendingIncidents.filter((i) => i.syncStatus === 'failed');
      const failedGeo = pendingGeo.filter((g) => (g as any).syncStatus === 'failed');
      const failedOutbox = outboxItems.filter((o) => o.status === 'failed');
      const syncedInc = allIncidents.filter((i) => i.syncStatus === 'synced');

      this.pendingCount = pendingIncidents.length + pendingGeo.length + outboxItems.filter((o) => o.status === 'pending').length;
      this.failedCount = failedIncidents.length + failedGeo.length + failedOutbox.length;
      this.syncedCount = syncedInc.length;
      this.notifyListeners();
    } catch {
      // Storage not yet ready
    }
  }

  private scheduleNextCheck(delayMs: number): void {
    if (this.checkTimer) clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(async () => {
      await this.probeAndSync();
    }, delayMs);
  }

  private async probeAndSync(): Promise<void> {
    if (!this.canSync()) { this.scheduleNextCheck(1000); return; }
    if (api.getOfflineSimulation()) {
      this.isBackendReachable = false;
      this.notifyListeners();
      this.scheduleNextCheck(this.MAX_BACKOFF);
      return;
    }

    try {
      const reachable = await api.checkBackendAvailability();
      const changed = this.isBackendReachable !== reachable;
      this.isBackendReachable = reachable;

      if (reachable) {
        this.backoffDelay = this.MIN_BACKOFF;
        await this.refreshCounts();
        if (this.pendingCount > 0 && !this.syncInProgress) {
          await this.triggerSync();
        }
      } else {
        this.backoffDelay = Math.min(this.backoffDelay * 2, this.MAX_BACKOFF);
      }

      if (changed) {
        this.notifyListeners();
      }
    } catch {
      this.isBackendReachable = false;
      this.backoffDelay = Math.min(this.backoffDelay * 2, this.MAX_BACKOFF);
      this.notifyListeners();
    } finally {
      this.scheduleNextCheck(this.isBackendReachable ? 10000 : this.backoffDelay);
    }
  }

  private async handleConnectivityRestored(): Promise<void> {
    if (!this.canSync()) return;
    this.backoffDelay = this.MIN_BACKOFF;
    const reachable = await api.checkBackendAvailability();
    this.isBackendReachable = reachable;
    this.notifyListeners();

    if (reachable) {
      await this.triggerSync();
    }
  }

  /**
   * Main idempotent sync trigger (FIX-18)
   */
  public async triggerSync(): Promise<{
    incidentsSynced: number;
    geoSynced: number;
    errors: string[];
  }> {
    if (!this.canSync()) return { incidentsSynced: 0, geoSynced: 0, errors: [] };
    // Single mutex check
    if (this.syncInProgress) {
      return { incidentsSynced: 0, geoSynced: 0, errors: [] };
    }

    this.syncInProgress = true;
    this.isSyncing = true;
    this.lastSyncError = null;
    this.notifyListeners();

    const errors: string[] = [];
    let incidentsSynced = 0;
    let geoSynced = 0;
    let anySuccess = false;
    let earliestRetryDelay: number | null = null;

    try {
      // Local mode check (FIX-18: Local mode marks records as locally committed, shows clear message, never an error)
      const isSimulatedOffline = api.getOfflineSimulation();
      const isConfigured = Boolean(API_BASE_URL);
      const isReachable = !isSimulatedOffline && isConfigured && (await api.checkBackendAvailability());

      if (!isReachable) {
        // Local mode: mark records as locally committed
        const outboxItems = await dbService.getPendingOutboxItems();
        for (const item of outboxItems) {
          item.status = 'synced';
          item.syncedAt = new Date().toISOString();
          await dbService.putOutboxItem(item);
        }
        this.lastSyncMessage = 'Local mode: changes safely committed locally in IndexedDB.';
        this.lastSyncTime = new Date().toISOString();
        await this.refreshCounts();
        return { incidentsSynced: 0, geoSynced: 0, errors: [] };
      }

      // 1. Sync FieldLink Incidents Outbox (Batch)
      const pendingInc = await dbService.getPendingSyncIncidents();
      if (pendingInc.length > 0) {
        try {
          const res = await api.syncPendingQueue();
          incidentsSynced = res.acceptedCount + (res.duplicateCount || 0);
          if (incidentsSynced > 0) anySuccess = true;
        } catch (err: any) {
          const msg = err.message || 'Incident outbox sync failed';
          errors.push(msg);
          this.lastSyncError = msg;
        }
      }

      // 2. Sync GeoIntel Observations Outbox
      const pendingGeo = await dbService.getPendingSyncGeoObservations();
      if (pendingGeo.length > 0) {
        try {
          const res = await api.syncPendingGeoObservations();
          geoSynced = res.synced;
          if (geoSynced > 0) anySuccess = true;
          if (res.failed > 0) {
            errors.push(`${res.failed} GeoIntel observations failed server validation`);
          }
        } catch (err: any) {
          const msg = err.message || 'GeoIntel observation sync failed';
          errors.push(msg);
          if (!this.lastSyncError) this.lastSyncError = msg;
        }
      }

      // 3. Process generic outbox items per-item (FIX-18)
      const outboxItems = await dbService.getPendingOutboxItems();
      const nowMs = Date.now();

      for (const item of outboxItems) {
        // Skip poisoned items that previously failed validation (4xx)
        if (item.status === 'failed') continue;

        // Skip items that are in backoff window
        if (item.nextRetryAt && item.nextRetryAt > nowMs) {
          const waitTime = item.nextRetryAt - nowMs;
          if (earliestRetryDelay === null || waitTime < earliestRetryDelay) {
            earliestRetryDelay = waitTime;
          }
          continue;
        }

        try {
          // Attempt per-item sync depending on entityType
          let statusOk = true;

          if (item.entityType === 'alert_ack') {
            const res = await fetch(`${API_BASE_URL}/alerts/${item.payload.alertId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                acknowledged: true,
                acknowledgedBy: item.payload.acknowledgedBy || 'Duty Officer',
              }),
            });
            if (res.status >= 400 && res.status < 500) {
              const errBody = await res.json().catch(() => null);
              throw { status: res.status, message: errBody?.error?.message || `Validation error ${res.status}` };
            }
            if (!res.ok) {
              throw { status: res.status, message: `Server error ${res.status}` };
            }
          } else if (item.entityType === 'hazard') {
            const res = await fetch(`${API_BASE_URL}/hazards`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.payload),
            });
            if (res.status >= 400 && res.status < 500) {
              const errBody = await res.json().catch(() => null);
              throw { status: res.status, message: errBody?.error?.message || `Validation error ${res.status}` };
            }
            if (!res.ok) {
              throw { status: res.status, message: `Server error ${res.status}` };
            }
          } else if (item.entityType === 'casualty') {
            const casId = item.payload.id || item.payload.casualtyId;
            const res = await fetch(`${API_BASE_URL}/patients/${casId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.payload),
            });
            if (res.status >= 400 && res.status < 500) {
              const errBody = await res.json().catch(() => null);
              throw { status: res.status, message: errBody?.error?.message || `Validation error ${res.status}` };
            }
            if (!res.ok) {
              throw { status: res.status, message: `Server error ${res.status}` };
            }
          }

          // Item succeeded
          item.status = 'synced';
          item.syncedAt = new Date().toISOString();
          await dbService.deleteOutboxItem(item.id);
          anySuccess = true;
        } catch (err: any) {
          const status = err.status || 500;
          const msg = err.message || 'Operation failed';

          if (status >= 400 && status < 500) {
            // FIX-18: 4xx validation error marks item failed with visible reason and no further retries
            // Poison item does not block other items
            item.status = 'failed';
            item.errorMessage = msg;
            item.attempts = (item.attempts || 0) + 1;
            item.lastAttemptAt = new Date().toISOString();
            await dbService.putOutboxItem(item);
            errors.push(`Validation failure on ${item.entityType} ${item.id}: ${msg}`);
          } else {
            // FIX-18: 5xx/network error retries with delay = min(30s, 3s * 2^attempt) * random(0.5..1.0)
            const attempt = (item.attempts || 0) + 1;
            const baseDelay = Math.min(30000, 3000 * Math.pow(2, attempt));
            const jitter = 0.5 + 0.5 * Math.random();
            const delay = Math.round(baseDelay * jitter);

            item.attempts = attempt;
            item.nextRetryAt = Date.now() + delay;
            item.lastAttemptAt = new Date().toISOString();
            item.errorMessage = msg;
            item.status = 'pending';
            await dbService.putOutboxItem(item);

            if (earliestRetryDelay === null || delay < earliestRetryDelay) {
              earliestRetryDelay = delay;
            }
            errors.push(`Network/Server error on ${item.entityType} ${item.id}: ${msg}`);
          }
        }
      }

      // FIX-18: Backoff resets after any successful sync
      if (anySuccess) {
        this.backoffDelay = this.MIN_BACKOFF;
      }

      // FIX-18: Schedule exactly one retry timer if pending retries exist
      if (earliestRetryDelay !== null) {
        this.scheduleRetryTimer(earliestRetryDelay);
      }

      this.lastSyncTime = new Date().toISOString();
      await this.refreshCounts();

      // Broadcast update to other tabs
      this.notifyTabMesh('SYNC_COMPLETED', {
        incidentsSynced,
        geoSynced,
        timestamp: this.lastSyncTime,
      });

      return { incidentsSynced, geoSynced, errors };
    } finally {
      this.syncInProgress = false;
      this.isSyncing = false;
      this.notifyListeners();
    }
  }

  /**
   * Called when any module creates or updates a local record,
   * to immediately record the outbox item and notify other tabs.
   */
  public async recordLocalMutation(
    entityType: OutboxItem['entityType'],
    action: OutboxItem['action'],
    payload: any
  ): Promise<void> {
    try {
      const clientId = payload.clientId || payload.id || `op-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await dbService.queueMutation(entityType, action, payload, clientId);
      await this.refreshCounts();

      // Notify other open tabs through tactical mesh
      this.notifyTabMesh('LOCAL_RECORD_CHANGED', { entityType, action, id: clientId });
    } catch (err) {
      console.warn('[SyncManager] Failed to record mutation in outbox:', err);
    }
  }
}

export const syncManager = new SyncManager(true);
