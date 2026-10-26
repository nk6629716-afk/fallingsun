import { assertSupabaseConfiguration, getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

async function check() {
  assertSupabaseConfiguration();
  const client = getSupabaseClient();
  if (!isSupabaseConfigured() || !client) throw new Error('Supabase credentials are not configured in server/.env.');
  const { error: authError } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (authError) throw new Error(`Auth access failed (${authError.status || 'provider error'}). Check the server secret key.`);
  for (const name of ['sentinel_users', 'sentinel_incidents', 'sentinel_tracks', 'sentinel_alerts',
    'sentinel_observations', 'sentinel_patients', 'sentinel_hazards', 'sentinel_sync_registry',
    'sentinel_soldier_vitals', 'sentinel_personnel', 'sentinel_vitals']) {
    const { error } = await client.from(name).select('*', { head: true }).limit(1);
    if (error) throw new Error(`Table ${name} is unavailable (${error.code || 'provider error'}). Apply schema.sql then auth-schema.sql.`);
    console.log(`OK ${name}`);
  }
  console.log('Supabase Auth and table access verified. Next: test signup, email confirmation and administrator approval.');
}

check().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
