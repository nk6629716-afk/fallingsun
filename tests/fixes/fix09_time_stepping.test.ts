import assert from 'node:assert';
import { SimulationEngine } from '../../src/simulation/simulationEngine';

console.log('--- TEST FIX-09: Simulation time stepping & accumulator ---');

// Mock time parameter
let mockedNow = 1000;

const engine = new SimulationEngine();
engine.reset();
const initialTick = engine.getState().tick || 0;

// 1. Normal single-step advance at speed 1
engine.start(mockedNow);
mockedNow += 1000; // 1 second elapsed
let stepsRun = engine.onTimerTick(mockedNow);
assert.strictEqual(stepsRun, 1, '1 second elapsed at speed 1 must advance 1 step');
assert.strictEqual(engine.getState().tick, initialTick + 1);

// 2. Hidden-tab throttling test: 60-second gap
mockedNow += 60000; // 60 seconds elapsed in hidden tab
stepsRun = engine.onTimerTick(mockedNow);
assert.strictEqual(stepsRun, 5, '60-second gap must be capped at exactly 5 steps (catch-up)');
assert.strictEqual(engine.getState().tick, initialTick + 6);

// Remainder was dropped: subsequent 1 second must only advance 1 step
mockedNow += 1000;
stepsRun = engine.onTimerTick(mockedNow);
assert.strictEqual(stepsRun, 1, 'Remainder must have been dropped so next 1s advances only 1 step');
assert.strictEqual(engine.getState().tick, initialTick + 7);

// 3. Pause freezes elapsed simulation time
engine.pause();
const tickAtPause = engine.getState().tick;

// 30 seconds pass during pause
mockedNow += 30000;
stepsRun = engine.onTimerTick(mockedNow);
assert.strictEqual(stepsRun, 0, 'No steps should run while paused');
assert.strictEqual(engine.getState().tick, tickAtPause, 'Tick must not advance while paused');

// Resume after pause
engine.resume(mockedNow);
// 1 second passes after resume
mockedNow += 1000;
stepsRun = engine.onTimerTick(mockedNow);
assert.strictEqual(stepsRun, 1, 'Resume must not catch up pause time: only 1 step for the 1s after resume');
assert.strictEqual(engine.getState().tick, tickAtPause + 1);

// 4. Internal speed parameter scales dt only, never thresholds
engine.setSpeed(2 as any);
assert.strictEqual(engine.getSpeed(), 2);
mockedNow += 1000; // 1 real second at speed 2 = 2 simulated seconds = 2 steps
stepsRun = engine.onTimerTick(mockedNow);
assert.strictEqual(stepsRun, 2, '1 real second at speed 2 must advance 2 steps');

engine.stop();
console.log('FIX-09 TIME STEPPING TESTS PASSED!');
