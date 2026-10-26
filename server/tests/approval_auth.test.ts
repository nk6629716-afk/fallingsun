import { test } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../src/app';

test('POST /api/auth/signup captures 6 fields and enforces pending status', async () => {
  const signupPayload = {
    email: 'cadet-smith@sentinel.mil',
    password: 'SecurePassword123!',
    confirmPassword: 'SecurePassword123!',
    badgeName: 'Smith J.',
    regimentNo: '00742', // Leading zeros preserved
    heightCm: 182,
    weightKg: 81,
    ageYears: 24,
    // Attempt malicious privilege escalation
    role: 'administrator',
    approvalStatus: 'approved',
  };

  const res = await request(app)
    .post('/api/auth/signup')
    .send(signupPayload);

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.token);
  assert.strictEqual(res.body.data.user.email, 'cadet-smith@sentinel.mil');
  // Escalation must be rejected: server assigns pending and least-privileged role
  assert.strictEqual(res.body.data.user.approvalStatus, 'pending');
  assert.strictEqual(res.body.data.user.role, 'read_only_viewer');
  assert.strictEqual(res.body.data.soldier.badgeName, 'Smith J.');
  assert.strictEqual(res.body.data.soldier.regimentNo, '00742');
  assert.strictEqual(res.body.data.soldier.heightCm, 182);
  assert.strictEqual(res.body.data.soldier.weightKg, 81);
  assert.strictEqual(res.body.data.soldier.ageYears, 24);
  assert.strictEqual(res.body.data.soldier.approvalStatus, 'pending');
});

test('Real-auth mode: anonymous requests are rejected with 401 when test fallback disabled', async () => {
  const dashRes = await request(app)
    .get('/api/dashboard')
    .set('x-disable-test-fallback', 'true');

  assert.strictEqual(dashRes.status, 401);
  assert.strictEqual(dashRes.body.success, false);
  assert.strictEqual(dashRes.body.error.code, 'AUTH_REQUIRED');

  const vitalsRes = await request(app)
    .get('/api/vitals')
    .set('x-disable-test-fallback', 'true');

  assert.strictEqual(vitalsRes.status, 401);
  assert.strictEqual(vitalsRes.body.error.code, 'AUTH_REQUIRED');
});

