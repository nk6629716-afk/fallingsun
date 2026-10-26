-- ============================================================================
-- SENTINEL: Integrated Situational Awareness & Emergency Response Platform
-- Supabase PostgreSQL Schema & Deterministic Baseline Seed
-- Target Instance: https://cajrbzfsfsimxweomrlt.supabase.co
--
-- Instructions:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/cajrbzfsfsimxweomrlt
-- 2. Go to the "SQL Editor" tab on the left sidebar.
-- 3. Click "New Query", paste this entire script, and click "Run".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables Creation
-- ----------------------------------------------------------------------------

-- A. Incidents Table (FieldLink & Shared Feed)
CREATE TABLE IF NOT EXISTS public.sentinel_incidents (
    id TEXT PRIMARY KEY,
    client_id TEXT UNIQUE,
    source_module TEXT NOT NULL,
    type TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    title TEXT NOT NULL,
    notes TEXT,
    location JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ,
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE
);

-- B. Telemetry Tracks Table (SkyWatch Counter-Drone Radar)
CREATE TABLE IF NOT EXISTS public.sentinel_tracks (
    id TEXT PRIMARY KEY,
    callsign TEXT NOT NULL,
    type TEXT NOT NULL,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    altitude NUMERIC NOT NULL,
    speed NUMERIC NOT NULL,
    heading NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'tracking',
    flight_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE
);

-- C. Airspace Alerts Table (SkyWatch Anomaly Detections)
CREATE TABLE IF NOT EXISTS public.sentinel_alerts (
    id TEXT PRIMARY KEY,
    track_id TEXT REFERENCES public.sentinel_tracks(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    recommendation TEXT,
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE
);

-- D. GeoIntel Observations Table (Change Detection & Satellite Imagery)
CREATE TABLE IF NOT EXISTS public.sentinel_observations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    coordinates JSONB NOT NULL,
    capture_date_before TEXT NOT NULL,
    capture_date_after TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending',
    candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    analyst_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE
);

-- E. MediRoute Patients Table (Casualty Intake & START Triage)
CREATE TABLE IF NOT EXISTS public.sentinel_patients (
    id TEXT PRIMARY KEY,
    patient_code TEXT NOT NULL,
    location JSONB NOT NULL,
    vitals JSONB NOT NULL,
    triage_category TEXT NOT NULL,
    triage_reason TEXT,
    rule_version TEXT NOT NULL DEFAULT 'START_TACTICAL_DEMO_v1.0',
    status TEXT NOT NULL DEFAULT 'assessed',
    assigned_hospital_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE
);

-- F. MediRoute Road Hazards Table (Dijkstra Routing Graph Edges)
CREATE TABLE IF NOT EXISTS public.sentinel_hazards (
    id TEXT PRIMARY KEY,
    edge_id TEXT NOT NULL,
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    hazard_type TEXT NOT NULL DEFAULT 'road_blocked',
    blocked BOOLEAN NOT NULL DEFAULT FALSE,
    reported_by TEXT DEFAULT 'Field Unit',
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE
);

