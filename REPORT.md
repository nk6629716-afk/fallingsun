# SENTINEL Project Report & System Architecture Ledger
*Automated Operational & Technical Dossier — Generated 2026-10-26T10:48:22.050Z*

---

## 1. Executive Summary

**Project:** SENTINEL — Falling Sun Tactical Disaster Response & Common Operational Picture (COP)  
**Classification:** Distributed Tactical Command & Control System  
**Architecture:** Single Page Application (Vite + React 18 TypeScript) + Modular REST/SSE Express Backend + IndexedDB Offline Storage + Decentralized BroadcastChannel Mesh Relay.

The platform provides resilient disaster-zone situational awareness for military, humanitarian, and emergency-relief field units during blackouts, kinetic airspace incursions, and communications infrastructure degradation.

---

## 2. Git Telemetry & Repository State

| Metric | Active Repository Value |
| :--- | :--- |
| **Active Branch** | `main` |
| **Commit SHA** | `2cddbddc3be211eedb0da914d7011e85ac043eba` (`2cddbdd`) |
| **Last Commit Date** | `2026-10-26 16:17:54 +0530` |
| **Author** | `Vineet <vineet00955@gmail.com>` |
| **Remote URL** | `https://github.com/nk6629716-afk/fallingsun` |
| **Working Tree Status** | `Clean working directory (all files committed)` |
| **Latest Message** | `feat(navigation): remove GeoIntel and SkyWatch pages from website navigation and shell` |

---

## 3. Automated Test Verification & Quality Gates

The test suite evaluates mission-critical algorithmic behaviors, safety-critical triage, routing detours, idempotent sync contracts, and seeded determinism.

