-- Apply in the Supabase SQL Editor after schema.sql. Safe to rerun.
-- Account approval is owned by the API; browsers cannot read or modify this table.
BEGIN;

CREATE TABLE IF NOT EXISTS public.sentinel_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN (
        'admin', 'commander', 'medic', 'operator', 'administrator',
        'operations_officer', 'medical_officer', 'read_only_viewer'
    )),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    callsign TEXT,
    unit TEXT,
    team_id TEXT,
    team_name TEXT,
    mission_id TEXT,
    mission_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by TEXT
);

ALTER TABLE public.sentinel_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sentinel_users FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_users TO service_role;

-- Auth metadata supplies display fields and a requested role. Approval and admin
-- privileges are never accepted from user-controlled metadata.
CREATE OR REPLACE FUNCTION public.sentinel_create_pending_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NEW.email IS NOT NULL THEN
        INSERT INTO public.sentinel_users (
            id, email, name, role, status, callsign, team_id, team_name, mission_id, mission_name, created_at
        ) VALUES (
            NEW.id, lower(NEW.email),
            COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email, '@', 1)),
            CASE WHEN NEW.raw_user_meta_data->>'role' IN ('medic', 'commander')
                THEN NEW.raw_user_meta_data->>'role' ELSE 'operator' END,
            'pending', NEW.raw_user_meta_data->>'callsign',
            NEW.raw_user_meta_data->>'team_id', NEW.raw_user_meta_data->>'team_name',
            NEW.raw_user_meta_data->>'mission_id', NEW.raw_user_meta_data->>'mission_name', NEW.created_at
        ) ON CONFLICT (id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sentinel_create_pending_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sentinel_auth_user_created ON auth.users;
CREATE TRIGGER sentinel_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sentinel_create_pending_profile();

-- Provision pre-existing email accounts without granting approval or changing existing profiles.
INSERT INTO public.sentinel_users (id, email, name, created_at)
SELECT id, lower(email), COALESCE(NULLIF(btrim(raw_user_meta_data->>'name'), ''), split_part(email, '@', 1)), created_at
FROM auth.users WHERE email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Compatibility tables for the existing VitalWatch mirror writes. Operational
-- reads still use the local cache; these tables do not replace that cache.
CREATE TABLE IF NOT EXISTS public.sentinel_personnel (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, role TEXT,
    status TEXT, callsign TEXT, team_id TEXT, team_name TEXT, mission_id TEXT, mission_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.sentinel_vitals (
    id TEXT PRIMARY KEY, personnel_id TEXT NOT NULL, heart_rate NUMERIC NOT NULL,
    spo2 NUMERIC NOT NULL, systolic_bp NUMERIC NOT NULL, diastolic_bp NUMERIC NOT NULL,
    temperature NUMERIC NOT NULL, respiratory_rate NUMERIC NOT NULL,
    recorded_by TEXT NOT NULL, is_manual BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.sentinel_personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_vitals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sentinel_personnel, public.sentinel_vitals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentinel_personnel, public.sentinel_vitals TO service_role;
COMMIT;
