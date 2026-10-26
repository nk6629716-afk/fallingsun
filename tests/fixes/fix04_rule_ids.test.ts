import assert from 'node:assert';
import {
  CanonicalRuleId,
  RULE_ID_LABELS,
  normalizeRuleId,
  formatRuleLabel
} from '../../src/utils/rules';

console.log('--- TEST FIX-04: Canonical Rule IDs and human labels ---');

// 1. Verify Enum and Labels exist
assert.strictEqual(CanonicalRuleId.SUDDEN_ACCELERATION, 'SUDDEN_ACCELERATION');
assert.strictEqual(CanonicalRuleId.ZONE_INCURSION, 'ZONE_INCURSION');
assert.strictEqual(CanonicalRuleId.ROUTE_DEVIATION, 'ROUTE_DEVIATION');
assert.strictEqual(CanonicalRuleId.STALE_TELEMETRY, 'STALE_TELEMETRY');
assert.strictEqual(CanonicalRuleId.UNUSUAL_ALTITUDE_DROP, 'UNUSUAL_ALTITUDE_DROP');

// 2. Verify legacy mappings resolve to canonical ID
assert.strictEqual(normalizeRuleId('RAPID_ACCELERATION_SPIKE'), CanonicalRuleId.SUDDEN_ACCELERATION);
assert.strictEqual(normalizeRuleId('speed_anomaly'), CanonicalRuleId.SUDDEN_ACCELERATION);
assert.strictEqual(normalizeRuleId('NO_FLY_ZONE_INCURSION'), CanonicalRuleId.ZONE_INCURSION);
assert.strictEqual(normalizeRuleId('restricted_zone_entry'), CanonicalRuleId.ZONE_INCURSION);
assert.strictEqual(normalizeRuleId('FLIGHT_PATH_DEVIATION'), CanonicalRuleId.ROUTE_DEVIATION);
assert.strictEqual(normalizeRuleId('STALE_TELEMETRY_SIGNAL'), CanonicalRuleId.STALE_TELEMETRY);

// 3. Test: render every alert type and assert no string matching /^[A-Z_]{6,}$/ appears in human text
const allRawRules = [
  'SUDDEN_ACCELERATION',
  'RAPID_ACCELERATION_SPIKE',
  'speed_anomaly',
  'ZONE_INCURSION',
  'NO_FLY_ZONE_INCURSION',
  'restricted_zone_entry',
  'ROUTE_DEVIATION',
  'FLIGHT_PATH_DEVIATION',
  'STALE_TELEMETRY',
  'STALE_TELEMETRY_SIGNAL',
  'stale_telemetry',
  'UNUSUAL_ALTITUDE_DROP'
];

const rawIdRegex = /^[A-Z_]{6,}$/;

for (const raw of allRawRules) {
  const label = formatRuleLabel(raw);
  assert.strictEqual(
    typeof label,
    'string',
    `formatRuleLabel("${raw}") must return a string`
  );
  assert.strictEqual(
    rawIdRegex.test(label),
    false,
    `Human label "${label}" for rule "${raw}" must not be a raw UPPERCASE_ID`
  );
  assert.strictEqual(
    label.length > 3,
    true,
    `Human label "${label}" must be descriptive`
  );
}

console.log('FIX-04 TESTS PASSED!');
