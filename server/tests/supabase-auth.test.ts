import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app';
import { config } from '../src/config';
import { db } from '../src/db/database';

// Exercise the real Supabase SDK over its HTTP boundary. SQL trigger and role
// behavior is validated separately; these responses are synthetic fixtures.
test('Supabase identities use durable server-owned approvals and isolated Auth clients', async (t) => {
  const previousConfig = { ...config };
  const previousFetch = globalThis.fetch;
  const secret = 'sb_secret_synthetic_only';
  const publicKey = 'sb_publishable_synthetic_only';
  Object.assign(config, {
    supabaseUrl: 'https://synthetic.supabase.test', supabaseServiceRoleKey: secret,
    supabasePublishableKey: publicKey,
  });
  t.after(() => { Object.assign(config, previousConfig); globalThis.fetch = previousFetch; });
  const rows = new Map<string, any>();
  const passwords = new Map<string, string>();
  const databaseKeys: string[] = [];
  let databaseUnavailable = false;
  let emailUnconfirmed = false;
  let orphanIdentity = false;
  let providerUserId = '';
  let signupMetadata: any;
  const adminId = randomUUID();
  rows.set(adminId, { id: adminId, email: 'cloud-admin@example.test', name: 'Cloud Admin',
    role: 'admin', status: 'approved', created_at: new Date().toISOString() });
  passwords.set(adminId, 'synthetic-admin-password');
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
  });
  const authUser = (row: any) => ({ id: row.id, email: row.email, aud: 'authenticated',
    role: 'authenticated', created_at: row.created_at, app_metadata: {},
    user_metadata: { role: 'admin', status: 'approved' }, identities: [{ id: row.id }] });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.hostname, 'synthetic.supabase.test', 'Test must not contact a real provider');
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname.startsWith('/rest/v1/')) {
      databaseKeys.push(headers.get('apikey') || '');
      assert.notEqual(headers.get('authorization'), 'Bearer synthetic-provider-token');
      if (databaseUnavailable) return response({ code: 'PGRST000', message: 'Synthetic outage' }, 503);
      assert.equal(url.pathname, '/rest/v1/sentinel_users');
      let selected = [...rows.values()];
      for (const key of ['email', 'id']) {
        const filter = url.searchParams.get(key);
        if (filter) selected = selected.filter(row => row[key] === filter.slice(3));
      }
      if (init?.method === 'PATCH') selected.forEach(row => Object.assign(row, body));
      return response(headers.get('accept')?.includes('vnd.pgrst.object') ? selected[0] || null : selected);
    }
    if (url.pathname === '/auth/v1/user') {
      assert.equal(headers.get('apikey'), secret);
      const row = rows.get(providerUserId);
      return row ? response(authUser(row)) : response({ msg: 'Invalid token' }, 401);
    }
    assert.equal(headers.get('apikey'), publicKey, 'User authentication must use the public key');
    if (url.pathname === '/auth/v1/signup') {
      signupMetadata = body.data;
      const row = { id: randomUUID(), email: body.email, name: body.data.name,
        role: body.data.role, status: 'pending', created_at: new Date().toISOString(), team_id: body.data.team_id };
      rows.set(row.id, row); passwords.set(row.id, body.password);
      return response(authUser(row));
    }
    if (url.pathname === '/auth/v1/token') {
      const row = [...rows.values()].find(row => row.email === body.email);
      if (!row || passwords.get(row.id) !== body.password) {
        return response({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      }
      if (emailUnconfirmed) return response({ code: 'email_not_confirmed', error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400);
      const identity = authUser(row);
      if (orphanIdentity) identity.id = randomUUID();
      return response({ user: identity, access_token: 'synthetic-provider-token', refresh_token: 'synthetic-refresh',
        token_type: 'bearer', expires_in: 3600 });
    }
    throw new Error(`Unexpected provider operation: ${url.pathname}`);
  };

  assert.equal((await request(app).get('/api/auth/options')).body.demoEnabled, false);
  assert.equal((await request(app).post('/api/auth/login').send({ demoRole: 'administrator' })).status, 403);
  const email = 'cloud-new@example.test';
  const password = 'synthetic-user-password';
  const signup = await request(app).post('/api/auth/signup').send({
    email, password, name: 'Cloud Registration', role: 'admin', teamId: 'TEST-TEAM',
  });
  assert.equal(signup.status, 201);
  const id = signup.body.user.id;
  assert.ok(rows.has(id));
  assert.equal(signup.body.user.status, 'pending');
  assert.equal(signup.body.user.role, 'operator');
  assert.equal(signupMetadata.role, 'operator');
  assert.equal(signup.body.user.teamId, 'TEST-TEAM');
  assert.equal((await request(app).post('/api/auth/signup').send({ email, password, name: 'Duplicate' })).status, 409);
  assert.equal((await request(app).post('/api/auth/login').send({ email, password })).status, 403);
  assert.equal((await request(app).post('/api/auth/login').send({ email, password: 'incorrect' })).status, 401);
  emailUnconfirmed = true;
  const unconfirmed = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(unconfirmed.status, 403);
  assert.equal(unconfirmed.body.status, 'email_unconfirmed');
  emailUnconfirmed = false;

  const admin = await request(app).post('/api/auth/login').send({ email: 'cloud-admin@example.test', password: 'synthetic-admin-password' });
  assert.equal(admin.status, 200);
  const adminHeader = `Bearer ${admin.body.token}`;
  const users = await request(app).get('/api/auth/users').set('Authorization', adminHeader);
  assert.equal(users.status, 200);
  assert.equal(users.body.users.length, 2, 'Local fixture admins must not leak into cloud account list');
  const approval = await request(app).patch(`/api/auth/users/${id}/approve`).set('Authorization', adminHeader)
    .send({ status: 'approved', approvedBy: 'forged-admin' });
  assert.equal(approval.status, 200);
  assert.equal(rows.get(id).approved_by, adminId);
  // Discard the local profile cache: the next login must recover the cloud record.
  delete db.getRawState().users[id];
  const login = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, id);
  assert.equal(login.body.user.role, 'operator', 'Never trust user_metadata for authorization');
  const header = `Bearer ${login.body.token}`;
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', header)).status, 200);
  providerUserId = id;
  const providerMe = await request(app).get('/api/auth/me').set('Authorization', 'Bearer synthetic-provider-token');
  assert.equal(providerMe.status, 200);
  assert.equal(providerMe.body.user.role, 'operator');
  assert.equal((await request(app).get('/api/auth/users').set('Authorization', header)).status, 403);
  rows.get(id).status = 'rejected';
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', header)).status, 401, 'Cloud rejection revokes an already issued app session');
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', 'Bearer synthetic-provider-token')).status, 403);
  rows.get(id).status = 'approved';
  databaseUnavailable = true;
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', header)).status, 503);
  assert.equal((await request(app).post('/api/auth/login').send({ email, password })).status, 503, 'No local-account fallback during cloud outage');
  databaseUnavailable = false;
  orphanIdentity = true;
  assert.equal((await request(app).post('/api/auth/login').send({ email, password })).status, 401, 'Identity UUID must match its approved profile');
  orphanIdentity = false;
  assert.equal((await request(app).post('/api/auth/logout').set('Authorization', header)).status, 200);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', header)).status, 401);
  assert.ok(databaseKeys.length > 10);
  assert.ok(databaseKeys.every(key => key === secret), 'Privileged DB client must stay separate from user Auth sessions');
});
