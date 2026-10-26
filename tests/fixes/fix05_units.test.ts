import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  toKmh,
  toKnots,
  formatSpeed,
  formatAltitude,
  formatDistance,
  formatDuration
} from '../../src/utils/units';
import { TelemetryTrack } from '../../shared/types';
import { calculateTrackThreatScore } from '../../src/selectors/trackSelectors';

console.log('--- TEST FIX-05: Unit utilities and string formatting safety ---');

// 1. Verify conversions
assert.strictEqual(toKmh(10), 36);
assert.strictEqual(Math.round(toKnots(10)), 19);

// 2. formatDuration requirements:
assert.strictEqual(formatDuration(12), '12 min');
assert.strictEqual(formatDuration(60), '1 h');
assert.strictEqual(formatDuration(75), '1 h 15 min');

// 3. formatAltitude & formatDistance requirements:
assert.strictEqual(formatAltitude(450), '450 m');
assert.strictEqual(formatDistance(500), '500 m');
assert.strictEqual(formatDistance(1500), '1.5 km');
assert.strictEqual(formatDistance(2000), '2.0 km');

// 4. Alert text and track label show the same speed for the same track
const track: TelemetryTrack = {
  id: 'TRK-SPEED-1',
  callsign: 'VIPER-01',
  lat: 34.05,
  lng: -118.25,
  altitude: 350,
  speed: 85,
  heading: 90,
  timestamp: new Date().toISOString(),
  flightHistory: [],
  isSimulated: true,
  status: 'hostile'
};

const labelSpeed = formatSpeed(track.speed);
const threatEval = calculateTrackThreatScore(track);
assert.strictEqual(threatEval.reason.includes(labelSpeed), true, 'Track label and threat eval must display the exact same speed string');

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../../src');

function checkDir(dir: string): string[] {
  const violations: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') {
        violations.push(...checkDir(fullPath));
      }
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !fullPath.endsWith('units.ts') &&
      !fullPath.includes('geointel') // HARD EXCLUSION: GeoIntel untouched
    ) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, lineIdx) => {
        // Exclude comments, CSS classes/styles, and min-height/min-width properties
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        if (line.includes('minWidth') || line.includes('minHeight') || line.includes('min-width') || line.includes('min-height') || line.includes('minmax') || line.includes('minimal')) return;
        if (line.includes('minRegionSize') || line.includes('minArea')) return;

        // Check for literal "km/h" or " min" string concatenation in ts/tsx code
        if (line.includes("km/h'") || line.includes('km/h"') || line.includes('km/h`') || line.includes(' km/h')) {
          violations.push(`${fullPath}:${lineIdx + 1} -> ${line.trim()}`);
        }
        if (line.includes(" min'") || line.includes(' min"') || line.includes(' min`')) {
          violations.push(`${fullPath}:${lineIdx + 1} -> ${line.trim()}`);
        }
      });
    }
  }
  return violations;
}

const violations = checkDir(srcDir);
assert.strictEqual(
  violations.length,
  0,
  `Found unit literals outside units.ts:\n${violations.join('\n')}`
);

console.log('FIX-05 TESTS PASSED!');
