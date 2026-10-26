import assert from 'node:assert';
import { SkyWatchAnomalyDetector } from '../../src/algorithms/skywatch/anomalyDetector';
import { TelemetryTrackPoint } from '../../shared/contracts';

console.log('--- TEST FIX-02: Alerts never re-arm & zone hysteresis ---');

const detector = new SkyWatchAnomalyDetector();
const zone = detector.getConfig().restrictedZones[0];
// zone.centerLat: 34.062, zone.centerLng: -118.255, radiusKm: 1.5 -> radius = 1500m.
// 2% of 1500m = 30m; Math.max(50, 30) = 50m hysteresis. Exit boundary = 1550m.

const t0 = new Date('2026-10-26T12:00:00.000Z').getTime();

// SCENARIO 1: Enter, acknowledge, stay inside gives 1 alert total
// Point 1: Outside (lat: 34.050, lng: -118.255 -> ~1334m south of center, outside 1500m)
// Let's use exact coordinates or helper
const insidePoint = (secOffset: number, alt: number = 500): TelemetryTrackPoint => ({
  trackId: 'TRK-Z1',
  lat: 34.062, // Center of zone (0m from center, strictly inside 1500m)
  lng: -118.255,
  altitudeMeters: alt,
  speedKnots: 100,
  headingDeg: 0,
  timestamp: new Date(t0 + secOffset * 1000).toISOString()
});

// T=0s: Enter zone
const a1 = detector.evaluate(insidePoint(0));
assert.strictEqual(a1.length, 1, 'Initial entry into restricted zone must create 1 alert');
const alertId = a1[0].id;

// T=1s: Acknowledge alert
assert.strictEqual(detector.acknowledgeAlert(alertId), true);
assert.strictEqual(detector.getAlerts().find(a => a.id === alertId)?.acknowledged, true);

// T=2s, 3s, 4s: Stay inside zone while acknowledged
const a2 = detector.evaluate(insidePoint(2));
const a3 = detector.evaluate(insidePoint(3));
const a4 = detector.evaluate(insidePoint(4));
assert.strictEqual(a2.length, 0, 'Staying inside must not create duplicate alert');
assert.strictEqual(a3.length, 0, 'Staying inside must not create duplicate alert');
assert.strictEqual(a4.length, 0, 'Staying inside must not create duplicate alert');

const totalZoneAlerts1 = detector.getAlerts().filter(a => a.trackId === 'TRK-Z1' && a.ruleName === 'restricted_zone_entry');
assert.strictEqual(totalZoneAlerts1.length, 1, 'Enter, acknowledge, stay inside must give exactly 1 alert');

// SCENARIO 2: Exit for 10s then re-enter gives 2 alerts
// Far outside point (lat 34.100 -> ~4200m north of center, far outside 1550m)
const outsidePoint = (secOffset: number): TelemetryTrackPoint => ({
  trackId: 'TRK-Z1',
  lat: 34.100,
  lng: -118.255,
  altitudeMeters: 500,
  speedKnots: 100,
  headingDeg: 0,
  timestamp: new Date(t0 + secOffset * 1000).toISOString()
});

// Exit at T=10s, remain outside at T=15s (5s consecutive false), and T=20s (10s outside)
detector.evaluate(outsidePoint(10));
detector.evaluate(outsidePoint(15));
detector.evaluate(outsidePoint(20)); // Condition false for 10 consecutive seconds -> key closed

// T=25s: Re-enter zone
const aReEnter = detector.evaluate(insidePoint(25));
assert.strictEqual(aReEnter.length, 1, 'Re-entry after key closed must create a new alert');
assert.notStrictEqual(aReEnter[0].id, alertId, 'New alert must have a new id');

const totalZoneAlerts2 = detector.getAlerts().filter(a => a.trackId === 'TRK-Z1' && a.ruleName === 'restricted_zone_entry');
assert.strictEqual(totalZoneAlerts2.length, 2, 'Exit for 10s then re-enter must yield 2 alerts total');

// SCENARIO 3: Jitter around the boundary gives 1 alert
// Zone radius = 1500m. Center = (34.062, -118.255).
// 1 deg lat ~ 111,000m -> 1m ~ 0.000009009 deg lat.
// 1490m from center (inside) -> lat = 34.062 + (1490 / 111000) ~ 34.075423
// 1520m from center (outside 1500m, but inside hysteresis boundary 1550m) -> lat = 34.062 + (1520 / 111000) ~ 34.075693
const detectorJitter = new SkyWatchAnomalyDetector();
const lat1490m = 34.062 + (1490 / 111000);
const lat1520m = 34.062 + (1520 / 111000);

const pInside = (sec: number): TelemetryTrackPoint => ({
  trackId: 'TRK-JITTER',
  lat: lat1490m,
  lng: -118.255,
  altitudeMeters: 500,
  speedKnots: 100,
  headingDeg: 0,
  timestamp: new Date(t0 + sec * 1000).toISOString()
});

const pBorderJitter = (sec: number): TelemetryTrackPoint => ({
  trackId: 'TRK-JITTER',
  lat: lat1520m, // In the 1500m-1550m hysteresis zone
  lng: -118.255,
  altitudeMeters: 500,
  speedKnots: 100,
  headingDeg: 0,
  timestamp: new Date(t0 + sec * 1000).toISOString()
});

// Step 1: Enters at 1490m -> alert 1
const j1 = detectorJitter.evaluate(pInside(0));
assert.strictEqual(j1.length, 1, 'Initial entry at 1490m must raise 1 alert');

// Jitter back and forth across 1500m (1520m -> 1490m -> 1520m -> 1490m)
const j2 = detectorJitter.evaluate(pBorderJitter(1));
const j3 = detectorJitter.evaluate(pInside(2));
const j4 = detectorJitter.evaluate(pBorderJitter(3));
const j5 = detectorJitter.evaluate(pInside(4));

assert.strictEqual(j2.length, 0, 'Jitter into hysteresis margin must not raise new alert');
assert.strictEqual(j3.length, 0, 'Re-jitter inside must not raise duplicate alert');
assert.strictEqual(j4.length, 0, 'Jitter into hysteresis margin must not raise new alert');
assert.strictEqual(j5.length, 0, 'Re-jitter inside must not raise duplicate alert');

const jitterAlerts = detectorJitter.getAlerts().filter(a => a.trackId === 'TRK-JITTER' && a.ruleName === 'restricted_zone_entry');
assert.strictEqual(jitterAlerts.length, 1, 'Jitter around the boundary must yield exactly 1 alert');

console.log('FIX-02 TESTS PASSED!');
