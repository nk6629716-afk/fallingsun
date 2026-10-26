import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db/database';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabaseClient';
import { VitalSignRecord, UserProfile, PersonnelProfile } from '../../../shared/types';
import { config } from '../config';
import { AuthenticatedRequest, requireRole } from '../middleware/auth';
import { hashPassword, verifyPassword, issueSession, revokeSession } from '../services/localAuthService';

export const vitalWatchRouter = Router();
export const authRouter = Router();
const demoEnabled = () => config.nodeEnv !== 'production' && !isSupabaseConfigured();

// An explicit bearer is required here even when operational demo APIs allow anonymous fixtures.
const requireSession = (req: AuthenticatedRequest, res: Response, next: () => void) => {
  if (!req.headers.authorization?.startsWith('Bearer ') || !req.user) {
    res.status(401).json({ success: false, error: 'Sign in is required.' });
    return;
  }
  next();
};

authRouter.get('/options', (_req, res) => res.json({ demoEnabled: demoEnabled() }));

authRouter.post('/signup', async (req: Request, res: Response) => {
  const { email, password, name, callsign, role, teamId, teamName, missionId, missionName } = req.body;
  if (typeof email !== 'string' || !email.trim().includes('@') || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'A valid email and full name are required.' });
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 256) {
    return res.status(400).json({ success: false, error: 'Password must contain 6 to 256 characters.' });
  }
  if (db.getUserByEmail(email)) {
    return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
  }
  const clean = (value: unknown, fallback?: string) => typeof value === 'string' ? value.trim() || fallback : fallback;
  const user: UserProfile = {
    id: `USR-${randomUUID()}`, email: email.trim().toLowerCase(), name: name.trim(),
    role: role === 'medic' || role === 'commander' ? role : 'operator', status: 'pending',
    callsign: clean(callsign), teamId: clean(teamId, 'UNASSIGNED'), teamName: clean(teamName, 'Unassigned Field Unit'),
    missionId: clean(missionId, 'MSN-FALLING-SUN'), missionName: clean(missionName, 'Operation Falling Sun'),
    createdAt: new Date().toISOString(),
  };
  try {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Authentication provider unavailable');
      const { error } = await supabase.auth.signUp({ email: user.email, password, options: { data: { name: user.name } } });
      if (error) return res.status(400).json({ success: false, error: error.message });
    } else {
      const hash = await hashPassword(password);
      // Recheck after asynchronous hashing to prevent duplicate concurrent registrations.
      if (db.getUserByEmail(email)) return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
      db.savePasswordHash(user.id, hash);
    }
    db.saveUser(user);
    return res.status(201).json({ success: true, user, message: 'Registration received. Administrator approval is required.' });
  } catch {
    return res.status(503).json({ success: false, error: 'Registration is unavailable. Please try again.' });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password, demoRole } = req.body;
  if (demoRole) {
    if (!demoEnabled()) return res.status(403).json({ success: false, error: 'Demo sign in is disabled.' });
    const roles = ['administrator', 'operations_officer', 'medical_officer', 'read_only_viewer'];
    if (!roles.includes(demoRole)) return res.status(400).json({ success: false, error: 'Unknown demo role.' });
    // Keep the existing demo API contract used by the simulation tests.
    const seeded = demoRole === 'administrator' ? db.getUserById('USR-ADMIN-1') : null;
    const user: UserProfile = seeded || {
      id: `usr-${demoRole}-demo`, name: `Demo ${demoRole}`, email: email || `${demoRole}@sentinel.mil`,
      role: demoRole, status: 'approved', createdAt: '2026-10-25T00:00:00.000Z',
    };
    if (!seeded) db.saveUser(user);
    const token = issueSession(user.id);
    return res.json({ success: true, user, token, data: { token, user } });
  }
  if (typeof email !== 'string' || typeof password !== 'string' || !password || password.length > 256) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }
  const user = db.getUserByEmail(email);
  try {
    let valid = false;
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Authentication provider unavailable');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      valid = !error && Boolean(data.user && data.session);
    } else if (user) {
      valid = await verifyPassword(user.id, password);
    }
    if (!valid || !user) return res.status(401).json({ success: false, error: 'Invalid email or password. Demo profiles require the explicit demo sign in.' });
    if (user.status !== 'approved') return res.status(403).json({ success: false, status: user.status,
      error: user.status === 'pending' ? 'Account pending administrator approval.' : 'Account access has been declined by an administrator.' });
    const token = issueSession(user.id);
    return res.json({ success: true, user, token, data: { token, user } });
  } catch {
    return res.status(503).json({ success: false, error: 'Sign in is unavailable. Please try again.' });
  }
});