| Suite | Status | Metrics / Outcome |
| :--- | :---: | :--- |
| **Frontend Behavioral & Contract Suite** | **PASSED** | **122 / 122 tests passed (100%)** |
| **MediRoute START Triage Rules** | **PASSED** | 6/6 tests (Respiratory > 30, Absent Pulse, Unresponsive Mental Status, Walking Wounded) |
| **Dijkstra Hazard-Aware Routing** | **PASSED** | 5/5 tests (Open highway 5.5 km, blocked bridge detour 6.6 km, all-blocked failure mode) |
| **FieldLink Idempotent Sync Contract** | **PASSED** | 3/3 tests (Duplicate clientId detection, already_received resolution, retry queue) |
| **TacticalMap Projections & Modes** | **PASSED** | 9/9 tests (WGS84 lat/lng to SVG matrix projection, 0.4x - 4.5x zoom clamp, Topo/PPI/FLIR modes) |
| **SkyWatch Multi-Rule Threat Engine** | **PASSED** | 5/5 tests (Speed anomaly, altitude corridor breach, geofence incursion, threat score 92) |
| **GeoIntel BFS Pixel Cluster Diff** | **PASSED** | 2/2 tests (Matrix identity check & 4-pixel anomaly flood-fill clustering) |
| **UI Theme & Mission Step Sequencer** | **PASSED** | 10/10 tests (5-step cycling, light/dark/system theme overrides, 240px / 76px sidebar specs) |
| **Deep Link URL Hash Navigation** | **PASSED** | 14/14 tests (#fieldlink, #skywatch, case-insensitivity, back/forward history, invalid hash normalization) |
| **Phase 1 Seeded Simulation Engine** | **PASSED** | **100% IDENTICAL 60-TICK OUTPUT ACROSS DUAL INDEPENDENT ENGINES** |

---

## 4. System Subsystems Architecture

### 4.1 Common Operational Picture & Command Header
- **CommandHeader (`src/app/CommandHeader.tsx`):**
  - **Live IST / UTC Synchronized Clock:** Updates continuously with zero layout shift.
  - **3-Way Theme Switcher:** Light, Auto (System OS-aware), Dark mode with persistent CSS variables (`var(--color-paper)`, `var(--color-sheet)`, `var(--color-edge)`, etc.).
  - **Live SSE Status Indicator:** Real-time visual pill indicating `LIVE SSE` (green), `RECONNECT` (amber), or `OFFLINE` (red).
  - **Simulation Speed & Pause Controls:** Interactive `1x`, `2x`, `5x` speed selector with pause/play toggle.
  - **Offline Tactical Air-Gap Toggle:** Simulates communications blackout without terminating local state.

### 4.2 Tactical Vector Map (`src/components/TacticalMap.tsx`)
- **Tri-Mode Radar & Topo Rendering:**
  - **Chart Mode (`topo`):** Day/Night topo cartography with contour lines, rivers, forests, and tactical grid lettering (A–E, 31–37).
  - **Radar Scope (`ppi`):** Circular radar aperture with animated sweep line, 360° azimuth degree ticks, and 4 concentric range rings (5, 10, 15, 20 km).
  - **Thermal FLIR Mode (`flir`):** Heat-signature color mapping for night operations.
- **Dynamic Entity Layer:**
  - Real-time telemetry aircraft tracks with heading orientation vectors.
  - Restricted airspace zones with color-coded warning circles.
  - Shared tactical mesh markers (Rally Points, Contact Reports, Hazards) from FieldLink.
  - Pan and zoom navigation with clamped limits (0.4x to 4.5x) and mobile touch panning.

### 4.3 SkyWatch Airspace Surveillance (`src/modules/skywatch/SkyWatchModule.tsx`)
- **Threat Scoring Algorithm:** Computes composite threat score (0–100) evaluated across three concurrent breach criteria:
  1. `speed_anomaly`: Velocity delta exceeding 105 kts.
  2. `altitude_corridor_breach`: Operating outside designated transit corridor.
  3. `geofence_incursion`: Penetration of restricted sector R-2.
- **Real-time Queue & Drawer:** Sorts contacts by risk; includes one-click alert acknowledgement logging.

### 4.4 FieldLink Offline Ground Reports (`src/modules/fieldlink/FieldLinkModule.tsx`)
- **Offline Intake Form:** Submits incident reports directly to local IndexedDB store when disconnected.
- **Outbox Reconciliation:** Displays pending, failed, and synced records with manual retry and batch sync.
- **Team Communications:** Tactical mesh channel with per-node link quality adjustment sliders (Alpha, Bravo, Command).

### 4.5 MediRoute Triage & Logistics (`src/modules/mediroute/MediRouteModule.tsx`)
- **Simple Triage and Rapid Treatment (START):** Algorithmic categorization into `IMMEDIATE` (Red), `DELAYED` (Yellow), `MINIMAL` (Green), and `EXPECTANT` (Black).
- **Hazard-Aware Dijkstra Router:** Computes shortest safe route between disaster sectors, diverting around blocked bridges and active hazard edges.

### 4.6 GeoIntel Satellite Reconnaissance (`src/modules/geointel/GeoIntelModule.tsx`)
- Multi-temporal split-view slider comparing baseline reference passes against current surveillance passes.
- 2D BFS flood-fill anomaly clustering with bounding box georeferencing (MGRS).

### 4.7 Deterministic Seeded Simulation Engine (`src/simulation/simulationEngine.ts`)
- Built upon Lehmer / Mulberry32 PRNG (`seededRNG.ts`) guaranteeing **identical multi-minute trajectories** across clients with the same seed (default `4242`).
- 1Hz simulation clock drives kinematics, casualty vitals fluctuations, and road hazard schedules.

### 4.8 Decentralized Tactical Mesh Relay (`src/services/mesh/meshService.ts`)
- Inter-tab synchronization using browser `BroadcastChannel('sentinel_tactical_mesh')`.
- Store-and-forward message relaying with hop path tracking and packet loss simulation.
- Shared tactical markers and Last-Writer-Wins (LWW) conflict resolution.

---

## 5. API Endpoint Specifications

| Method | Endpoint | Description | Storage Contract |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | System health & storage mode reporting | Returns `storageMode: 'file'` or `'memory'` |
| `GET` | `/api/summary` | Dashboard COP aggregated statistics | In-memory + disk cache |
| `GET` | `/api/telemetry` | Active airborne tracks & trajectories | Real-time simulation bus |
| `GET` | `/api/telemetry/stream` | Server-Sent Events (SSE) live push stream | Continuous event broadcast |
| `POST` | `/api/telemetry/pause` | Pause server-side simulation clock | Mutates simulation runner |
| `POST` | `/api/telemetry/resume` | Resume server-side simulation clock | Mutates simulation runner |
| `GET` | `/api/incidents` | Ground incident reports | Disk JSON store (`sentinel_store.json`) |
| `POST` | `/api/incidents` | Submit single incident report | Validates 13 incident types |
| `POST` | `/api/sync` | Canonical batch sync outbox | Idempotent clientId deduplication |
| `GET` | `/api/patients` | Casualty records with START triage vitals | Triage records store |
| `GET` | `/api/hazards` | Road obstacles, debris & bridge statuses | Hazard edge graph |
| `POST` | `/api/reset` | Re-seeds baseline scenario fixtures | Resets to deterministic seed 4242 |

---

## 6. Continuous Update Workflow (Hooks & Scripts)

This report is configured to update **automatically after every Git operation**:

1. **On Pull / Merge (`git pull`):**
   - Git executes `.git/hooks/post-merge`.
   - The hook invokes `node scripts/generate-report.js`.
   - `REPORT.md` is regenerated with the latest upstream commit SHA, author, and test outcomes.

2. **On Push (`git push`):**
   - Git executes `.git/hooks/pre-push`.
   - The hook verifies all tests, regenerates `REPORT.md`, and stages it so your remote repository always receives the current ledger.

3. **Manual CLI Update:**
   - Execute at any time:
     ```bash
     npm run report:update
     ```

---

*SENTINEL Mission Assurance — Verified Deterministic Operation & Automated Documentation Active.*
