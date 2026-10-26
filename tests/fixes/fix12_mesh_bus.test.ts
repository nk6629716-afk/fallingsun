import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshBus, MeshBusEnvelope } from '../../src/services/coordination/meshBus';

console.log('--- TEST FIX-12: Single BroadcastChannel sentinel_mesh_bus and canonical envelope ---');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Repo-wide check: "sentinel_tactical_mesh" must NOT appear anywhere in src/
const srcDir = path.resolve(__dirname, '../../src');

function assertNoTacticalMesh(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'geointel') {
        assertNoTacticalMesh(full);
      }
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf-8');
      assert.strictEqual(
        content.includes('sentinel_tactical_mesh'),
        false,
        `Found forbidden channel "sentinel_tactical_mesh" in ${full}`
      );
    }
  }
}

assertNoTacticalMesh(srcDir);

// 2. Shared mock channel for testing multi-tab behavior
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
  const channelA = createMockChannel();
  const channelB = createMockChannel();

  const busA = new MeshBus('tab-1', channelA);
  const busB = new MeshBus('tab-2', channelB);

  const receivedByA: any[] = [];
  const receivedByB: any[] = [];

  busA.subscribe('*', (env) => receivedByA.push(env));
  busB.subscribe('*', (env) => receivedByB.push(env));

  // A. Message appears once per tab
  const env1 = busA.publish('HAZARD_UPDATE', { edgeId: 'EDGE-1', blocked: true });
  await new Promise((r) => setTimeout(r, 20));

  assert.strictEqual(receivedByB.length, 1, 'Tab B must receive published message once');
  assert.strictEqual(receivedByB[0].id, env1.id);
  assert.strictEqual(receivedByB[0].type, 'HAZARD_UPDATE');
  assert.strictEqual(receivedByB[0].origin, 'tab-1');
  assert.strictEqual(receivedByB[0].v, 1);
  assert.strictEqual(receivedByB[0].payload.edgeId, 'EDGE-1');

  // B. Self-sent message is not re-applied
  assert.strictEqual(receivedByA.length, 0, 'Tab A must ignore its own message');

  // C. Deduplication by ID (duplicate transmission of same ID)
  // Simulate duplicate delivery
  busB.handleIncoming(env1);
  assert.strictEqual(receivedByB.length, 1, 'Duplicate message with same id must be ignored by LRU');

  // D. Malformed messages are ignored without throwing
  const malformedInputs = [
    null,
    undefined,
    12345,
    'plain string',
    {},
    { id: '123' }, // missing type, ts, origin, v, payload
    { id: '123', type: 'TEST', ts: Date.now(), origin: 'tab-3' }, // missing v, payload
    { id: '123', type: 'TEST', ts: Date.now(), origin: 'tab-3', v: 2, payload: {} }, // wrong version
    { id: 123, type: 'TEST', ts: 'now', origin: 'tab-3', v: 1, payload: {} }, // wrong types
  ];

  for (const malformed of malformedInputs) {
    let threw = false;
    try {
      const handled = busB.handleIncoming(malformed);
      assert.strictEqual(handled, false, `Malformed message should be rejected: ${JSON.stringify(malformed)}`);
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, 'Malformed message must not throw');
  }

  assert.strictEqual(receivedByB.length, 1, 'No malformed messages should have been added to Tab B');

  busA.close();
  busB.close();

  console.log('FIX-12 MESH BUS TESTS PASSED!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('FIX-12 TEST FAILED:', err);
  process.exit(1);
});