authRouter.get('/me', requireSession, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, user: req.user, data: { user: req.user } });
});

authRouter.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (token) revokeSession(token);
  return res.json({ success: true, message: 'Logged out successfully.' });
});

authRouter.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (typeof email !== 'string' || !email.includes('@')) return res.status(400).json({ success: false, error: 'A valid email is required.' });
  if (!isSupabaseConfigured()) return res.status(503).json({ success: false, error: 'Email reset is unavailable in the local demo. Contact an administrator.' });
  try {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Authentication provider unavailable');
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
    return res.json({ success: true, message: 'If the account exists, password reset instructions will be sent.' });
  } catch {
    return res.status(503).json({ success: false, error: 'Password reset is unavailable. Try again later.' });
  }
});

authRouter.get('/users', requireSession, requireRole(['admin', 'administrator']), (_req, res) => {
  const users = db.getUsers();
  return res.json({ success: true, users, pendingCount: users.filter(u => u.status === 'pending').length,
    approvedCount: users.filter(u => u.status === 'approved').length });
});

authRouter.patch('/users/:id/approve', requireSession, requireRole(['admin', 'administrator']), (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  if (status !== 'approved' && status !== 'rejected') return res.status(400).json({ success: false, error: "Status must be either 'approved' or 'rejected'." });
  const updated = db.approveUser(req.params.id, req.user!.id, status);
  if (!updated) return res.status(404).json({ success: false, error: 'User not found.' });
  if (status === 'approved' && !db.getPersonnelById(updated.id)) db.savePersonnel({ ...updated, locationHistory: [], isStale: true });
  return res.json({ success: true, user: updated, message: `User ${updated.name} has been ${status}.` });
});

// ============================================================================
// VITALWATCH PERSONNEL & VITALS WORKFLOW
// ============================================================================

/**
 * GET /api/vitalwatch/summary
 * Returns overall VitalWatch operational health and metrics.
 */
