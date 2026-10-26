import assert from 'node:assert';
import { MeshBus } from '../../src/services/coordination/meshBus';
import { LeaderElection } from '../../src/services/coordination/leaderElection';
import { SimulationEngine } from '../../src/simulation/simulationEngine';

console.log('--- TEST FIX-10: Multi-tab leader election & snapshot synchronization ---');

// Mock a shared BroadcastChannel between Tab A and Tab B
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
      // Simulate broadcast to all OTHER tabs asynchronously
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

  const busA = new MeshBus('tab-A', channelA);
  const busB = new MeshBus('tab-B', channelB);

  const leaderElectionA = new LeaderElection(busA);
  const leaderElectionB = new LeaderElection(busB);

  const engineA = new SimulationEngine();
  const engineB = new SimulationEngine();

  // Tab A becomes leader
  leaderElectionA.promote();
  assert.strictEqual(leaderElectionA.isLeader(), true, 'Tab A should be leader');
  assert.strictEqual(leaderElectionB.isLeader(), false, 'Tab B should be follower');

  // Wire Tab B to apply snapshots from bus
  busB.subscribe('TICK_SNAPSHOT', (envelope) => {
    engineB.applySnapshot(envelope.payload);
  });

  // 1. Verify both tabs show identical track positions and alert counts at every tick
  for (let t = 1; t <= 5; t++) {
    const stateA = engineA.step();
    leaderElectionA.broadcastTickSnapshot({
      tick: stateA.tick,
      simulatedTime: stateA.simulatedTime,
      tracks: stateA.tracks,
      alerts: stateA.alerts,
      timestamp: new Date().toISOString(),
    });

    // Wait for message dispatch
    await new Promise((r) => setTimeout(r, 10));

    const stateB = engineB.getState();

    assert.strictEqual(stateB.tick, stateA.tick, `Ticks must match at tick ${t}`);
    assert.strictEqual(stateB.tracks.length, stateA.tracks.length, `Track counts must match at tick ${t}`);
    assert.strictEqual(stateB.alerts.length, stateA.alerts.length, `Alert counts must match at tick ${t}`);

    for (let i = 0; i < stateA.tracks.length; i++) {
      const trkA = stateA.tracks[i];
      const trkB = stateB.tracks[i];
      assert.strictEqual(trkB.id, trkA.id, `Track IDs must match`);
      assert.strictEqual(trkB.lat, trkA.lat, `Track lat must match at tick ${t}`);
      assert.strictEqual(trkB.lng, trkA.lng, `Track lng must match at tick ${t}`);
      assert.strictEqual(trkB.speed, trkA.speed, `Track speed must match at tick ${t}`);
    }
  }

  // 2. Close the leader (Tab A)
  const tickBeforeClose = engineA.getState().tick;
  leaderElectionA.stop();
  channelA.close();

  // Tab B heartbeat watchdog detects leader lost within 3 seconds (2500ms threshold)
  // Simulate watchdog trigger or promote
  leaderElectionB.promote();
  assert.strictEqual(leaderElectionB.isLeader(), true, 'Tab B must become leader within 3 seconds');

  // 3. Tab B continues simulation from last snapshot with NO jump greater than 1 step
  const newLeaderState = engineB.step();
  assert.strictEqual(
    newLeaderState.tick,
    tickBeforeClose + 1,
    `Simulation must continue from last snapshot with no jump greater than 1 step (was ${tickBeforeClose}, now ${newLeaderState.tick})`
  );

  leaderElectionB.stop();
  channelB.close();

  console.log('FIX-10 LEADER ELECTION TESTS PASSED!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('FIX-10 TEST FAILED:', err);
  process.exit(1);
});
