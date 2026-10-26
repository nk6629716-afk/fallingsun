import assert from 'node:assert';
import { HybridLogicalClock, SharedRecord } from '../../src/utils/hlc';

console.log('--- TEST FIX-14: HLC versioning and concurrent edit/delete tombstone convergence ---');

const hlcA = new HybridLogicalClock('tab-A');
const hlcB = new HybridLogicalClock('tab-B');

// Initial marker
const initialMarker: SharedRecord = {
  id: 'MARKER-1',
  title: 'Initial Checkpoint',
  version: hlcA.now(),
};

// Scenario 1: Tab A edits marker, Tab B deletes marker concurrently
// Tab A's edit version
const vEdit = hlcA.now();
const editedMarker: SharedRecord = {
  id: 'MARKER-1',
  title: 'Updated Checkpoint by Tab A',
  version: vEdit,
};

// Tab B's concurrent delete (tombstone) with slightly higher HLC
// (or Tab B receives notification and deletes with newer clock)
const vDelete = hlcB.update(vEdit);
const deleteTombstone: SharedRecord = {
  id: 'MARKER-1',
  isDeleted: true,
  deletedAt: new Date().toISOString(),
  version: vDelete,
};

// Reconcile on Tab A:
const tabAState = HybridLogicalClock.reconcile(editedMarker, deleteTombstone);
// Reconcile on Tab B:
const tabBState = HybridLogicalClock.reconcile(deleteTombstone, editedMarker);

// Both tabs must converge to the higher HLC version (delete tombstone)
assert.strictEqual(tabAState?.isDeleted, true, 'Tab A must converge to tombstone');
assert.strictEqual(tabBState?.isDeleted, true, 'Tab B must converge to tombstone');
assert.strictEqual(tabAState?.version?.hlc, tabBState?.version?.hlc, 'HLC versions must be identical');

// Scenario 2: Later edit with higher HLC resurrects / overrides earlier tombstone
const vLaterEdit = hlcA.update(vDelete);
const resurrectedMarker: SharedRecord = {
  id: 'MARKER-1',
  title: 'Resurrected Marker',
  isDeleted: false,
  version: vLaterEdit,
};

const tabAAfterResurrect = HybridLogicalClock.reconcile(tabAState, resurrectedMarker);
const tabBAfterResurrect = HybridLogicalClock.reconcile(tabBState, resurrectedMarker);

assert.strictEqual(tabAAfterResurrect?.isDeleted, false);
assert.strictEqual(tabAAfterResurrect?.title, 'Resurrected Marker');
assert.strictEqual(tabBAfterResurrect?.isDeleted, false);
assert.strictEqual(tabBAfterResurrect?.title, 'Resurrected Marker');

// Scenario 3: Tombstone older than 24 hours expires
const expiredTombstone: SharedRecord = {
  id: 'MARKER-EXPIRED',
  isDeleted: true,
  deletedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  version: { hlc: '1000.0', tab: 'tab-A' },
};

const purged = HybridLogicalClock.reconcile(undefined, expiredTombstone);
assert.strictEqual(purged, undefined, 'Expired tombstone (> 24 hours) must be pruned');

console.log('FIX-14 HLC CONCURRENCY TESTS PASSED!');
