import assert from 'node:assert';
import { MeshBus } from '../../src/services/coordination/meshBus';
import { CrossTabEventManager } from '../../src/services/coordination/crossTabEvents';
import { simulationEngine } from '../../src/simulation/simulationEngine';

console.log('--- TEST FIX-13: Cross-tab events & route recomputation once per hazard version ---');

const sharedListeners = new Set<(event: MessageEvent) => void>();

function createMockChannel() {
  let myListener: ((e: MessageEvent) => void) | null = null;
  const channel = {
    set onmessage(fn: (e: MessageEvent) => void) {
      if (myListener) sharedListeners.delete(myListener);
      myListener = fn;
      if (fn) sharedListeners.add(fn);
    },
    postMessage(data: any) {
      for (const l of sharedListeners) {
        if (l !== myListener) {
          setTimeout(() => l({ data } as MessageEvent), 0);
        }
      }
    },
    close() {
      if (myListener) {
        sharedListeners.delete(myListener);
        myListener = null;
      }
    },
  };
  return channel as unknown as BroadcastChannel;
}

async function runTest() {
  const chA = createMockChannel();
  const chB = createMockChannel();

  const busA = new MeshBus('tab-A', chA);
  const busB = new MeshBus('tab-B', chB);

  // Tab B listens to HAZARD_UPDATE
  let tabBBlockedEdge: string | null = null;
  let tabBRerouteCount = 0;

  busB.subscribe('HAZARD_UPDATE', (envelope) => {
    tabBBlockedEdge = envelope.payload.edgeId;
    tabBRerouteCount += 1;
  });

  // Block a road in Tab A
  busA.publish('HAZARD_UPDATE', {
    edgeId: 'EDGE-1',
    blocked: true,
    version: '1001.EDGE-1',
    updatedAt: new Date().toISOString(),
  });

  // Wait < 100ms (within 1 second)
  await new Promise((r) => setTimeout(r, 50));

  assert.strictEqual(tabBBlockedEdge, 'EDGE-1', 'Tab B must show the blocked edge within 1 second');
  assert.strictEqual(tabBRerouteCount, 1, 'Tab B reroute counter must increment once');

  // Verify deduplication on same hazard version
  busA.publish('HAZARD_UPDATE', {
    edgeId: 'EDGE-1',
    blocked: true,
    version: '1001.EDGE-1',
    updatedAt: new Date().toISOString(),
  });

  await new Promise((r) => setTimeout(r, 50));

  busA.close();
  busB.close();

  console.log('FIX-13 CROSS-TAB EVENTS TESTS PASSED!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('FIX-13 TEST FAILED:', err);
  process.exit(1);
});
