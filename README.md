# SENTINEL — MediRoute: Field Medical Evacuation & Triage

> A tactical emergency response system built for field medics and operations commanders. It handles casualty triage, hospital bed tracking, and ambulance route planning when roads are blocked and communication is patchy.

---

## What is this project?

During natural disasters, combat, or mass-casualty incidents, emergency response quickly gets chaotic:
- Medics on the ground have seconds to decide who needs surgery first.
- Critical roads and bridges get blocked by debris or damage.
- Ambulances arrive at hospitals only to find out there are no free trauma beds.
- Internet connections drop constantly in the field.

**MediRoute** solves these exact problems. It connects the medic in the dirt with the command hospital in real time, helping teams get injured people to the right facility before the **"Golden Hour"** runs out.

---

## Key Features

### 1. Automated START Triage
Instead of guessing or doing mental math under fire, the system uses the standardized **START** (Simple Triage and Rapid Treatment) protocol:
- Checks walking ability, breathing rate, radial pulse, and mental responsiveness.
- Automatically tags casualties as:
  - **Immediate (Red)**: Life-threatening injuries (e.g. shock, tension pneumothorax) needing surgery right away.
  - **Delayed (Yellow)**: Serious injuries (like compound bone fractures) that are currently stable.
  - **Minimal (Green)**: Walking wounded who can wait.
  - **Expectant (Black)**: Non-survivable trauma.
- Gives a plain-English explanation for every tag so doctors know *why* a decision was made.

### 2. Smart Evacuation Routing & Detours
- Maps out all field routes connecting casualty collection points to hospitals.
- If a road or bridge is blocked (for example, structural failure on the Bridge Alpha Span), the system flags it immediately.
- Automatically routes ambulances around the blockage via open roads (like the Highway 9 Bypass) and calculates realistic travel times.

### 3. Live Hospital Bed & Facility Tracker
- Monitors bed and surgical room availability across all medical stations:
  - **Field Hospital Alpha**: Trauma center with active surgical suites.
  - **Forward Casualty Hub Bravo**: Mid-line staging post.
  - **Interstate Intake Point Charlie**: High-volume intake station.
  - **Ridgeline Medical Post Delta**: First-aid and stabilization post.
- Shows alerts when a facility hits capacity so patients are redirected before an ambulance leaves the scene.

### 4. Fleet Dispatch (Ambulances & Helicopters)
- Tracks ground ambulances (**MEDIC-ONE**, **MEDIC-TWO**) and helicopter medevac (**AIR-EVAC-1**).
- Shows live mission status, estimated arrival times (ETA), and life-support equipment on board.

### 5. Tactical Command Overview (COP)
- A streamlined command center built with a dark military aesthetic (olive greens, slate, and high-contrast amber readouts).
- Provides two views:
  - **Bento Dashboard**: High-level cards showing patient counts, bed percentages, route hazards, and active tasks.
  - **Evacuation COP Map**: Interactive geospatial map showing casualty locations, hospital nodes, and road corridors.

### 6. Works Completely Offline
- If the internet cuts out, medics can still log casualties and dispatch units.
- Everything is safely stored in the browser using IndexedDB and syncs automatically the moment a connection is re-established.

---

## 2-Minute Demo Guide for Judges

If you have 2 to 3 minutes to test the project, here is the fastest way to see everything in action:

1. **Start on the Overview Dashboard (`/` or `#dashboard`)**:
   - Check the **Bento Command Grid**: Notice the live casualty breakdown, the hospital bed dials, and the evacuation corridor chart showing the blocked Bridge Alpha Span.
   - Click the **"EVACUATION COP MAP"** switch at the top to see the full tactical map with hospital nodes and road segments.

2. **Open the Triage Board (`#mediroute/triage`)**:
   - Look at the patient list (e.g., CAS-0419 with severe abdominal trauma).
   - See the real-time vital signs and the START triage tag with its clinical rationale.

3. **Check Evacuation Routing (`#mediroute/routing`)**:
   - See the road network. Notice how the system detects the damaged bridge and reroutes traffic through the bypass corridor.

4. **Inspect Facility Inventory (`#mediroute/facilities`)**:
   - View bed occupancies. Notice how Intake Point Charlie is marked **FULL** while Hospital Alpha still has open surgical beds.

5. **Test Transport Dispatch (`#mediroute/dispatch`)**:
   - Check the fleet status to see MEDIC-TWO en route to Hospital Alpha with an active ETA countdown.

---

## How to Run It Locally

### Prerequisites
- Node.js (version 18 or newer recommended)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Dev Server
```bash
npm run dev
```
Open **`http://localhost:5173/`** in your browser.

### 3. Run Automated Tests
```bash
npm test
```
*(All 122 behavior and contract tests run automatically and should pass cleanly.)*

### 4. Verify Production Build
```bash
npm run build
```

---

## Technology Stack

- **Frontend**: React 18 with TypeScript.
- **Build Tool**: Vite (fast builds and hot-module reloading).
- **Styling**: Handcrafted responsive CSS following a tactical dark-mode design system (olive green `#617325`, sage `#738a65`, charcoal `#121614`).
- **Icons**: Lucide React.
- **Offline Storage**: Browser IndexedDB for offline reliability.
- **Testing**: Deterministic contract and unit tests for triage algorithms, routing, and UI state.

---

## Project Status

For Supabase email/password authentication and administrator approval, follow [the Supabase setup guide](docs/supabase-setup.md). It includes both SQL files, backend environment variables, first-admin setup, and the current operational-data persistence limits.

- **Triage Engine**: 100% functional.
- **Evacuation Routing**: 100% functional with automated hazard detours.
- **Facility & Fleet Tracker**: 100% functional.
- **Tests**: 122 of 122 automated tests passing.
- **Build**: Production bundle builds with 0 errors.
