import assert from 'node:assert';
import {
  classifyTrack,
  TRACK_CLASSIFICATION_LABELS,
  TrackClassification
} from '../../src/utils/trackClassification';
import { SkyWatchAnomalyDetector } from '../../src/algorithms/skywatch/anomalyDetector';
import { selectOpenAlerts } from '../../src/selectors/alertSelectors';
import { calculateTrackThreatScore } from '../../src/selectors/trackSelectors';
import { TelemetryTrackPoint } from '../../shared/contracts';
import { TelemetryTrack, RestrictedAirspaceZone } from '../../shared/types';

console.log('--- TEST FIX-03: Friendly tracks raise info entries & consistent 5-surface classification ---');

// 1. Verify classifyTrack and labels exist
assert.strictEqual(typeof classifyTrack, 'function');
assert.strictEqual(TRACK_CLASSIFICATION_LABELS.FRIENDLY, 'Friendly Force');
assert.strictEqual(TRACK_CLASSIFICATION_LABELS.CIVILIAN, 'Civilian Traffic');
assert.strictEqual(TRACK_CLASSIFICATION_LABELS.HOSTILE, 'Hostile Incursion');
assert.strictEqual(TRACK_CLASSIFICATION_LABELS.UNKNOWN, 'Unidentified Contact');

// 2. Test: a FRIENDLY track inside the restricted zone yields zero open alerts and one info entry
const detector = new SkyWatchAnomalyDetector();
const friendlyPoint: TelemetryTrackPoint = {
  trackId: 'TRK-BLUE-1',
  callsign: 'SENTINEL-BLUE-01',
  classification: 'FRIENDLY',
  type: 'friendly_uav',
  lat: 34.062, // Center of restricted zone
  lng: -118.255,
  altitudeMeters: 500,
  speedKnots: 100,
  headingDeg: 90,
  timestamp: new Date().toISOString()
};

const alerts = detector.evaluate(friendlyPoint);
// Should create exactly one informational entry, NOT a critical or warning alert
assert.strictEqual(alerts.length, 1, 'Should emit 1 alert entry for activity logging');
assert.strictEqual(alerts[0].severity, 'info', 'Friendly breach must be severity "info"');
assert.strictEqual(alerts[0].explanation.includes('Friendly Force'), true, 'Alert text must use label map');

// Verify selectOpenAlerts treats info entries as non-blocking activity entries (0 open alerts)
const openAlerts = selectOpenAlerts(detector.getAlerts());
assert.strictEqual(openAlerts.length, 0, 'Friendly track in restricted zone must yield ZERO open alerts');

// 3. Test: all five surfaces show the same classification
const testTrack: TelemetryTrack = {
  id: 'TRK-FRIENDLY-ALPHA',
  callsign: 'GUARDIAN-01',
  type: 'friendly_uav',
  status: 'tracking',
  lat: 34.062,
  lng: -118.255,
  altitude: 500,
  speed: 50,
  heading: 90,
  timestamp: new Date().toISOString(),
  flightHistory: [],
  isSimulated: true,
  classification: 'FRIENDLY'
};

const c = classifyTrack(testTrack);
const expectedLabel = TRACK_CLASSIFICATION_LABELS[c];
assert.strictEqual(c, 'FRIENDLY');
assert.strictEqual(expectedLabel, 'Friendly Force');

// Surface 1: Classification function output
assert.strictEqual(classifyTrack({ classification: 'FRIENDLY' }), 'FRIENDLY');

// Surface 2: Map label / Symbol logic
const symbolClassification = classifyTrack(testTrack);
assert.strictEqual(symbolClassification, 'FRIENDLY');

// Surface 3: Threat Queue evaluation
const mockZone: RestrictedAirspaceZone = {
  id: 'ZONE-B',
  name: 'Zone Bravo',
  center: { lat: 34.062, lng: -118.255 },
  radiusKm: 1.5,
  ceilingMeters: 1000,
  active: true
};
const threatEval = calculateTrackThreatScore(testTrack, [mockZone], []);
// Friendly tracks must not be assigned hostile threat scores
assert.strictEqual(threatEval.score <= 15, true, 'Friendly track must have minimal threat score');

// Surface 4: Alert text uses classification label
assert.strictEqual(alerts[0].explanation.includes(expectedLabel), true);

// Surface 5: Inspection card classification
const inspectorClassification = classifyTrack(testTrack);
assert.strictEqual(TRACK_CLASSIFICATION_LABELS[inspectorClassification], 'Friendly Force');

// 4. Civilian with authorized squawk (1200) also yields zero open alerts
const civilianPoint: TelemetryTrackPoint = {
  trackId: 'TRK-CIV-1',
  callsign: 'Piper Archer N1234',
  classification: 'CIVILIAN',
  type: 'commercial_fixed_wing',
  squawk: 1200,
  lat: 34.062,
  lng: -118.255,
  altitudeMeters: 500,
  speedKnots: 100,
  headingDeg: 90,
  timestamp: new Date().toISOString()
};
const detectorCiv = new SkyWatchAnomalyDetector();
const civAlerts = detectorCiv.evaluate(civilianPoint);
assert.strictEqual(civAlerts.length, 1);
assert.strictEqual(civAlerts[0].severity, 'info');
assert.strictEqual(selectOpenAlerts(detectorCiv.getAlerts()).length, 0, 'Civilian with authorized squawk yields 0 open alerts');

console.log('FIX-03 TESTS PASSED!');