vitalWatchRouter.get('/summary', (_req: Request, res: Response) => {
  const summary = db.getVitalWatchSummary();
  return res.json({
    success: true,
    summary,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/vitalwatch/personnel
 * Lists personnel with their team, mission, location, and staleness status.
 */
vitalWatchRouter.get('/personnel', (_req: Request, res: Response) => {
  const personnel = db.getPersonnel();
  return res.json({
    success: true,
    personnel,
    count: personnel.length,
  });
});

/**
 * GET /api/vitalwatch/personnel/:id
 */
vitalWatchRouter.get('/personnel/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const person = db.getPersonnelById(id);
  if (!person) {
    return res.status(404).json({
      success: false,
      error: `Personnel ${id} not found.`,
    });
  }
  return res.json({
    success: true,
    personnel: person,
  });
});

/**
 * POST /api/vitalwatch/personnel
 * Protected Add / Update Personnel endpoint for authorized officials (admin or commander).
 */
vitalWatchRouter.post('/personnel', requireSession, (req: AuthenticatedRequest, res: Response) => {
  const requesterRole = req.user?.role === 'administrator' ? 'admin' : req.user?.role === 'operations_officer' ? 'commander' : req.user?.role;
  if (!requesterRole || (requesterRole !== 'admin' && requesterRole !== 'commander')) {
    return res.status(403).json({
      success: false,
      error: 'Access Denied: Only authorized officials (admin or commander) are permitted to add or update personnel records.',
    });
  }

  const { id, name, teamId, teamName, missionId, missionName, role, callsign, isNewRegistration } = req.body;

  if (!id || typeof id !== 'string' || !name || typeof name !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Personnel ID and Full Name are required.',
    });
  }

  const trimmedId = id.trim().toUpperCase();
  const trimmedName = name.trim();

  const existing = db.getPersonnelById(trimmedId);
  if (isNewRegistration && existing) {
    return res.status(409).json({
      success: false,
      error: `Conflict: Personnel ID ${trimmedId} is already registered to ${existing.name}.`,
    });
  }

  // Check if an approved user account is linked to this personnel
  const expectedEmail = `${trimmedId.toLowerCase()}@sentinel.mil`;
  const linkedUser = db.getUserByEmail(expectedEmail) || db.getUsers().find(u => u.name.toLowerCase() === trimmedName.toLowerCase());

  const updated: PersonnelProfile = {
    ...(existing || {
      id: trimmedId,
      email: expectedEmail,
      name: trimmedName,
      role: (role === 'admin' && requesterRole !== 'admin') ? 'operator' : (role || 'operator'),
      status: 'approved',
      createdAt: new Date().toISOString(),
      locationHistory: [],
    }),
    name: trimmedName,
    teamId: teamId || existing?.teamId || 'ALPHA-SQUAD',
    teamName: teamName || existing?.teamName || 'Alpha Quick Reaction Team',
    missionId: missionId || existing?.missionId || 'MSN-FALLING-SUN',
    missionName: missionName || existing?.missionName || 'Operation Falling Sun',
    callsign: callsign || existing?.callsign || trimmedId,
  };

  db.savePersonnel(updated);

  // If Supabase is configured, mirror write
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      Promise.resolve(
        supabase
          .from('sentinel_personnel')
          .upsert({
            id: updated.id,
            name: updated.name,
            team_id: updated.teamId,
            team_name: updated.teamName,
            mission_id: updated.missionId,
            mission_name: updated.missionName,
            role: updated.role,
            callsign: updated.callsign,
            status: updated.status,
            updated_at: new Date().toISOString(),
          })
      )
        .then(({ error }) => {
          if (error) console.warn('[Supabase Personnel] Mirror write warning:', error.message);
        })
        .catch((err: unknown) => console.warn('[Supabase Personnel] Exception during mirror write:', err));
    }
  }

  return res.json({
    success: true,
    personnel: updated,
    accountLinked: !!linkedUser,
    linkedUserEmail: linkedUser?.email,
    message: `Personnel record ${trimmedId} (${trimmedName}) successfully stored.`,
  });
});

/**
 * POST /api/vitalwatch/location
 * Updates permission-based browser GPS location.
 */
vitalWatchRouter.post('/location', (req: Request, res: Response) => {
  const { personnelId, lat, lng, accuracyMeters, source } = req.body;

  if (!personnelId || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({
      success: false,
      error: 'personnelId, numeric lat, and numeric lng are required.',
    });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      success: false,
      error: 'Latitude must be between -90 and 90, longitude between -180 and 180.',
    });
  }

  const updated = db.updatePersonnelLocation(personnelId, {
    lat,
    lng,
    accuracyMeters: typeof accuracyMeters === 'number' ? accuracyMeters : undefined,
    source: source === 'manual' ? 'manual' : 'browser_gps',
  });

  if (!updated) {
    return res.status(404).json({
      success: false,
      error: `Personnel with id ${personnelId} not found.`,
    });
  }

  return res.json({
    success: true,
    personnel: updated,
    message: 'Browser GPS location recorded.',
  });
});

/**
 * GET /api/vitalwatch/vitals
 * Returns saved vitals readings. Optional ?personnelId= filter.
 */
vitalWatchRouter.get('/vitals', (req: Request, res: Response) => {
  const personnelId = typeof req.query.personnelId === 'string' ? req.query.personnelId : undefined;
  const vitals = db.getVitals(personnelId);
  return res.json({
    success: true,
    vitals,
    count: vitals.length,
  });
});

/**
 * POST /api/vitalwatch/vitals
 * Manual vitals entry by authorized medical personnel.
 * Strictly validates inputs and verifies medical credentials.
 */
