import { Router, Response } from 'express';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabaseClient';
import { AuthenticatedRequest } from '../middleware/auth';
import { UserRole, UserProfile } from '../../../shared/types';

export const authRouter = Router();

authRouter.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  const { email, password, demoRole } = req.body;

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
        const role: UserRole = user.app_metadata?.role || user.user_metadata?.role || 'read_only_viewer';

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
              status: 'approved',
              createdAt: user.created_at || new Date().toISOString(),
              callsign: user.user_metadata?.callsign,
              unit: user.user_metadata?.unit,
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

  // 2. Demo role authentication (air-gap, offline, development)
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
    createdAt: '2026-10-25T00:00:00.000Z',
    callsign: role === 'administrator' ? 'COMMAND-1' : role === 'operations_officer' ? 'TACTICAL-OPS' : role === 'medical_officer' ? 'MEDEVAC-LEAD' : 'OBSERVER-SIT',
    unit: role === 'medical_officer' ? 'Forward Triage & Health Monitoring' : 'Field Operations Group',
  };

  res.status(200).json({
    success: true,
    data: {
      token,
      isDemoSession: !isSupabaseConfigured(),
      user,
    },
  });
});

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

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
});
