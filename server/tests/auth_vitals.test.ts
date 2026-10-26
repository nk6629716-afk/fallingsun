import { test } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../src/app';

test('POST /api/auth/login authenticates demo roles and returns typed session', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ demoRole: 'medical_officer', email: 'medical@sentinel.mil' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.user.role, 'medical_officer');
  assert.strictEqual(res.body.data.user.email, 'medical@sentinel.mil');
  assert.ok(res.body.data.token);
});

test('GET /api/auth/me returns current authenticated user identity', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', 'Bearer dev-ops-token');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.user.role, 'operations_officer');
  assert.strictEqual(res.body.data.user.email, 'ops@sentinel.mil');
});

test('GET /api/vitals/soldiers returns permitted soldier roster with oversight disclaimer', async () => {
  const res = await request(app).get('/api/vitals/soldiers');

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length >= 4);
  assert.ok(res.body.meta.disclaimer.includes('medical oversight'));
});

test('POST /api/vitals rejects read_only_viewer with 403 FORBIDDEN', async () => {
  const res = await request(app)
    .post('/api/vitals')
    .set('Authorization', 'Bearer dev-viewer-token')
    .send({
      soldierId: 'SOL-001',
      heartRateBpm: 80,
    });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.error.code, 'FORBIDDEN');
});

test('POST /api/vitals creates time-stamped record for medical_officer', async () => {
  const res = await request(app)
    .post('/api/vitals')
    .set('Authorization', 'Bearer dev-medical-token')
    .send({
      soldierId: 'SOL-001',
      heartRateBpm: 76,
      bloodPressureSystolic: 120,
      bloodPressureDiastolic: 80,
      temperatureCelsius: 36.9,
      oxygenSaturationPct: 98,
      respiratoryRateBpm: 15,
      clinicalNotes: 'Follow-up vitals intake; parameters stable.',
    });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.soldierId, 'SOL-001');
  assert.strictEqual(res.body.data.heartRateBpm, 76);
  assert.ok(res.body.data.recordedBy.includes('medical_officer'));
  assert.ok(res.body.meta.disclaimer);

  // Verify retrieval
  const getRes = await request(app).get('/api/vitals/SOL-001');
  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.body.data.soldier.id, 'SOL-001');
  assert.ok(getRes.body.data.history.length >= 1);
});

test('POST /api/demo/reset enforces administrator role restriction', async () => {
  const failRes = await request(app)
    .post('/api/demo/reset')
    .set('Authorization', 'Bearer dev-ops-token');

  assert.strictEqual(failRes.status, 403);
  assert.strictEqual(failRes.body.error.code, 'FORBIDDEN');

  const passRes = await request(app)
    .post('/api/demo/reset')
    .set('Authorization', 'Bearer dev-admin-token');

  assert.strictEqual(passRes.status, 200);
  assert.strictEqual(passRes.body.success, true);
});
