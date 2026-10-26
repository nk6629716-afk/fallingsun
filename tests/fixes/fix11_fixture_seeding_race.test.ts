import assert from 'node:assert';
import { SentinelDatabase } from '../../src/services/storage/indexedDb';
import {
  INITIAL_INCIDENTS,
  INITIAL_ALERTS,
  INITIAL_GEO_OBSERVATIONS,
  INITIAL_CASUALTIES,
  ROAD_HAZARD_EDGES,
} from '../../src/services/data/fixtures';

console.log('--- TEST FIX-11: Fixture seeding race across 3 concurrent tabs ---');

// Mock shared in-memory IDB supporting transactions
class MockStore {
  public data: Map<string, any> = new Map();

  count() {
    const req: any = { result: this.data.size, onsuccess: null };
    setTimeout(() => {
      req.result = this.data.size;
      req.onsuccess?.();
    }, 0);
    return req;
  }

  put(item: any) {
    this.data.set(item.id, { ...item });
  }

  getAll() {
    const req: any = { result: Array.from(this.data.values()), onsuccess: null };
    setTimeout(() => {
      req.result = Array.from(this.data.values());
      req.onsuccess?.();
    }, 0);
    return req;
  }

  clear() {
    this.data.clear();
  }
}

const sharedStores: Record<string, MockStore> = {
  incidents: new MockStore(),
  alerts: new MockStore(),
  geointel: new MockStore(),
  casualties: new MockStore(),
  hazards: new MockStore(),
};

// Lock simulation
let activeLock: Promise<any> = Promise.resolve();

const mockLocks = {
  request: async (name: string, fn: () => Promise<any>) => {
    const prev = activeLock;
    let release: any;
    activeLock = new Promise((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  },
};

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { locks: mockLocks },
});

function createMockDb() {
  return {
    transaction: (storeNames: string[], mode: string) => {
      const tx: any = {
        objectStore: (name: string) => sharedStores[name],
        oncomplete: null,
        onerror: null,
        onabort: null,
      };
      setTimeout(() => {
        tx.oncomplete?.();
      }, 5);
      return tx;
    },
  };
}

async function runTest() {
  // Clear storage initially
  for (const s of Object.values(sharedStores)) s.clear();

  // Create 3 tabs
  const tab1Db = new SentinelDatabase();
  const tab2Db = new SentinelDatabase();
  const tab3Db = new SentinelDatabase();

  (tab1Db as any).initDB = async () => createMockDb();
  (tab2Db as any).initDB = async () => createMockDb();
  (tab3Db as any).initDB = async () => createMockDb();

  // Open 3 tabs simultaneously on empty storage
  await Promise.all([
    tab1Db.seedDefaultFixturesIfEmpty(),
    tab2Db.seedDefaultFixturesIfEmpty(),
    tab3Db.seedDefaultFixturesIfEmpty(),
  ]);

  // Assert each store has exactly the expected fixture count
  assert.strictEqual(
    sharedStores.incidents.data.size,
    INITIAL_INCIDENTS.length,
    `Incidents count mismatch: expected ${INITIAL_INCIDENTS.length}, got ${sharedStores.incidents.data.size}`
  );

  assert.strictEqual(
    sharedStores.alerts.data.size,
    INITIAL_ALERTS.length,
    `Alerts count mismatch: expected ${INITIAL_ALERTS.length}, got ${sharedStores.alerts.data.size}`
  );

  assert.strictEqual(
    sharedStores.geointel.data.size,
    INITIAL_GEO_OBSERVATIONS.length,
    `GeoIntel count mismatch: expected ${INITIAL_GEO_OBSERVATIONS.length}, got ${sharedStores.geointel.data.size}`
  );

  assert.strictEqual(
    sharedStores.casualties.data.size,
    INITIAL_CASUALTIES.length,
    `Casualties count mismatch: expected ${INITIAL_CASUALTIES.length}, got ${sharedStores.casualties.data.size}`
  );

  assert.strictEqual(
    sharedStores.hazards.data.size,
    ROAD_HAZARD_EDGES.length,
    `Hazards count mismatch: expected ${ROAD_HAZARD_EDGES.length}, got ${sharedStores.hazards.data.size}`
  );

  console.log('FIX-11 3-TAB FIXTURE SEEDING TESTS PASSED!');
}

runTest().catch((err) => {
  console.error('FIX-11 TEST FAILED:', err);
  process.exit(1);
});
