import { test } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { app } from '../src/app';

test('VitalWatch Auth: Signup defaults to pending status and prevents self-granted privileges', async () => {
  const email = `cadet.${Date.now()}@sentinel.mil`;
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      email,
      password: 'test-password-42',
      name: 'Cadet Kelly',
      callsign: 'VIPER-3',
      role: 'medic',
      teamName: 'Forward Triage Bravo',
      missionName: 'Operation Falling Sun',
    });

  assert.strictEqual(signupRes.status, 201);
  assert.strictEqual(signupRes.body.success, true);
  assert.strictEqual(signupRes.body.user.status, 'pending', 'New signups MUST be marked pending');
  assert.strictEqual(signupRes.body.user.email, email);

  // Attempt login with pending account
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'test-password-42' });

  assert.strictEqual(loginRes.status, 403);
  assert.strictEqual(loginRes.body.status, 'pending');
  assert.match(loginRes.body.error, /pending administrator approval/i);
});

test('VitalWatch Auth: Admin approval workflow successfully unlocks user', async () => {
  const email = `operator.${Date.now()}@sentinel.mil`;
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({
      email,
      password: 'test-password-42',
      name: 'Specialist Ray',
      callsign: 'GHOST-7',
      role: 'operator',
    });

  const userId = signupRes.body.user.id;
  assert.ok(userId);

  // Admin approves user
  const approveRes = await request(app)
    .patch(`/api/auth/users/${userId}/approve`)
    .set('Authorization', 'Bearer dev-admin-token')
    .send({
      status: 'approved',
      approvedBy: 'USR-ADMIN-1',
    });

  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveRes.body.user.status, 'approved');
  assert.strictEqual(approveRes.body.user.approvedBy, 'usr-admin-01');

  // Now login succeeds
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'test-password-42' });

  assert.strictEqual(loginRes.status, 200);
  assert.strictEqual(loginRes.body.success, true);
  assert.strictEqual(loginRes.body.user.status, 'approved');
});

test('VitalWatch Personnel: Profiles, team and mission assignments are retrievable', async () => {
  const res = await request(app).get('/api/vitalwatch/personnel');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.ok(Array.isArray(res.body.personnel));
  assert.ok(res.body.personnel.length >= 2);

  const price = res.body.personnel.find((p: any) => p.name.includes('Price'));
  assert.ok(price, 'Capt. Price fixture should exist');
  assert.ok(price.teamName);
  assert.ok(price.missionName);
  assert.strictEqual(typeof price.isStale, 'boolean');
});

test('VitalWatch Vitals: Manual vitals entry validates authorized medical personnel and physiological ranges', async () => {
  // 1. Non-medic / operator role is REJECTED
  const forbiddenRes = await request(app)
    .post('/api/vitalwatch/vitals')
    .set('Authorization', 'Bearer dev-viewer-token')
    .send({
      personnelId: 'PERS-001',
      recorderRole: 'operator', // Not authorized
      recordedBy: 'Unauthorized Operator',
      heartRate: 72,
      spo2: 98,
      systolicBp: 120,
      diastolicBp: 80,
      temperature: 36.6,
      respiratoryRate: 14,
    });

  assert.strictEqual(forbiddenRes.status, 403);
  assert.match(forbiddenRes.body.error, /authorized medical personnel/i);

  // 2. Out-of-bounds vitals are REJECTED
  const invalidVitalsRes = await request(app)
    .post('/api/vitalwatch/vitals')
    .set('Authorization', 'Bearer dev-medical-token')
    .send({
      personnelId: 'PERS-001',
      recorderRole: 'medic',
      recordedBy: 'Dr. Evelyn Miller',
      heartRate: 400, // Impossibly high
      spo2: 98,
      systolicBp: 120,
      diastolicBp: 80,
      temperature: 36.6,
      respiratoryRate: 14,
    });

  assert.strictEqual(invalidVitalsRes.status, 400);
  assert.match(invalidVitalsRes.body.error, /physiological measurement/i);

  // 3. Valid medical entry SUCCEEDS and is labeled manual
  const validRes = await request(app)
    .post('/api/vitalwatch/vitals')
    .set('Authorization', 'Bearer dev-medical-token')
    .send({
      personnelId: 'PERS-001',
      personnelName: 'Capt. John Price',
      recorderRole: 'medic',
      recordedBy: 'Dr. Evelyn Miller',
      heartRate: 76,
      spo2: 99,
      systolicBp: 124,
      diastolicBp: 82,
      temperature: 36.9,
      respiratoryRate: 16,
      notes: 'Routine forward stabilization manual check.',
    });

  assert.strictEqual(validRes.status, 201);
  assert.strictEqual(validRes.body.success, true);
  assert.strictEqual(validRes.body.record.isManual, true, 'Vitals MUST be explicitly labeled manual');
  assert.strictEqual(validRes.body.record.heartRate, 76);
  assert.strictEqual(validRes.body.record.recordedBy, 'Dr. Miller (Medical)');
  assert.ok(validRes.body.record.timestamp);

  // 4. Retrieve vitals history for PERS-001
  const historyRes = await request(app).get('/api/vitalwatch/vitals?personnelId=PERS-001');
  assert.strictEqual(historyRes.status, 200);
  assert.ok(historyRes.body.vitals.length >= 1);
  const found = historyRes.body.vitals.find((v: any) => v.id === validRes.body.record.id);
  assert.ok(found, 'Recorded vitals should be in history');
});

test('VitalWatch Location: Records browser GPS coordinates and maintains location history', async () => {
  const locRes = await request(app)
    .post('/api/vitalwatch/location')
    .send({
      personnelId: 'PERS-001',
      lat: 34.0558,
      lng: -118.2442,
      accuracyMeters: 4.2,
      source: 'browser_gps',
    });

  assert.strictEqual(locRes.status, 200);
  assert.strictEqual(locRes.body.success, true);
  assert.strictEqual(locRes.body.personnel.currentLocation.lat, 34.0558);
  assert.strictEqual(locRes.body.personnel.currentLocation.lng, -118.2442);
  assert.strictEqual(locRes.body.personnel.currentLocation.source, 'browser_gps');
  assert.strictEqual(locRes.body.personnel.isStale, false);
  assert.ok(locRes.body.personnel.locationHistory.length >= 2, 'Location history should record updates');
});
