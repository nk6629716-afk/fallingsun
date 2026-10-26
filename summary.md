# Project Summary: SENTINEL // MediRoute

## The Big Picture
In medical emergencies, every second counts. The **"Golden Hour"** is the critical 60-minute window after a severe injury where getting the patient to definitive surgical care decides whether they survive.

In chaotic environments—like natural disasters, battlefield incidents, or mass-casualty events—emergency response teams face four massive bottlenecks:
1. **Unclear Triage Priorities**: Medics have to make split-second triage decisions without enough information.
2. **Blocked Roads**: Bridges collapse, debris blocks highways, and drivers get stuck without knowing safe alternatives.
3. **Overcrowded Facilities**: Ambulances take patients to the closest hospital, only to find all trauma beds and surgery rooms full.
4. **No Cell Service**: When power or internet towers fail, cloud-only systems stop working completely.

**SENTINEL // MediRoute** is a lightweight, tactical medical command system designed to eliminate these bottlenecks. It gives field medics, dispatchers, and hospital teams a single, shared operational picture so patients get to open beds via clear roads as fast as possible.

---

## Core Capabilities

### 1. START Triage Engine (Clinical Decision Support)
- Implements the international **START** (Simple Triage and Rapid Treatment) algorithm.
- Evaluates four primary physiological checks:
  1. Can the patient walk? (Ambulatory check)
  2. Spontaneous breathing and respiratory rate (10–30 breaths/min threshold)
  3. Perfusion check (Radial pulse presence and severe bleeding control)
  4. Mental status (Ability to follow simple verbal commands)
- Instantly categorizes casualties into standard color-coded tags (**Immediate**, **Delayed**, **Minimal**, **Expectant**) with transparent rationale so surgeons know exactly what to prepare for.

### 2. Evacuation Network & Hazard Routing
- Continuously monitors major arterial roads and transit times between field nodes and hospitals.
- Detects damaged corridors (e.g., structural failure on Bridge Alpha Span).
- Automatically calculates clear detours (e.g., Highway 9 Bypass) and updates vehicle arrival times.

### 3. Live Hospital Bed & Facility Inventory
- Real-time visibility into bed capacities and operating room availability across field hospitals, aid stations, and intake points.
- Flags facilities operating at surge capacity (like Interstate Intake Charlie at 100% capacity) to prevent dangerous ambulance bottlenecks.

### 4. Ground & Air Medevac Dispatch
- Tracks ambulances and aeromedical helicopters (UH-60 Medevac).
- Monitors vital on-board capabilities (Advanced Life Support, trauma kits, oxygen, defibrillators) and assigned missions.

### 5. Mission Command Overview (COP)
- Tactical dark-mode command dashboard featuring:
  - **Bento Command Grid**: Quick-glance metric cards, casualty trends, bed dials, corridor transit times, and actionable clinical directives.
  - **Geospatial Evacuation Map**: Interactive map showing casualty locations, medical facilities, and road hazards.

### 6. Offline-First Resilience
- Built to survive complete network disconnects.
- Ground medics can log casualties and triage evaluations completely offline using browser-based IndexedDB storage.
- Automatically syncs and reconciles all records the second a network link is detected.

---

## Technical Highlights
- **100% Web Standards**: Built with React 18 and TypeScript with zero unnecessary external bloatware.
- **Fast Production Footprint**: Bundled with Vite for instant loading and responsive performance.
- **Bespoke Tactical UI**: Handcrafted CSS design system inspired by aerospace and defense command centers (olive green `#617325`, sage `#738a65`, charcoal `#121614`).
- **Thoroughly Tested**: 122 automated behavioral and contract tests validating algorithm correctness, deterministic simulation, and offline state handling.

---

## Bottom Line
MediRoute takes the guesswork out of field triage and evacuation logistics. It gives first responders and medical commanders the clarity they need to save lives when conditions are at their worst.
