import { Router, Response } from 'express';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabaseClient';
import { AuthenticatedRequest, DEMO_USERS } from '../middleware/auth';
import { UserRole, UserProfile, AccountProfile, SoldierProfile } from '../../../shared/types';
import { db } from '../db/database';
import { validateSignupInput } from '../validation/validators';
import { config } from '../config';

export const authRouter = Router();

/**
 * POST /api/auth/signup
 * Registers a new soldier/staff account.
 * New accounts ALWAYS start with approvalStatus: 'pending' and role: 'read_only_viewer'.
 */
authRouter.post('/signup', async (req: AuthenticatedRequest, res: Response) => {
  const validated = validateSignupInput(req.body);

  // Check if email already registered locally
  const existing = db.getRegistrationByEmail(validated.email);
  if (existing) {
    res.status(409).json({
      success: false,
      error: {
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email address is already registered or pending review',
      },
    });
    return;
  }

  let authUserId = `usr-reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // If Supabase is configured, create Supabase user account
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: validated.email,
          password: validated.password,
          options: {
            data: {
              badgeName: validated.badgeName,
              regimentNo: validated.regimentNo,
            },
          },
        });
        if (error) {
          res.status(400).json({
            success: false,
            error: {
              code: 'SIGNUP_FAILED',
              message: error.message,
            },
          });
          return;
        }
        if (data.user?.id) {
          authUserId = data.user.id;
        }
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: {
            code: 'AUTH_ERROR',
            message: err.message || 'Supabase signup error',
          },
        });
        return;
      }
    }
  }

  // Generate unique soldier ID
  const soldierId = `SOL-${Math.floor(200 + Math.random() * 800)}`;
  const now = new Date().toISOString();

  // Create Soldier Profile linked to this registration
  const soldierProfile: SoldierProfile = {
    id: soldierId,
    callsign: validated.badgeName,
    unit: `Regiment ${validated.regimentNo}`,
    status: 'standby',
    authUserId,
    badgeName: validated.badgeName,
    regimentNo: validated.regimentNo,
    heightCm: validated.heightCm,
    weightKg: validated.weightKg,
    ageYears: validated.ageYears,
    profileRecordedAt: now,
    approvalStatus: 'pending',
  };
  db.saveSoldier(soldierProfile);

  // Create Account Profile (approvalStatus is strictly 'pending')
  const registrationId = `reg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const accountProfile: AccountProfile = {
    id: registrationId,
    authUserId,
    email: validated.email,
    role: 'read_only_viewer',
    approvalStatus: 'pending',
    soldierId,
    badgeName: validated.badgeName,
    regimentNo: validated.regimentNo,
    heightCm: validated.heightCm,
    weightKg: validated.weightKg,
    ageYears: validated.ageYears,
    profileRecordedAt: now,
    submittedAt: now,
  };
  db.saveRegistration(accountProfile);

  // Issue pending session token
  const token = `reg-token-${registrationId}`;
  const user: UserProfile = {
    id: authUserId,
    name: validated.badgeName || validated.email.split('@')[0],
    email: validated.email,
    role: 'read_only_viewer',
    status: 'pending',
    approvalStatus: 'pending',
    createdAt: now,
    soldierId,
    badgeName: validated.badgeName,
    regimentNo: validated.regimentNo,
    heightCm: validated.heightCm,
    weightKg: validated.weightKg,
    ageYears: validated.ageYears,
  };

  db.saveUser(user);

  res.status(201).json({
    success: true,
    user,
    data: {
      token,
      user,
      soldier: soldierProfile,
      registrationId,
      message: 'Registration submitted successfully. Account is pending administrator review and approval.',
    },
  });
});

/**
 * POST /api/auth/login
 */
export const DEMO_OFFICIAL_EMAIL = 'demo.official@sentinel-demo.local';
export const DEMO_OFFICIAL_PASSWORD = process.env.DEMO_OFFICIAL_PASSWORD || 'Sentinel#DemoOfficial2026!Local';

