# SENTINEL Frontend Fix Log — Branch `fix/logic`

| FIX ID | Status | Files Changed | Test Name | Evidence File |
| :--- | :--- | :--- | :--- | :--- |
| FIX-01 | fixed | `src/algorithms/skywatch/anomalyDetector.ts` | `tests/fixes/fix01_acceleration.test.ts` | `docs/evidence/FIX-01.txt` |
| FIX-02 | fixed | `src/algorithms/skywatch/anomalyDetector.ts` | `tests/fixes/fix02_rearm.test.ts` | `docs/evidence/FIX-02.txt` |
| FIX-03 | fixed | `src/utils/trackClassification.ts`, `src/algorithms/skywatch/anomalyDetector.ts`, `src/selectors/alertSelectors.ts`, `src/selectors/trackSelectors.ts`, `src/components/TacticalMap.tsx`, `src/modules/skywatch/SkyWatchModule.tsx` | `tests/fixes/fix03_friendly_classification.test.ts` | `docs/evidence/FIX-03.txt` |
| FIX-04 | fixed | `src/utils/rules.ts`, `src/modules/skywatch/SkyWatchModule.tsx`, `src/dashboard/Dashboard.tsx` | `tests/fixes/fix04_rule_ids.test.ts` | `docs/evidence/FIX-04.txt` |
| FIX-05 | fixed | `src/utils/units.ts`, `src/selectors/trackSelectors.ts`, `src/modules/skywatch/SkyWatchModule.tsx`, `src/components/TacticalMap.tsx`, `src/selectors/routeSelectors.ts`, `src/modules/mediroute/MediRouteModule.tsx`, `src/services/data/fixtures.ts` | `tests/fixes/fix05_units.test.ts` | `docs/evidence/FIX-05.txt` |
| FIX-06 | fixed | `src/utils/numericSafety.ts`, `src/selectors/trackSelectors.ts`, `src/simulation/simulationEngine.ts` | `tests/fixes/fix06_numeric_safety.test.ts` | `docs/evidence/FIX-06.txt` |
| FIX-07 | already correct | `src/selectors/trackSelectors.ts` | `tests/fixes/fix07_queue_stability.test.ts` | `docs/evidence/FIX-07.txt` |
| FIX-08 | fixed | `src/simulation/simulationEngine.ts`, `src/algorithms/skywatch/anomalyDetector.ts`, `src/selectors/alertSelectors.ts` | `tests/fixes/fix08_stale_tracks.test.ts` | `docs/evidence/FIX-08.txt` |
| FIX-09 | fixed | `src/simulation/simulationEngine.ts` | `tests/fixes/fix09_time_stepping.test.ts` | `docs/evidence/FIX-09.txt` |
| FIX-10 | fixed | `src/services/coordination/meshBus.ts`, `src/services/coordination/leaderElection.ts`, `src/simulation/simulationEngine.ts` | `tests/fixes/fix10_leader_election.test.ts` | `docs/evidence/FIX-10.txt` |
| FIX-11 | fixed | `src/services/storage/indexedDb.ts` | `tests/fixes/fix11_fixture_seeding_race.test.ts` | `docs/evidence/FIX-11.txt` |
| FIX-12 | fixed | `src/services/coordination/meshBus.ts`, `src/services/sync/syncManager.ts`, `src/services/mesh/meshService.ts` | `tests/fixes/fix12_mesh_bus.test.ts` | `docs/evidence/FIX-12.txt` |
