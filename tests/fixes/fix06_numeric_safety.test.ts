import assert from 'node:assert';
import {
  normalizeHeading,
  clampSpeed,
  clampAltitude,
  clampThreatScore,
  safeDivide,
  sanitizeTrack,
} from '../../src/utils/numericSafety';
import { TelemetryTrack } from '../../shared/types';
import { calculateTrackThreatScore } from '../../src/selectors/trackSelectors';

console.log('--- TEST FIX-06: Numeric safety and sanitization ---');

// 1. Heading normalization test
assert.strictEqual(normalizeHeading(-10), 350, 'Heading -10 must normalize to 350');
assert.strictEqual(normalizeHeading(0), 0);
assert.strictEqual(normalizeHeading(360), 0);
assert.strictEqual(normalizeHeading(370), 10);
assert.strictEqual(normalizeHeading(-370), 350);

// 2. Clamping tests
assert.strictEqual(clampSpeed(-15), 0, 'Speed cannot be negative');
assert.strictEqual(clampSpeed(45.5), 45.5);
assert.strictEqual(clampAltitude(-50), 0, 'Altitude cannot be negative');
assert.strictEqual(clampAltitude(500), 500);

// 3. Threat score integer clamping 0..100
assert.strictEqual(clampThreatScore(150.2), 100);
assert.strictEqual(clampThreatScore(-25.4), 0);
assert.strictEqual(clampThreatScore(74.6), 75);
assert.strictEqual(Number.isInteger(clampThreatScore(42.3)), true);

// 4. Safe division
assert.strictEqual(safeDivide(10, 0), 0);
assert.strictEqual(safeDivide(10, NaN), 0);
assert.strictEqual(safeDivide(Infinity, 5), 0);

// 5. 10,000 random and extreme inputs produce no NaN/Infinity anywhere in track state
const extremeValues = [
  NaN,
  Infinity,
  -Infinity,
  0,
  -0,
  -1e15,
  1e15,
  -360,
  720,
  -0.000000001,
  1e-300,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
];

const lastValidTrack: TelemetryTrack = {
  id: 'TRK-TEST',
  callsign: 'ALPHA-1',
  lat: 34.05,
  lng: -118.25,
  altitude: 500,
  speed: 60,
  heading: 90,
  threatScore: 25,
  timestamp: new Date().toISOString(),
  flightHistory: [],
  isSimulated: true,
  status: 'tracking',
};

for (let i = 0; i < 10000; i++) {
  const pickVal = () => {
    if (i < extremeValues.length) return extremeValues[i];
    const r = Math.random();
    if (r < 0.2) return extremeValues[Math.floor(Math.random() * extremeValues.length)];
    return (Math.random() - 0.5) * 100000;
  };

  const testTrack: TelemetryTrack = {
    ...lastValidTrack,
    lat: pickVal(),
    lng: pickVal(),
    altitude: pickVal(),
    speed: pickVal(),
    heading: pickVal(),
    threatScore: pickVal(),
  };

  const sanitized = sanitizeTrack(testTrack, lastValidTrack);

  // Assert no NaN or Infinity in sanitized track state
  assert.strictEqual(isNaN(sanitized.lat), false, `lat is NaN at iter ${i}`);
  assert.strictEqual(isFinite(sanitized.lat), true, `lat is not finite at iter ${i}`);
  assert.strictEqual(isNaN(sanitized.lng), false, `lng is NaN at iter ${i}`);
  assert.strictEqual(isFinite(sanitized.lng), true, `lng is not finite at iter ${i}`);
  assert.strictEqual(isNaN(sanitized.altitude), false, `altitude is NaN at iter ${i}`);
  assert.strictEqual(isFinite(sanitized.altitude), true, `altitude is not finite at iter ${i}`);
  assert.strictEqual(sanitized.altitude >= 0, true, `altitude < 0 at iter ${i}`);
  assert.strictEqual(isNaN(sanitized.speed), false, `speed is NaN at iter ${i}`);
  assert.strictEqual(isFinite(sanitized.speed), true, `speed is not finite at iter ${i}`);
  assert.strictEqual(sanitized.speed >= 0, true, `speed < 0 at iter ${i}`);
  assert.strictEqual(isNaN(sanitized.heading), false, `heading is NaN at iter ${i}`);
  assert.strictEqual(isFinite(sanitized.heading), true, `heading is not finite at iter ${i}`);
  assert.strictEqual(sanitized.heading >= 0 && sanitized.heading < 360, true, `heading outside [0, 360) at iter ${i}`);

  if (sanitized.threatScore !== undefined) {
    assert.strictEqual(isNaN(sanitized.threatScore), false, `threatScore is NaN at iter ${i}`);
    assert.strictEqual(isFinite(sanitized.threatScore), true, `threatScore is not finite at iter ${i}`);
    assert.strictEqual(Number.isInteger(sanitized.threatScore), true, `threatScore not integer at iter ${i}`);
    assert.strictEqual(sanitized.threatScore >= 0 && sanitized.threatScore <= 100, true, `threatScore outside 0..100 at iter ${i}`);
  }

  // Also test threat score calculation doesn't throw or output NaN
  const threatResult = calculateTrackThreatScore(sanitized);
  assert.strictEqual(isNaN(threatResult.score), false);
  assert.strictEqual(isFinite(threatResult.score), true);
  assert.strictEqual(Number.isInteger(threatResult.score), true);
  assert.strictEqual(threatResult.score >= 0 && threatResult.score <= 100, true);
}

console.log('FIX-06 10,000 TEST CASES PASSED!');
