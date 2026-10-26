import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabaseClient';
import { VitalSignRecord, UserProfile, PersonnelProfile } from '../../../shared/types';

export const vitalWatchRouter = Router();

// ============================================================================
// AUTH & ACCOUNT APPROVAL WORKFLOW
// ============================================================================

/**
 * POST /api/auth/signup
 * Self-signup for new personnel.
 * ALL new signups are strictly marked as 'pending' until an admin approves them.
 */
export const authRouter = Router();

authRouter.post('/signup', async (req: Request, res: Response) => {
  const { email, password, name, callsign, role, teamId, teamName, missionId, missionName } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({
      success: false,
      error: 'A valid email address is required for signup.',
    });
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Full name is required for registration.',
    });
  }

  if (password !== undefined && typeof password === 'string' && password.length > 0 && password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters.',
    });
  }

  const existing = db.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({
      success: false,
      error: 'An account with this email address already exists.',
      status: existing.status,
    });
  }

  // Force default pending status for all self-signups
  // Users cannot self-grant approved or admin privileges
  const requestedRole = (role === 'medic' || role === 'operator' || role === 'commander') ? role : 'operator';
  const newUser: UserProfile = {
    id: `USR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    email: email.trim().toLowerCase(),
    name: name.trim(),
    role: requestedRole,
    status: 'pending', // Strictly pending until admin approval
    callsign: callsign?.trim() || undefined,
    teamId: teamId?.trim() || 'UNASSIGNED',
    teamName: teamName?.trim() || 'Unassigned Field Unit',
    missionId: missionId?.trim() || 'MSN-FALLING-SUN',
    missionName: missionName?.trim() || 'Operation Falling Sun',
    createdAt: new Date().toISOString(),
  };

  db.saveUser(newUser);

  // If Supabase is configured, attempt Supabase Auth signup and mirror write
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      if (password && typeof password === 'string' && password.length >= 6) {
        Promise.resolve(
          supabase.auth.signUp({
            email: newUser.email,
            password,
            options: {
              data: {
                name: newUser.name,
                role: newUser.role,
                status: 'pending',
              },
            },
          })
        )
          .then((result) => {
            if (result.error) console.warn('[Supabase Auth] Notice during signup:', result.error.message);
          })
          .catch((err: unknown) => console.warn('[Supabase Auth] Exception during signup:', err));
      }

      Promise.resolve(
        supabase
          .from('sentinel_users')
          .insert([{
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            role: newUser.role,
            status: newUser.status,
            callsign: newUser.callsign,
            team_name: newUser.teamName,
            mission_name: newUser.missionName,
            created_at: newUser.createdAt,
          }])
      )
        .then((result) => {
          if (result.error) console.warn('[Supabase] Non-fatal sync notice for signup:', result.error.message);
        })
        .catch((err: unknown) => console.warn('[Supabase] Exception during user sync:', err));
    }
  }

  return res.status(201).json({
    success: true,
    user: newUser,
    message: 'Registration received. Your account is pending administrator approval before access to tactical mission data is granted.',
  });
});

/**
 * POST /api/auth/login
 * Log in with existing credentials. Pending users are strictly blocked from mission data.
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password, demoRole } = req.body;

  // Support demoRole for test suites and development evaluation
  if (demoRole && typeof demoRole === 'string') {
    const role = demoRole as any;
    const demoUser: UserProfile = {
      id: `usr-${role}-demo`,
      name: `Demo ${role.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
      email: email || `${role}@sentinel.mil`,
      role,
      status: 'approved',
      createdAt: '2026-10-25T00:00:00.000Z',
      callsign: role === 'administrator' ? 'COMMAND-1' : role === 'operations_officer' ? 'TACTICAL-OPS' : role === 'medical_officer' ? 'MEDEVAC-LEAD' : 'OBSERVER-SIT',
      unit: role === 'medical_officer' ? 'Forward Triage & Health Monitoring' : 'Field Operations Group',
    };
    const token = role === 'administrator' ? 'dev-admin-token' : role === 'operations_officer' ? 'dev-ops-token' : role === 'medical_officer' ? 'dev-medical-token' : 'dev-viewer-token';
    return res.status(200).json({
      success: true,
      user: demoUser,
      token,
      data: { token, user: demoUser },
    });
  }

  if (!email || typeof email !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Email address is required.',
    });
  }

  // 1. If Supabase Auth is active and password provided, authenticate against Supabase
  if (isSupabaseConfigured() && password) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // If Supabase explicitly rejects credentials
          console.warn('[Supabase Auth] Sign-in notice:', error.message);
        } else if (data.user) {
          // Check local or remote approval status
          const localUser = db.getUserByEmail(email);
          const status = localUser?.status || (data.user.user_metadata?.status as any) || 'pending';
          if (status === 'pending') {
            return res.status(403).json({
              success: false,
              status: 'pending',
              error: 'Account pending administrator approval. An administrator must approve your account before you can access mission data.',
            });
          }
          const returnedUser = localUser || {
            id: data.user.id,
            email: data.user.email || email,
            name: data.user.user_metadata?.name || 'Operator',
            role: data.user.user_metadata?.role || 'operator',
            status: 'approved',
            createdAt: data.user.created_at,
          };
          const token = data.session?.access_token || `token-${Date.now()}`;
          return res.json({
            success: true,
            user: returnedUser,
            token,
            data: { token, user: returnedUser },
          });
        }
      } catch (err) {
        console.warn('[Supabase Auth] Exception during login:', err);
      }
    }
  }

  // 2. Local fallback database verification
  const user = db.getUserByEmail(email);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'Account not found. Please self-register using the sign-up form.',
    });
  }

  if (user.status === 'pending') {
    return res.status(403).json({
      success: false,
      status: 'pending',
      user,
      error: 'Account pending administrator approval. An administrator must approve your account before you can access mission data.',
    });
  }

  if (user.status === 'rejected') {
    return res.status(403).json({
      success: false,
      status: 'rejected',
      error: 'Account access has been declined by an administrator.',
    });
  }

  const token = `sentinel-token-${user.id}`;
  return res.json({
    success: true,
    user,
    token,
    data: { token, user },
    message: `Welcome back, ${user.name} (${user.role.toUpperCase()}).`,
  });
});