-- G. Idempotent Offline Sync Registry Table (FieldLink Duplicate Prevention)
CREATE TABLE IF NOT EXISTS public.sentinel_sync_registry (
    client_id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- H. Soldier Vitals Table (Operational Medical Monitoring)
CREATE TABLE IF NOT EXISTS public.sentinel_soldier_vitals (
    id TEXT PRIMARY KEY,
    soldier_id TEXT NOT NULL,
    callsign TEXT NOT NULL,
    unit TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heart_rate_bpm NUMERIC,
    blood_pressure_systolic NUMERIC,
    blood_pressure_diastolic NUMERIC,
    temperature_celsius NUMERIC,
    oxygen_saturation_pct NUMERIC,
    respiratory_rate_bpm NUMERIC,
    clinical_notes TEXT,
    recorded_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE
);

-- ----------------------------------------------------------------------------
-- 2. Performance Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON public.sentinel_incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.sentinel_incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON public.sentinel_incidents(priority);
CREATE INDEX IF NOT EXISTS idx_incidents_client_id ON public.sentinel_incidents(client_id);
CREATE INDEX IF NOT EXISTS idx_alerts_track_id ON public.sentinel_alerts(track_id);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON public.sentinel_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_patients_triage ON public.sentinel_patients(triage_category);
CREATE INDEX IF NOT EXISTS idx_hazards_edge_id ON public.sentinel_hazards(edge_id);
CREATE INDEX IF NOT EXISTS idx_soldier_vitals_soldier_id ON public.sentinel_soldier_vitals(soldier_id);
CREATE INDEX IF NOT EXISTS idx_soldier_vitals_timestamp ON public.sentinel_soldier_vitals(timestamp DESC);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.sentinel_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_sync_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_soldier_vitals ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated and anonymous clients (Demo evaluation)
CREATE POLICY "Allow public read on incidents" ON public.sentinel_incidents FOR SELECT USING (true);
CREATE POLICY "Allow public read on tracks" ON public.sentinel_tracks FOR SELECT USING (true);
CREATE POLICY "Allow public read on alerts" ON public.sentinel_alerts FOR SELECT USING (true);
CREATE POLICY "Allow public read on observations" ON public.sentinel_observations FOR SELECT USING (true);
CREATE POLICY "Allow public read on patients" ON public.sentinel_patients FOR SELECT USING (true);
CREATE POLICY "Allow public read on hazards" ON public.sentinel_hazards FOR SELECT USING (true);
CREATE POLICY "Allow public read on sync_registry" ON public.sentinel_sync_registry FOR SELECT USING (true);
CREATE POLICY "Allow public read on soldier_vitals" ON public.sentinel_soldier_vitals FOR SELECT USING (true);

-- Allow full write/update access for service role
CREATE POLICY "Service role full access on incidents" ON public.sentinel_incidents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on tracks" ON public.sentinel_tracks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on alerts" ON public.sentinel_alerts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on observations" ON public.sentinel_observations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on patients" ON public.sentinel_patients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on hazards" ON public.sentinel_hazards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on sync_registry" ON public.sentinel_sync_registry FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on soldier_vitals" ON public.sentinel_soldier_vitals FOR ALL USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. Seed Baseline Deterministic Data
-- ----------------------------------------------------------------------------

-- Seed Incidents
INSERT INTO public.sentinel_incidents (id, client_id, source_module, type, priority, status, title, notes, location, created_at, updated_at, synced_at)
VALUES 
    ('INC-101', 'cli-inc-101', 'fieldlink', 'infrastructure', 'high', 'active', 'Bridge Structural Impairment on Sector Alpha', 'Ground unit Bravo reports primary crossing bridge damaged by flash surge. Vehicle traffic suspended.', '{"lat": 34.0522, "lng": -118.2437, "name": "Sector Alpha - River Crossing"}'::jsonb, '2026-10-25T07:45:00.000Z', '2026-10-25T07:45:00.000Z', '2026-10-25T07:46:12.000Z'),
    ('INC-102', 'cli-inc-102', 'mediroute', 'medical', 'critical', 'active', 'Multi-Casualty Extraction Request', 'Three casualties requiring immediate stabilization near checkpoint Charlie.', '{"lat": 34.0620, "lng": -118.2380, "name": "Checkpoint Charlie"}'::jsonb, '2026-10-25T07:50:00.000Z', '2026-10-25T07:50:00.000Z', '2026-10-25T07:50:30.000Z'),
    ('INC-103', 'cli-inc-103', 'skywatch', 'hostile_drone', 'high', 'in_progress', 'Unidentified UAS Intrusion Sector Echo', 'Rogue drone detected loitering above restricted humanitarian aid corridor.', '{"lat": 34.0580, "lng": -118.2510, "name": "Sector Echo - Aid Corridor"}'::jsonb, '2026-10-25T07:55:00.000Z', '2026-10-25T07:55:00.000Z', '2026-10-25T07:55:10.000Z')
ON CONFLICT (id) DO NOTHING;

-- Seed Tracks
INSERT INTO public.sentinel_tracks (id, callsign, type, lat, lng, altitude, speed, heading, status)
VALUES
    ('TRK-001', 'SENTINEL-RECON-1', 'friendly_uav', 34.0550, -118.2450, 120, 21.6, 85, 'tracking'),
    ('TRK-002', 'UNKNOWN-SWARM-A', 'unidentified_drone', 34.0680, -118.2320, 85, 38.0, 210, 'tracking'),
    ('TRK-003', 'CIVIL-SURVEY-9', 'friendly_uav', 34.0410, -118.2610, 45, 12.0, 340, 'tracking')
ON CONFLICT (id) DO NOTHING;

-- Seed Alerts
INSERT INTO public.sentinel_alerts (id, track_id, type, severity, description, recommendation, acknowledged)
VALUES
    ('ALT-001', 'TRK-002', 'restricted_airspace_breach', 'critical', 'Track UNKNOWN-SWARM-A breached Restricted Airspace Zone Alpha (CCP Delta Buffer).', 'Deploy RF mitigation link and alert CCP Delta defense perimeter.', false),
    ('ALT-002', 'TRK-002', 'speed_anomaly', 'warning', 'Sudden velocity acceleration observed (38.0 m/s > 30.0 m/s threshold).', 'Maintain passive optical tracking; log velocity vectors.', false)
ON CONFLICT (id) DO NOTHING;

-- Seed Hazards
INSERT INTO public.sentinel_hazards (id, edge_id, from_node, to_node, hazard_type, blocked, reported_by)
VALUES
    ('HAZ-001', 'EDGE-1', 'NODE-CAS-3', 'NODE-INT-5', 'bridge_damage', false, 'Field Recon Team 2'),
    ('HAZ-002', 'EDGE-2', 'NODE-CAS-3', 'NODE-AID-2', 'clear_pathway', false, 'Patrol Bravo')
ON CONFLICT (id) DO NOTHING;

-- Seed Soldier Vitals
INSERT INTO public.sentinel_soldier_vitals (id, soldier_id, callsign, unit, timestamp, heart_rate_bpm, blood_pressure_systolic, blood_pressure_diastolic, temperature_celsius, oxygen_saturation_pct, respiratory_rate_bpm, clinical_notes, recorded_by)
VALUES
    ('REC-001-1', 'SOL-001', 'SOL-001 (Viper - Aarav)', '1st Recon Team (CCP Delta)', '2026-10-25T08:10:58.000Z', 136, 88, 54, 37.8, 88, 34, 'Critical hypoxemia (SpO2 88%) and tachypnea (RR 34/min) following blast trauma. Immediate airway management required.', 'med_officer_1@sentinel.mil'),
    ('REC-002-1', 'SOL-002', 'SOL-002 (Ghost - Aditi)', '2nd Infantry Patrol (CCP Delta)', '2026-10-25T08:05:00.000Z', 86, 122, 78, 36.9, 96, 20, 'Compound lower leg fracture splinted on site; pain managed with analgesics. Respiration stable.', 'med_officer_1@sentinel.mil'),
    ('REC-003-1', 'SOL-003', 'SOL-003 (Echo - Dev)', 'Combat Support Medevac (Aid Station Bravo)', '2026-10-25T07:55:00.000Z', 74, 118, 76, 36.7, 99, 16, 'Superficial shrapnel cuts bandaged. Ambulatory walking wounded; stable.', 'med_officer_2@sentinel.mil')
ON CONFLICT (id) DO NOTHING;

-- Seed Road Graph Nodes & Edges via comment for reference
-- Node graph: NODE-CAS-3 (CCP Delta), NODE-HOSP-1 (Hospital Alpha), NODE-AID-2 (Aid Station Bravo)
