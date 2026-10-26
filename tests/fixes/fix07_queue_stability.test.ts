import assert from 'node:assert';
import { selectRankedThreatQueue } from '../../src/selectors/trackSelectors';
import { TelemetryTrack } from '../../shared/types';

console.log('--- TEST FIX-07: Threat queue stability on equal scores ---');

// Create two tracks with equal scores
const trackA: TelemetryTrack = {
  id: 'TRK-ALPHA-01',
  callsign: 'ALPHA-01',
  lat: 34.05,
  lng: -118.25,
  altitude: 350,
  speed: 50,
  heading: 90,
  timestamp: new Date().toISOString(),
  flightHistory: [],
  isSimulated: true,
  status: 'tracking',
};

const trackB: TelemetryTrack = {
  id: 'TRK-BETA-02',
  callsign: 'BETA-02',
  lat: 34.05,
  lng: -118.25,
  altitude: 350,
  speed: 50,
  heading: 90,
  timestamp: new Date().toISOString(),
  flightHistory: [],
  isSimulated: true,
  status: 'tracking',
};

// Across 100 simulation ticks, shuffle input array order and ensure output order is completely stable (score desc, id asc)
for (let tick = 1; tick <= 100; tick++) {
  const tA = { ...trackA, timestamp: new Date(Date.now() + tick * 1000).toISOString() };
  const tB = { ...trackB, timestamp: new Date(Date.now() + tick * 1000).toISOString() };

  // Alternate input order between [A, B] and [B, A]
  const inputTracks = tick % 2 === 0 ? [tA, tB] : [tB, tA];
  const ranked = selectRankedThreatQueue(inputTracks, [], []);

  assert.strictEqual(ranked.length, 2, `Expected 2 ranked tracks at tick ${tick}`);
  assert.strictEqual(ranked[0].score, ranked[1].score, `Scores must be equal at tick ${tick}`);

  // id ascending: TRK-ALPHA-01 comes before TRK-BETA-02
  assert.strictEqual(
    ranked[0].id,
    'TRK-ALPHA-01',
    `Order flickered at tick ${tick}: expected TRK-ALPHA-01 first but got ${ranked[0].id}`
  );
  assert.strictEqual(
    ranked[1].id,
    'TRK-BETA-02',
    `Order flickered at tick ${tick}: expected TRK-BETA-02 second but got ${ranked[1].id}`
  );
}

console.log('FIX-07 100 TICKS PASSED STABLY!');
