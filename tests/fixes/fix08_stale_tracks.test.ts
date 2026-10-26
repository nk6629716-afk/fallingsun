import assert from 'node:assert';
import { SimulationEngine } from '../../src/simulation/simulationEngine';
import { selectRankedThreatQueue } from '../../src/selectors/trackSelectors';
import { selectAlertCounts } from '../../src/selectors/alertSelectors';
import { TelemetryTrack, AirspaceAlert } from '../../shared/types';
import { SkyWatchAnomalyDetector } from '../../src/algorithms/skywatch/anomalyDetector';

console.log('--- TEST FIX-08: Stale track removal and alert key closure ---');

// 1. Test in SimulationEngine
const engine = new SimulationEngine();
engine.initDefaultState();

// Add a test track with an active alert
const testTrack: TelemetryTrack = {
  id: 'TRK-STALE-TEST',
  callsign: 'STALE-01',
  lat: 34.065,
  lng: -118.245,
  altitude: 300,
  speed: 120,
  heading: 90,
  timestamp: new Date().toISOString(),
  flightHistory: [],
  isSimulated: true,
  status: 'hostile',
  threatScore: 85,
};

engine.addTrack(testTrack);

const testAlert: AirspaceAlert = {
  id: 'ALT-STALE-TEST',
  trackId: 'TRK-STALE-TEST',
  trackCallsign: 'STALE-01',
  severity: 'critical',
  ruleName: 'ZONE_INCURSION',
  observedValue: '100m inside zone',
  threshold: '0m',
  explanation: 'Zone breach',
  timestamp: new Date().toISOString(),
  acknowledged: false,
};

engine.addAlert(testAlert);

// Verify initially present on map (getState().tracks), queue, and alert counts
let state = engine.getState();
assert.strictEqual(state.tracks.some((t) => t.id === 'TRK-STALE-TEST'), true, 'Track must be initially present');
let queue = selectRankedThreatQueue(state.tracks, state.zones, state.alerts);
assert.strictEqual(queue.some((t) => t.id === 'TRK-STALE-TEST'), true, 'Track must be in threat queue');
let counts = selectAlertCounts(state.alerts);
const initialOpenCount = counts.openCount;
assert.strictEqual(initialOpenCount > 0, true);

// Stop updating TRK-STALE-TEST
engine.stopUpdatingTrack('TRK-STALE-TEST');

// Advance 5 simulated seconds (ticks)
for (let i = 0; i < 5; i++) {
  engine.step();
}

// At 5 simulated seconds: track must still be present (< 10 seconds)
state = engine.getState();
assert.strictEqual(state.tracks.some((t) => t.id === 'TRK-STALE-TEST'), true, 'Track should still be present at 5s');

// Advance 6 more simulated seconds (total 11 simulated seconds since update stopped)
for (let i = 0; i < 6; i++) {
  engine.step();
}

// After 10 simulated seconds without update:
state = engine.getState();
// 1. Disappears from map (tracks in state)
assert.strictEqual(
  state.tracks.some((t) => t.id === 'TRK-STALE-TEST'),
  false,
  'Track must disappear from map after 10 simulated seconds'
);

// 2. Disappears from threat queue
queue = selectRankedThreatQueue(state.tracks, state.zones, state.alerts);
assert.strictEqual(
  queue.some((t) => t.id === 'TRK-STALE-TEST'),
  false,
  'Track must disappear from threat queue'
);

// 3. Disappears from open alert counts
counts = selectAlertCounts(state.alerts);
assert.strictEqual(counts.openCount < initialOpenCount, true, 'Alerts for stale track must be closed');
assert.strictEqual(
  state.alerts.filter((a) => a.trackId === 'TRK-STALE-TEST' && !a.acknowledged && !(a as any).closed).length,
  0
);

// 4. Verify in AnomalyDetector that open alert key closes through FIX-02 rule
const detector = new SkyWatchAnomalyDetector();
// Enter zone at t = 1000000
detector.evaluate({
  trackId: 'TRK-STALE-DETECTOR',
  callsign: 'STALE-DETECTOR',
  lat: 34.062,
  lng: -118.255,
  altitudeMeters: 200,
  speedKnots: 50,
  headingDeg: 0,
  timestamp: new Date(1000000).toISOString(),
});

assert.strictEqual(detector.isAlertKeyOpen('TRK-STALE-DETECTOR', 'restricted_zone_entry'), true);

// Stop sending updates to TRK-STALE-DETECTOR.
// At t = 1000000 + 10000 (10 simulated seconds later), prune stale tracks:
const pruned = detector.pruneStaleTracks(1000000 + 10000);
assert.strictEqual(pruned.includes('TRK-STALE-DETECTOR'), true);

// By FIX-02 rule, condition has been false for 10s (>= 5s), so key is closed
assert.strictEqual(detector.isAlertKeyOpen('TRK-STALE-DETECTOR', 'restricted_zone_entry'), false);

console.log('FIX-08 STALE TRACK REMOVAL TESTS PASSED!');