test('Pending account cannot access operational modules, but can view /me and logout', async () => {
  // 1. Create a fresh pending account
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      email: 'cadet-jones@sentinel.mil',
      password: 'SecurePassword123!',
      badgeName: 'Jones A.',
      regimentNo: '00108',
      heightCm: 175,
      weightKg: 70,
      ageYears: 22,
    });

  assert.strictEqual(signupRes.status, 201);
  const token = signupRes.body.data.token;
  const registrationId = signupRes.body.data.registrationId;

  // 2. Can inspect own profile and status via /me
  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`);

  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.data.user.approvalStatus, 'pending');

  // 3. Operational endpoints reject pending accounts with 403 ACCOUNT_NOT_APPROVED
  const opsRes = await request(app)
    .get('/api/vitals')
    .set('Authorization', `Bearer ${token}`)
    .set('x-disable-test-fallback', 'true');

  assert.strictEqual(opsRes.status, 403);
  assert.strictEqual(opsRes.body.error.code, 'ACCOUNT_NOT_APPROVED');

  // 4. Non-admin cannot approve registration
  const nonAdminApprove = await request(app)
    .patch(`/api/admin/registrations/${registrationId}/decision`)
    .set('Authorization', `Bearer ${token}`)
    .send({ decision: 'approved', assignedRole: 'soldier' });

  assert.strictEqual(nonAdminApprove.status, 403);

  // 5. Approved administrator can approve registration
  const adminApprove = await request(app)
    .patch(`/api/admin/registrations/${registrationId}/decision`)
    .set('Authorization', 'Bearer dev-admin-token')
    .send({ decision: 'approved', assignedRole: 'soldier' });

  assert.strictEqual(adminApprove.status, 200);
  assert.strictEqual(adminApprove.body.data.approvalStatus, 'approved');

  // 6. Now the approved user can access operational endpoints!
  const approvedOpsRes = await request(app)
    .get('/api/vitals/soldiers')
    .set('Authorization', `Bearer ${token}`)
    .set('x-disable-test-fallback', 'true');

  assert.strictEqual(approvedOpsRes.status, 200);
  assert.strictEqual(approvedOpsRes.body.success, true);
});

test('Activity intake and Gemini risk review contract', async () => {
  // 1. Log an activity using admin session
  const actRes = await request(app)
    .post('/api/activities')
    .set('Authorization', 'Bearer dev-admin-token')
    .send({
      soldierId: 'SOL-101',
      activityType: 'marching',
      durationMinutes: 60,
      intensity: 'high',
      carriedLoadKg: 25,
      restRecoveryInfo: '5 hours sleep',
      environmentalConditions: {
        temperatureCelsius: 32,
        humidityPct: 75,
        terrain: 'Mountain ascent',
      },
      notes: 'Endurance march under direct sun.',
    });

  assert.strictEqual(actRes.status, 201);
  assert.strictEqual(actRes.body.success, true);
  const activityId = actRes.body.data.id;
  assert.ok(activityId);

  // 2. Request risk review
  const reviewRes = await request(app)
    .post(`/api/activities/${activityId}/risk-review`)
    .set('Authorization', 'Bearer dev-admin-token');

  assert.strictEqual(reviewRes.status, 200);
  assert.strictEqual(reviewRes.body.success, true);
  // Structured contract check
  assert.ok(['needs_review', 'no_specific_concern_identified', 'insufficient_data'].includes(reviewRes.body.data.status));
  assert.ok(typeof reviewRes.body.data.summary === 'string');
  assert.ok(Array.isArray(reviewRes.body.data.concerns));
  assert.ok(Array.isArray(reviewRes.body.data.missingInputs));
  assert.ok(Array.isArray(reviewRes.body.data.limitations));
  assert.ok(reviewRes.body.data.limitations.some((l: string) => l.toLowerCase().includes('advisory')));
});

test('Demo Official Account authentication and authorization contract', async () => {
  // 1. Rejects invalid password
  const failRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'demo.official@sentinel-demo.local',
      password: 'WrongPassword123!',
    });

  assert.strictEqual(failRes.status, 401);
  assert.strictEqual(failRes.body.success, false);
  assert.strictEqual(failRes.body.error.code, 'INVALID_CREDENTIALS');

  // 2. Accepts valid demo credentials
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'demo.official@sentinel-demo.local',
      password: 'Sentinel#DemoOfficial2026!Local',
    });

  assert.strictEqual(loginRes.status, 200);
  assert.strictEqual(loginRes.body.success, true);
  assert.strictEqual(loginRes.body.data.user.email, 'demo.official@sentinel-demo.local');
  assert.strictEqual(loginRes.body.data.user.role, 'operations_officer');
  assert.strictEqual(loginRes.body.data.user.approvalStatus, 'approved');
  assert.ok(loginRes.body.data.notice.includes('DEMO ACCOUNT'));

  const token = loginRes.body.data.token;

  // 3. Permitted to access operational dashboard
  const dashRes = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${token}`)
    .set('x-disable-test-fallback', 'true');

  assert.strictEqual(dashRes.status, 200);
  assert.strictEqual(dashRes.body.success, true);

  // 4. Forbidden from administrative approval panel
  const adminRes = await request(app)
    .get('/api/admin/registrations')
    .set('Authorization', `Bearer ${token}`)
    .set('x-disable-test-fallback', 'true');

  assert.strictEqual(adminRes.status, 403);
  assert.strictEqual(adminRes.body.error.code, 'FORBIDDEN');
});