vitalWatchRouter.post('/vitals', requireSession, (req: AuthenticatedRequest, res: Response) => {
  const {
    personnelId,
    personnelName,
    heartRate,
    spo2,
    systolicBp,
    diastolicBp,
    temperature,
    respiratoryRate,
    recordedBy,
    recorderRole,
    notes,
  } = req.body;

  // Authorization check: Only authorized medical personnel (medic or admin) can record vitals
  const normalizedRole = req.user?.role === 'administrator' ? 'admin' : req.user?.role === 'medical_officer' ? 'medic' : req.user?.role;
  if (normalizedRole !== 'medic' && normalizedRole !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access Denied: Only authorized medical personnel (medic or admin role) are permitted to record patient vitals.',
    });
  }

  if (!personnelId) {
    return res.status(400).json({
      success: false,
      error: 'personnelId is required to attribute vitals.',
    });
  }

  // Validate heart rate (30 - 250 bpm)
  const hr = Number(heartRate);
  if (isNaN(hr) || hr < 30 || hr > 250) {
    return res.status(400).json({
      success: false,
      error: 'Heart rate must be a valid physiological measurement between 30 and 250 bpm.',
    });
  }

  // Validate SpO2 (50 - 100%)
  const ox = Number(spo2);
  if (isNaN(ox) || ox < 50 || ox > 100) {
    return res.status(400).json({
      success: false,
      error: 'Oxygen saturation (SpO2) must be a percentage between 50% and 100%.',
    });
  }

  // Validate Blood Pressure (systolic 50-260, diastolic 30-160)
  const sys = Number(systolicBp);
  const dia = Number(diastolicBp);
  if (isNaN(sys) || sys < 50 || sys > 260) {
    return res.status(400).json({
      success: false,
      error: 'Systolic blood pressure must be between 50 and 260 mmHg.',
    });
  }
  if (isNaN(dia) || dia < 30 || dia > 160) {
    return res.status(400).json({
      success: false,
      error: 'Diastolic blood pressure must be between 30 and 160 mmHg.',
    });
  }
  if (sys <= dia) {
    return res.status(400).json({
      success: false,
      error: 'Systolic pressure must exceed diastolic pressure.',
    });
  }

  // Validate Temperature (30.0 - 45.0 °C)
  const temp = Number(temperature);
  if (isNaN(temp) || temp < 30.0 || temp > 45.0) {
    return res.status(400).json({
      success: false,
      error: 'Temperature must be between 30.0°C and 45.0°C.',
    });
  }

  // Validate Respiratory Rate (4 - 60 bpm)
  const rr = Number(respiratoryRate);
  if (isNaN(rr) || rr < 4 || rr > 60) {
    return res.status(400).json({
      success: false,
      error: 'Respiratory rate must be between 4 and 60 breaths/min.',
    });
  }

  // Find personnel name if not supplied
  const person = db.getPersonnelById(personnelId);
  const nameToUse = personnelName || person?.name || personnelId;

  const record: VitalSignRecord = {
    id: `VIT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
    personnelId,
    personnelName: nameToUse,
    heartRate: Math.round(hr),
    spo2: Math.round(ox),
    systolicBp: Math.round(sys),
    diastolicBp: Math.round(dia),
    temperature: parseFloat(temp.toFixed(1)),
    respiratoryRate: Math.round(rr),
    timestamp: new Date().toISOString(),
    recordedBy: req.user!.name,
    recorderRole: normalizedRole,
    notes: notes?.trim() || undefined,
    isManual: true, // Strictly labeled manual
  };

  db.saveVital(record);

  // If Supabase configured, attempt mirror write
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      Promise.resolve(
        supabase
          .from('sentinel_vitals')
          .insert([{
            id: record.id,
            personnel_id: record.personnelId,
            heart_rate: record.heartRate,
            spo2: record.spo2,
            systolic_bp: record.systolicBp,
            diastolic_bp: record.diastolicBp,
            temperature: record.temperature,
            respiratory_rate: record.respiratoryRate,
            recorded_by: record.recordedBy,
            is_manual: true,
            created_at: record.timestamp,
          }])
      )
        .then((result) => {
          if (result.error) console.warn('[Supabase] Non-fatal vitals mirror notice:', result.error.message);
        })
        .catch((err: unknown) => console.warn('[Supabase] Exception during vitals sync:', err));
    }
  }

  return res.status(201).json({
    success: true,
    record,
    message: 'Manual vitals reading recorded and verified by medical personnel.',
  });
});
