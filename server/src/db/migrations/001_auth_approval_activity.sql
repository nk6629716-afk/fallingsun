-- ============================================================================
-- SENTINEL Migration 001: Account Registrations, Approvals & Activity Records
-- Versioned Authoritative Migration for Supabase / PostgreSQL
-- ============================================================================

-- 1. Account Profiles Table (Administrative Access & Soldier Linkage)
CREATE TABLE IF NOT EXISTS public.sentinel_account_profiles (
    id TEXT PRIMARY KEY,
    auth_user_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'read_only_viewer',
    approval_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'suspended'
    soldier_id TEXT NOT NULL,
    badge_name TEXT NOT NULL,
    regiment_no TEXT NOT NULL,
    height_cm NUMERIC NOT NULL,
    weight_kg NUMERIC NOT NULL,
    age_years INTEGER NOT NULL,
    profile_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    decision_reason TEXT
);

-- 2. Registration Decision Audits
CREATE TABLE IF NOT EXISTS public.sentinel_decision_audits (
    id TEXT PRIMARY KEY,
    registration_id TEXT NOT NULL REFERENCES public.sentinel_account_profiles(id) ON DELETE CASCADE,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    decision_by TEXT NOT NULL,
    decision_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT
);

-- 3. Soldier Physical Activities Table (Workloads & Training)
CREATE TABLE IF NOT EXISTS public.sentinel_activities (
    id TEXT PRIMARY KEY,
    soldier_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    duration_minutes NUMERIC NOT NULL,
    intensity TEXT NOT NULL,
    carried_load_kg NUMERIC,
    rest_recovery_info TEXT,
    environmental_conditions JSONB,
    notes TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE
);

-- 4. Gemini Activity Risk Reviews (Advisory Review Aid)
CREATE TABLE IF NOT EXISTS public.sentinel_activity_reviews (
    id TEXT PRIMARY KEY,
    activity_id TEXT NOT NULL REFERENCES public.sentinel_activities(id) ON DELETE CASCADE,
    soldier_id TEXT NOT NULL,
    status TEXT NOT NULL, -- 'needs_review' | 'no_specific_concern_identified' | 'insufficient_data'
    summary TEXT NOT NULL,
    concerns JSONB NOT NULL DEFAULT '[]'::jsonb,
    missing_inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggested_next_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_identifier TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_simulated BOOLEAN NOT NULL DEFAULT FALSE
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_account_profiles_status ON public.sentinel_account_profiles(approval_status);
CREATE INDEX IF NOT EXISTS idx_account_profiles_email ON public.sentinel_account_profiles(email);
CREATE INDEX IF NOT EXISTS idx_account_profiles_soldier ON public.sentinel_account_profiles(soldier_id);
CREATE INDEX IF NOT EXISTS idx_activities_soldier ON public.sentinel_activities(soldier_id);
CREATE INDEX IF NOT EXISTS idx_activity_reviews_activity ON public.sentinel_activity_reviews(activity_id);

-- 6. Row Level Security: Deny-by-default on personal data tables
ALTER TABLE public.sentinel_account_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_decision_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_activity_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_soldier_vitals ENABLE ROW LEVEL SECURITY;

-- Drop permissive demo policies on sensitive personal tables if they exist
DROP POLICY IF EXISTS "Allow public read on soldier_vitals" ON public.sentinel_soldier_vitals;
DROP POLICY IF EXISTS "Allow public read on account_profiles" ON public.sentinel_account_profiles;

-- Deny public access; allow users to inspect only their own profile
CREATE POLICY "Users can inspect own profile" ON public.sentinel_account_profiles
    FOR SELECT USING (auth.uid()::text = auth_user_id);

-- Privileged Service Role Full Access
CREATE POLICY "Service role full access on account_profiles" ON public.sentinel_account_profiles
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access on decision_audits" ON public.sentinel_decision_audits
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access on activities" ON public.sentinel_activities
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access on activity_reviews" ON public.sentinel_activity_reviews
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Bootstrap First Administrator (idempotent)
INSERT INTO public.sentinel_account_profiles (
    id, auth_user_id, email, role, approval_status, soldier_id,
    badge_name, regiment_no, height_cm, weight_kg, age_years, profile_recorded_at, submitted_at, reviewed_at, reviewed_by, decision_reason
) VALUES (
    'reg-admin-bootstrap', 'usr-admin-01', 'admin@sentinel.mil', 'administrator', 'approved', 'SOL-101',
    'Commander Alpha', '001', 180, 78, 38, NOW(), NOW(), NOW(), 'SYSTEM_BOOTSTRAP', 'Initial system administrator'
) ON CONFLICT (email) DO NOTHING;
