/**
 * SENTINEL Leader Election System
 * FIX-10: Multi-tab coordination with navigator.locks.request('sentinel-leader')
 * and BroadcastChannel heartbeat fallback.
 * Only the leader runs simulation ticks, SyncManager, and SSE client.
 * Followers render broadcast snapshots and leadership transfers in <= 3 seconds on tab close.
 */

import { MeshBus, meshBus, MeshBusEnvelope } from './meshBus';

export interface TickSnapshotPayload {
  tick: number;
  simulatedTime: string;
  tracks: any[];
  alerts: any[];
  timestamp: string;
}

export type LeaderChangeCallback = (isLeader: boolean) => void;

export class LeaderElection {
  private bus: MeshBus;
  private leader: boolean = false;
  private abortController: AbortController | null = null;
  private heartbeatInterval: any = null;
  private heartbeatWatchdog: any = null;
  private lastHeartbeatReceivedAt: number = 0;
  private listeners: Set<LeaderChangeCallback> = new Set();
  private releaseLock: (() => void) | null = null;
  private active = false;

  constructor(bus: MeshBus = meshBus) {
    this.bus = bus;
  }

  public isLeader(): boolean {
    return this.leader;
  }

  public getTabId(): string {
    return this.bus.getTabId();
  }

  public onLeaderChange(callback: LeaderChangeCallback): () => void {
    this.listeners.add(callback);
    callback(this.leader);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private setLeader(newStatus: boolean): void {
    if (this.leader !== newStatus) {
      this.leader = newStatus;
      for (const cb of this.listeners) {
        try {
          cb(this.leader);
        } catch (err) {
          console.error('[LeaderElection] Listener error:', err);
        }
      }
    }
  }

  /**
   * Starts leader election loop
   */
  public async start(): Promise<void> {
    if (this.active) return;
    this.active = true;

    // Listen for heartbeats from other tabs (fallback / presence)
    this.bus.subscribe('LEADER_HEARTBEAT', (envelope: MeshBusEnvelope) => {
      this.lastHeartbeatReceivedAt = Date.now();
      if (this.leader && envelope.origin !== this.bus.getTabId()) {
        // Tie-breaker: lexicographically lower tab ID yields
        if (envelope.origin < this.bus.getTabId()) {
          console.log('[LeaderElection] Yielding leadership to lower tabId:', envelope.origin);
          this.demote();
        }
      }
    });

    const hasWebLocks =
      typeof navigator !== 'undefined' &&
      Boolean((navigator as any).locks && typeof (navigator as any).locks.request === 'function');

    if (hasWebLocks) {
      this.runWebLocksElection();
    } else {
      this.runHeartbeatFallbackElection();
    }
  }

  private runWebLocksElection(): void {
    this.abortController = new AbortController();
    const locks = (navigator as any).locks;

    locks
      .request('sentinel-leader', { signal: this.abortController.signal }, async () => {
        this.promote();
        return new Promise<void>((resolve) => {
          this.releaseLock = resolve;
        });
      })
      .catch((err: any) => {
        if (err?.name !== 'AbortError') {
          console.warn('[LeaderElection] Web locks failed, switching to heartbeat fallback:', err);
          this.runHeartbeatFallbackElection();
        }
      });
  }

  private runHeartbeatFallbackElection(): void {
    // Check for leader heartbeat every 500ms
    this.lastHeartbeatReceivedAt = Date.now();
    this.heartbeatWatchdog = setInterval(() => {
      if (!this.active) return;
      const elapsed = Date.now() - this.lastHeartbeatReceivedAt;

      // Transfer leadership within 3 seconds if leader vanishes
      if (!this.leader && elapsed >= 2500) {
        this.promote();
      }
    }, 500);
    if (this.heartbeatWatchdog && typeof this.heartbeatWatchdog.unref === 'function') {
      this.heartbeatWatchdog.unref();
    }
  }

  public promote(): void {
    if (this.leader) return;
    this.setLeader(true);

    // Broadcast heartbeat every 1000ms
    this.heartbeatInterval = setInterval(() => {
      if (this.leader && this.active) {
        this.bus.publish('LEADER_HEARTBEAT', {
          tabId: this.bus.getTabId(),
          timestamp: Date.now(),
        });
      }
    }, 1000);
    if (this.heartbeatInterval && typeof this.heartbeatInterval.unref === 'function') {
      this.heartbeatInterval.unref();
    }

    // Send immediate heartbeat on promotion
    this.bus.publish('LEADER_HEARTBEAT', {
      tabId: this.bus.getTabId(),
      timestamp: Date.now(),
    });
  }

  public demote(): void {
    if (!this.leader) return;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.setLeader(false);
  }

  /**
   * Broadcasts simulation tick snapshot from leader to follower tabs
   */
  public broadcastTickSnapshot(snapshot: TickSnapshotPayload): void {
    if (!this.leader) return;
    this.bus.publish('TICK_SNAPSHOT', snapshot);
  }

  /**
   * Stops election, releases lock, and cleans up resources
   */
  public stop(): void {
    this.active = false;
    this.demote();

    if (this.releaseLock) {
      this.releaseLock();
      this.releaseLock = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.heartbeatWatchdog) {
      clearInterval(this.heartbeatWatchdog);
      this.heartbeatWatchdog = null;
    }
  }
}

export const leaderElection = new LeaderElection();
