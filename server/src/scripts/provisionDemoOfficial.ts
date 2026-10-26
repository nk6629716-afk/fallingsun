/**
 * SENTINEL — Demo Official Account Provisioning Script
 * 
 * Secure, repeatable setup script for provisioning the test Demo Official Account.
 * - Email: demo.official@sentinel-demo.local
 * - Role: operations_officer (minimal privilege required for official operations dashboard)
 * - Approval Status: approved (set through trusted server-side provisioning)
 * - NEVER exposes secrets or service-role keys to the frontend.
 * - When Supabase is configured, provisions through Supabase Auth Admin API.
 */

import { db } from '../db/database';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabaseClient';
import { config } from '../config';
import { DEMO_OFFICIAL_EMAIL, DEMO_OFFICIAL_PASSWORD } from '../routes/authRoutes';

async function provisionDemoOfficial() {
  console.log('----------------------------------------------------');
  console.log('SENTINEL: Provisioning Demo Official Account');
  console.log('----------------------------------------------------');
  console.log(`Email:    ${DEMO_OFFICIAL_EMAIL}`);
  console.log(`Role:     operations_officer (restricted, non-admin)`);
  console.log(`Approval: approved (trusted setup)`);
  console.log(`Notice:   DEMO ACCOUNT — NOT FOR OPERATIONAL USE`);
  console.log('----------------------------------------------------');

  let authUserId = 'usr-demo-official-01';

  // 1. Supabase Auth Provisioning (if configured)
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        console.log('[Provisioning] Attempting Supabase Auth Admin registration...');
        const { data, error } = await supabase.auth.admin.createUser({
          email: DEMO_OFFICIAL_EMAIL,
          password: DEMO_OFFICIAL_PASSWORD,
          email_confirm: true,
          user_metadata: {
            badgeName: 'Demo Official',
            regimentNo: '042',
            role: 'operations_officer',
            isDemo: true,
          },
        });

        if (error) {
          if (error.message.includes('already registered') || error.message.includes('unique')) {
            console.log('[Provisioning] Account already exists in Supabase Auth project.');
          } else {
            console.warn('[Provisioning] Supabase Auth creation returned warning:', error.message);
          }
        } else if (data.user?.id) {
          authUserId = data.user.id;
          console.log(`[Provisioning] Supabase Auth user confirmed with ID: ${authUserId}`);
        }
      } catch (err: any) {
        console.warn('[Provisioning] Supabase Admin API unreachable:', err.message);
      }
    }
  } else {
    console.log('[Provisioning] Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset).');
    console.log('[Provisioning] Using local secure state repository.');
  }

  // 2. Local Database Registration & Soldier Profile
  const now = new Date().toISOString();
  db.saveRegistration({
    id: 'reg-demo-official',
    authUserId,
    email: DEMO_OFFICIAL_EMAIL,
    role: 'operations_officer',
    approvalStatus: 'approved',
    soldierId: 'SOL-002',
    badgeName: 'Demo Official',
    regimentNo: '042',
    heightCm: 178,
    weightKg: 76,
    ageYears: 34,
    profileRecordedAt: now,
    submittedAt: now,
    reviewedAt: now,
    reviewedBy: 'TRUSTED_PROVISIONING_SETUP',
    decisionReason: 'Repeatable setup script provisioned demo official account',
  });

  console.log('[Provisioning] Demo Official Account successfully provisioned and ready for testing.');
  console.log('----------------------------------------------------');
}

provisionDemoOfficial()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Provisioning Error]:', err);
    process.exit(1);
  });