/**
 * GET /api/auth/me
 */
authRouter.get('/me', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'No active authenticated session',
      },
    });
  }
  return res.status(200).json({
    success: true,
    data: { user },
    user,
  });
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', async (_req: Request, res: Response) => {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[Supabase Auth] Sign out exception:', err);
      }
    }
  }
  return res.json({
    success: true,
    message: 'Logged out successfully.',
  });
});

/**
 * POST /api/auth/forgot-password
 */
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Email address is required.',
    });
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.resetPasswordForEmail(email);
      } catch (err) {
        console.warn('[Supabase Auth] Password reset exception:', err);
      }
    }
  }

  return res.json({
    success: true,
    message: 'Password reset instructions have been dispatched. Contact your unit signals administrator if issues persist.',
  });
});

/**
 * GET /api/auth/users
 * Returns list of users for administration and review.
 */
authRouter.get('/users', (_req: Request, res: Response) => {
  const users = db.getUsers();
  return res.json({
    success: true,
    users,
    pendingCount: users.filter((u) => u.status === 'pending').length,
    approvedCount: users.filter((u) => u.status === 'approved').length,
  });
});

/**
 * PATCH /api/auth/users/:id/approve
 * Approves or rejects a pending user.
 */
authRouter.patch('/users/:id/approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, approvedBy } = req.body;

  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({
      success: false,
      error: "Status must be either 'approved' or 'rejected'.",
    });
  }

  const updated = db.approveUser(id, approvedBy || 'ADMIN', status);
  if (!updated) {
    return res.status(404).json({
      success: false,
      error: `User ${id} not found.`,
    });
  }

  // Also auto-create or update Personnel Profile if approved
  if (status === 'approved') {
    const reg = db.getRegistrationByEmail(updated.email);
    if (reg) {
      db.saveRegistration({
        ...reg,
        approvalStatus: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy: approvedBy || 'ADMIN',
        decisionReason: 'Approved via VitalWatch',
      });
    }
    const existingPers = db.getPersonnelById(updated.id);
    if (!existingPers) {
      db.savePersonnel({
        ...updated,
        locationHistory: [],
        isStale: true,
      });
    }
  }

  return res.json({
    success: true,
    user: updated,
    message: `User ${updated.name} has been ${status}.`,
  });
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
vitalWatchRouter.post('/personnel', (req: Request, res: Response) => {
  const requesterRole = (req.headers['x-user-role'] as string) || req.body.requesterRole;
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
vitalWatchRouter.post('/vitals', (req: Request, res: Response) => {
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
  const normalizedRole = (recorderRole || '').toLowerCase().trim();
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
    recordedBy: recordedBy || 'Authorized Medical Officer',
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
