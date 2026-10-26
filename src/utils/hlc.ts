/**
 * SENTINEL Hybrid Logical Clock (HLC) & Concurrent Shared Record Resolution
 * FIX-14: HLC versioning { hlc: `${ms}.${counter}`, tab }, higher version wins,
 * and 24-hour tombstones for deletes.
 */

export interface HLCVersion {
  hlc: string; // `${ms}.${counter}`
  tab: string; // tabId
}

export interface SharedRecord {
  id: string;
  version?: HLCVersion;
  isDeleted?: boolean;
  deletedAt?: string;
  [key: string]: any;
}

export class HybridLogicalClock {
  private lastTimeMs: number = 0;
  private counter: number = 0;
  private tabId: string;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  public now(): HLCVersion {
    const physicalMs = Date.now();
    if (physicalMs > this.lastTimeMs) {
      this.lastTimeMs = physicalMs;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return {
      hlc: `${this.lastTimeMs}.${this.counter}`,
      tab: this.tabId,
    };
  }

  public update(remote: HLCVersion): HLCVersion {
    const physicalMs = Date.now();
    const [remoteMsStr, remoteCounterStr] = (remote.hlc || '0.0').split('.');
    const remoteMs = parseInt(remoteMsStr, 10) || 0;
    const remoteCounter = parseInt(remoteCounterStr, 10) || 0;

    const maxMs = Math.max(physicalMs, this.lastTimeMs, remoteMs);
    if (maxMs === this.lastTimeMs && maxMs === remoteMs) {
      this.counter = Math.max(this.counter, remoteCounter) + 1;
    } else if (maxMs === remoteMs) {
      this.counter = remoteCounter + 1;
    } else {
      this.counter = 0;
    }
    this.lastTimeMs = maxMs;

    return {
      hlc: `${this.lastTimeMs}.${this.counter}`,
      tab: this.tabId,
    };
  }

  public static compare(a?: HLCVersion, b?: HLCVersion): number {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    const [aMsStr, aCountStr] = (a.hlc || '0.0').split('.');
    const [bMsStr, bCountStr] = (b.hlc || '0.0').split('.');

    const aMs = Number(aMsStr) || 0;
    const bMs = Number(bMsStr) || 0;
    if (aMs !== bMs) return aMs - bMs;

    const aCount = Number(aCountStr) || 0;
    const bCount = Number(bCountStr) || 0;
    if (aCount !== bCount) return aCount - bCount;

    return (a.tab || '').localeCompare(b.tab || '');
  }

  /**
   * Reconciles two records: higher HLC version wins.
   * If record is deleted, it is kept as a tombstone for 24 hours.
   */
  public static reconcile<T extends SharedRecord>(local?: T, incoming?: T): T | undefined {
    let winningRecord: T | undefined;

    if (!local && !incoming) return undefined;
    if (!local) winningRecord = incoming;
    else if (!incoming) winningRecord = local;
    else {
      const cmp = HybridLogicalClock.compare(incoming.version, local.version);
      winningRecord = cmp >= 0 ? incoming : local;
    }

    // Prune expired tombstones older than 24 hours (86,400,000 ms)
    if (winningRecord && winningRecord.isDeleted && winningRecord.deletedAt) {
      const ageMs = Date.now() - new Date(winningRecord.deletedAt).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return undefined; // Tombstone expired
      }
    }

    return winningRecord;
  }
}