authRouter.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, demoRole } = req.body;

  // Demo Official Account Login (strictly isolated to development / testing)
  if (email === DEMO_OFFICIAL_EMAIL) {
    if (!config.enableDemoAuth || config.nodeEnv === 'production') {
      res.status(403).json({
        success: false,
        error: {
          code: 'DEMO_MODE_DISABLED',
          message: 'Demo credentials are not permitted in production environments.',
        },
      });
      return;
    }

    if (password !== DEMO_OFFICIAL_PASSWORD) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid password for Demo Official Account.',
        },
      });
      return;
    }

    const reg = db.getRegistrationByEmail(DEMO_OFFICIAL_EMAIL);
    const user: UserProfile = {
      id: reg?.authUserId || 'usr-demo-official-01',
      name: reg?.badgeName || 'Demo Official',
      email: DEMO_OFFICIAL_EMAIL,
      role: 'operations_officer',
      status: 'approved',
      approvalStatus: 'approved',
      soldierId: reg?.soldierId || 'SOL-002',
      badgeName: reg?.badgeName || 'Demo Official',
      regimentNo: reg?.regimentNo || '042',
      callsign: 'OFFICIAL-DEMO',
      unit: 'Sentinel Demonstration Element',
      createdAt: reg?.submittedAt || '2026-03-30T00:00:00.000Z',
      isDemo: true,
    };

    res.status(200).json({
      success: true,
      data: {
        token: 'dev-demo-official-token',
        user,
        isDemo: true,
        notice: 'DEMO ACCOUNT — NOT FOR OPERATIONAL USE',
      },
    });
    return;
  }

  // 1. Real Supabase Authentication
  if (isSupabaseConfigured() && email && password) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error || !data.session) {
          res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: error?.message || 'Invalid email or password',
            },
          });
          return;
        }

        const user = data.user;
        // Verify server-owned account profile
        const reg = db.getRegistrationByAuthUserId(user.id) || db.getRegistrationByEmail(user.email || '');
        const role: UserRole = reg?.role || 'read_only_viewer';
        const approvalStatus = reg?.approvalStatus || 'pending';

        res.status(200).json({
          success: true,
          data: {
            token: data.session.access_token,
            expiresAt: data.session.expires_at,
            user: {
              id: user.id,
              name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
              email: user.email,
              role,
              status: approvalStatus,
              approvalStatus,
              createdAt: user.created_at || new Date().toISOString(),
              soldierId: reg?.soldierId,
              badgeName: reg?.badgeName,
              regimentNo: reg?.regimentNo,
              callsign: user.user_metadata?.callsign || reg?.badgeName,
              unit: user.user_metadata?.unit || reg?.regimentNo,
            },
          },
        });
        return;
      } catch (err: any) {
        res.status(500).json({
          success: false,
          error: {
            code: 'AUTH_ERROR',
            message: err.message || 'Authentication failed',
          },
        });
        return;
      }
    }
  }

  // 2. Check local database registered users and VitalWatch users
  if (email) {
    const reg = db.getRegistrationByEmail(email);
    const existingUser = db.getUserByEmail(email);

    if (reg) {
      const isApproved = reg.approvalStatus === 'approved' || existingUser?.status === 'approved';
      if (!isApproved) {
        if (reg.approvalStatus === 'rejected' || existingUser?.status === 'rejected') {
          return res.status(403).json({
            success: false,
            status: 'rejected',
            error: 'Account access has been declined by an administrator.',
          });
        }
        return res.status(403).json({
          success: false,
          status: 'pending',
          error: 'Account pending administrator approval. An administrator must approve your account before you can access mission data.',
        });
      }
      const user: UserProfile = {
        id: reg.authUserId,
        name: reg.badgeName || existingUser?.name || reg.email.split('@')[0],
        email: reg.email,
        role: reg.role,
        status: 'approved',
        approvalStatus: 'approved',
        createdAt: reg.submittedAt || existingUser?.createdAt || new Date().toISOString(),
        soldierId: reg.soldierId,
        badgeName: reg.badgeName,
        regimentNo: reg.regimentNo,
        heightCm: reg.heightCm,
        weightKg: reg.weightKg,
        ageYears: reg.ageYears,
      };

      const token = `reg-token-${reg.id}`;
      return res.status(200).json({
        success: true,
        user,
        data: {
          token,
          user,
        },
      });
    }

    if (existingUser) {
      if (existingUser.status === 'pending') {
        return res.status(403).json({
          success: false,
          status: 'pending',
          user: existingUser,
          error: 'Account pending administrator approval. An administrator must approve your account before you can access mission data.',
        });
      }
      if (existingUser.status === 'rejected') {
        return res.status(403).json({
          success: false,
          status: 'rejected',
          error: 'Account access has been declined by an administrator.',
        });
      }
      const token = `token-${existingUser.id}`;
      return res.status(200).json({
        success: true,
        user: existingUser,
        data: {
          token,
          user: existingUser,
        },
      });
    }
  }

  // 3. Demo role authentication (isolated and strictly gated by server configuration)
  if (config.enableDemoAuth && config.nodeEnv !== 'production') {
    const role: UserRole = (demoRole && ['administrator', 'operations_officer', 'medical_officer', 'read_only_viewer'].includes(demoRole))
      ? demoRole
      : (email && email.includes('admin'))
      ? 'administrator'
      : (email && email.includes('ops'))
      ? 'operations_officer'
      : (email && email.includes('med'))
      ? 'medical_officer'
      : 'read_only_viewer';

    const token = role === 'administrator'
      ? 'dev-admin-token'
      : role === 'operations_officer'
      ? 'dev-ops-token'
      : role === 'medical_officer'
      ? 'dev-medical-token'
      : 'dev-viewer-token';

    const user: UserProfile = {
      id: `usr-${role}-demo`,
      name: `Demo ${role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
      email: email || `${role}@sentinel.mil`,
      role,
      status: 'approved',
      approvalStatus: 'approved',
      createdAt: '2026-10-25T00:00:00.000Z',
      callsign: role === 'administrator' ? 'COMMAND-1' : role === 'operations_officer' ? 'TACTICAL-OPS' : role === 'medical_officer' ? 'MEDEVAC-LEAD' : 'OBSERVER-SIT',
      unit: role === 'medical_officer' ? 'Forward Triage & Health Monitoring' : 'Field Operations Group',
      isDemo: true,
    };

    res.status(200).json({
      success: true,
      data: {
        token,
        isDemoSession: true,
        user,
      },
    });
    return;
  }

  res.status(401).json({
    success: false,
    error: {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials or demo authentication disabled',
    },
  });
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/logout', async (_req: AuthenticatedRequest, res: Response) => {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }
  }

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * GET /api/auth/me
 */
authRouter.get('/me', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'No active authenticated session',
      },
    });
    return;
  }

  // Refresh server-owned approval status if available
  if (req.user.id) {
    const reg = db.getRegistrationByAuthUserId(req.user.id) || db.getRegistrationByEmail(req.user.email);
    if (reg) {
      req.user.approvalStatus = reg.approvalStatus;
      req.user.role = reg.role;
      req.user.soldierId = reg.soldierId;
      req.user.badgeName = reg.badgeName;
      req.user.regimentNo = reg.regimentNo;
      req.user.heightCm = reg.heightCm;
      req.user.weightKg = reg.weightKg;
      req.user.ageYears = reg.ageYears;
    }
  }

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});

