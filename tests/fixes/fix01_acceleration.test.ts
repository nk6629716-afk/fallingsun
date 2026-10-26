import assert from 'node:assert';
import {
  SkyWatchAnomalyDetector,
  SUDDEN_ACCEL_THRESHOLD_MS2
} from '../../src/algorithms/skywatch/anomalyDetector';
import { TelemetryTrackPoint } from '../../shared/contracts';

console.log('--- TEST FIX-01: Acceleration anomaly depends on tick size ---');

// 1. Verify constant exists and equals 150 * 0.514444
assert.strictEqual(
  typeof SUDDEN_ACCEL_THRESHOLD_MS2,
  'number',
  'SUDDEN_ACCEL_THRESHOLD_MS2 must be exported as a number'
);
assert.strictEqual(
  SUDDEN_ACCEL_THRESHOLD_MS2,
  150 * 0.514444,
  'SUDDEN_ACCEL_THRESHOLD_MS2 must equal 150 * 0.514444'
);

const detector = new SkyWatchAnomalyDetector();

// 2. First sample after creation never alerts
const t0 = new Date('2026-10-26T12:00:00.000Z').getTime();
const p1: TelemetryTrackPoint = {
  trackId: 'TRK-TEST-1',
  lat: 34.05,
  lng: -118.25,
  altitudeMeters: 500,
  speedKnots: 500, // Very high initial speed
  headingDeg: 90,
  timestamp: new Date(t0).toISOString()
};
const alertsP1 = detector.evaluate(p1);
assert.strictEqual(
  alertsP1.filter(a => a.ruleName === 'speed_anomaly' || a.ruleName === 'SUDDEN_ACCELERATION').length,
  0,
  'First sample after track creation must never raise an acceleration alert'
);

// 3. Same physical trajectory sampled at dt = 1.0 vs dt = 0.2
// Physical acceleration = 160 kts/s (> 150 kts/s threshold)
// Case A: dt = 1.0 -> speed delta = +160 kts
const detectorDt1 = new SkyWatchAnomalyDetector();
detectorDt1.evaluate({
  trackId: 'TRK-A',
  lat: 34.05,
  lng: -118.25,
  altitudeMeters: 500,
  speedKnots: 100,
  headingDeg: 90,
  timestamp: new Date(t0).toISOString()
});
const alertsDt1 = detectorDt1.evaluate({
  trackId: 'TRK-A',
  lat: 34.05,
  lng: -118.25,
  altitudeMeters: 500,
  speedKnots: 260, // +160 kts in 1s -> 160 kts/s
  headingDeg: 90,
  timestamp: new Date(t0 + 1000).toISOString()
});
const hasSpeedAlertDt1 = alertsDt1.some(
  a => a.ruleName === 'speed_anomaly' || a.ruleName === 'SUDDEN_ACCELERATION'
);
assert.strictEqual(hasSpeedAlertDt1, true, 'dt=1.0 with 160 kts/s must trigger acceleration alert');

// Case B: dt = 0.2 -> speed delta = +32 kts in 0.2s -> 160 kts/s
const detectorDt02 = new SkyWatchAnomalyDetector();
detectorDt02.evaluate({
  trackId: 'TRK-B',
  lat: 34.05,
  lng: -118.25,
  altitudeMeters: 500,
  speedKnots: 100,
  headingDeg: 90,
  timestamp: new Date(t0).toISOString()
});
const alertsDt02 = detectorDt02.evaluate({
  trackId: 'TRK-B',
  lat: 34.05,
  lng: -118.25,
  altitudeMeters: 500,
  speedKnots: 132, // +32 kts in 0.2s -> 160 kts/s
  headingDeg: 90,
  timestamp: new Date(t0 + 200).toISOString()
});
const hasSpeedAlertDt02 = alertsDt02.some(
  a => a.ruleName === 'speed_anomaly' || a.ruleName === 'SUDDEN_ACCELERATION'
);
assert.strictEqual(
  hasSpeedAlertDt02,
  true,
  'dt=0.2 with 160 kts/s must trigger acceleration alert just like dt=1.0'
);

// Case C: dt <= 0 must be skipped
const alertsDt0 = detectorDt1.evaluate({
  trackId: 'TRK-A',
  lat: 34.05,
  lng: -118.25,
  altitudeMeters: 500,
  speedKnots: 500,
  headingDeg: 90,
  timestamp: new Date(t0 + 1000).toISOString() // Same timestamp (dt = 0)
});
assert.strictEqual(
  alertsDt0.filter(a => a.ruleName === 'speed_anomaly' || a.ruleName === 'SUDDEN_ACCELERATION').length,
  0,
  'dt <= 0 must be skipped and never alert'
);

// Case D: Reset/reconnect clears history; first sample after reset must not alert
detectorDt1.reset();
const alertsAfterReset = detectorDt1.evaluate({
  trackId: 'TRK-A',
  lat: 34.05,
  lng: -118.25,
  altitudeMeters: 500,
  speedKnots: 600,
  headingDeg: 90,
  timestamp: new Date(t0 + 5000).toISOString()
});
assert.strictEqual(
  alertsAfterReset.filter(a => a.ruleName === 'speed_anomaly' || a.ruleName === 'SUDDEN_ACCELERATION').length,
  0,
  'First sample after reset/reconnect must never alert'
);

console.log('FIX-01 TESTS PASSED!');
