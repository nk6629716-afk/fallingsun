/**
 * SENTINEL Supabase Client Initializer
 * Provides an authenticated Supabase client using server-side credentials.
 * Automatically falls back gracefully when credentials are not configured.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const url = config.supabaseUrl;
  const key = config.supabaseServiceRoleKey;

  if (url && key && key.trim().length > 0) {
    try {
      supabaseInstance = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      console.log(`[Supabase] Authenticated client initialized for: ${url}`);
      return supabaseInstance;
    } catch (err) {
      console.warn('[Supabase] Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return null;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey && config.supabaseServiceRoleKey.trim().length > 0);
}

/** Request-scoped public Auth client. Never sign in on the privileged database client. */
export function getSupabaseAuthClient(): SupabaseClient {
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required for Supabase Auth.');
  }
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function assertSupabaseConfiguration(): void {
  if (config.storageMode === 'supabase' || isSupabaseConfigured()) {
    if (!isSupabaseConfigured() || !config.supabasePublishableKey?.trim()) {
      throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (or legacy service-role key).');
    }
  }
}
