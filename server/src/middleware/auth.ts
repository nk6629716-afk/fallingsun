/**
 * SENTINEL Authentication & RBAC Middleware
 * Verifies Supabase JWT access tokens on the server and enforces role-based access control.
 * Roles: 'administrator' | 'operations_officer' | 'medical_officer' | 'read_only_viewer'
 */

import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabaseClient';
import { UserRole, UserProfile } from '../../../shared/types';
import { config } from '../config';
import { db } from '../db/database';
import { getSessionUser } from '../services/localAuthService';
import { getAccountById } from '../services/accountRepository';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

// Development and air-gap demo token definitions
const DEMO_USERS: Record<string, UserProfile> = {
  'dev-admin-token': {
    id: 'usr-admin-01',
    name: 'Cmdr. Vance (Admin)',
    email: 'admin@sentinel.mil',
    role: 'administrator',
    status: 'approved',
    createdAt: '2026-10-25T00:00:00.000Z',
    callsign: 'COMMAND-1',
    unit: 'HQ Command Element',
  },
  'dev-ops-token': {
    id: 'usr-ops-02',
    name: 'Maj. Cross (Operations)',
    email: 'ops@sentinel.mil',
    role: 'operations_officer',
    status: 'approved',
    createdAt: '2026-10-25T00:00:00.000Z',
    callsign: 'TACTICAL-OPS',
    unit: 'Airspace & Field Operations',
  },
  'dev-medical-token': {
    id: 'usr-med-03',
    name: 'Dr. Miller (Medical)',
    email: 'medical@sentinel.mil',
    role: 'medical_officer',
    status: 'approved',
    createdAt: '2026-10-25T00:00:00.000Z',
    callsign: 'MEDEVAC-LEAD',
    unit: 'Forward Triage & Health Monitoring',
  },
  'dev-viewer-token': {
    id: 'usr-view-04',
    name: 'Observer Watch',
    email: 'viewer@sentinel.mil',
    role: 'read_only_viewer',
    status: 'approved',
    createdAt: '2026-10-25T00:00:00.000Z',
    callsign: 'OBSERVER-SIT',
    unit: 'Situational Awareness Watch',
  },
};

/**
 * Parses and verifies authentication token on request.
 * Populates req.user if valid.
 */
export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (token?.startsWith('sentinel-session-')) {
    try {
      const cached = getSessionUser(token);
      const user = cached && isSupabaseConfigured() ? await getAccountById(cached.id) : cached;
      if (user?.status === 'approved') { req.user = user; return next(); }
    } catch {
      res.status(503).json({ success: false, error: 'Account verification is unavailable. Try again.' });
      return;
    }
    res.status(401).json({ success: false, error: 'Session expired or approval revoked. Sign in again.' });
    return;
  }

  // 1. Check for demo / dev tokens (allowed only in non-production without a configured provider)
  if (token && DEMO_USERS[token] && config.nodeEnv !== 'production' && !isSupabaseConfigured()) {
    req.user = DEMO_USERS[token];
    return next();
  }

  // 2. Real Supabase Auth verification
  if (token && isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          const approvedUser = await getAccountById(user.id);
          if (!approvedUser || approvedUser.status !== 'approved') {
            res.status(403).json({ success: false, error: 'Administrator approval is required.' });
            return;
          }
          req.user = approvedUser;
          return next();
        }
      } catch (err) {
        // Fall through to unauthenticated handling
      }
    }
  }

  if (token) {
    res.status(401).json({ success: false, error: 'Invalid session. Sign in again.' });
    return;
  }

  // 3. Automated testing & local air-gap test fallback
  if (config.nodeEnv === 'test') {
    // In test environment, assign default administrator role so unit tests pass without internet credentials
    req.user = DEMO_USERS['dev-admin-token'];
    return next();
  }

  // In development mode without credentials, allow dev role header or default to admin for local eval
  if (config.nodeEnv !== 'production' && !isSupabaseConfigured()) {
    const devRoleHeader = req.headers['x-sentinel-dev-role'];
    if (typeof devRoleHeader === 'string' && ['administrator', 'operations_officer', 'medical_officer', 'read_only_viewer'].includes(devRoleHeader)) {
      req.user = {
        id: `usr-dev-${devRoleHeader}`,
        name: `Dev ${devRoleHeader}`,
        email: `${devRoleHeader}@sentinel.local`,
        role: devRoleHeader as UserRole,
        status: 'approved',
        createdAt: '2026-10-25T00:00:00.000Z',
      };
    } else {
      req.user = DEMO_USERS['dev-admin-token'];
    }
    return next();
  }

  next();
}

/**
 * Enforces that a valid authenticated session exists.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required to access this endpoint',
      },
    });
    return;
  }
  next();
}

/**
 * Enforces least-privilege role-based access.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required to access this operational capability',
        },
      });
      return;
    }

    const role = req.user.role;
    const canonical = role === 'admin' ? 'administrator' : role === 'medic' ? 'medical_officer' : role === 'commander' ? 'operations_officer' : role === 'operator' ? 'read_only_viewer' : role;
    if (!allowedRoles.includes(role) && !allowedRoles.includes(canonical)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of [${allowedRoles.join(', ')}], current role is '${req.user.role}'.`,
        },
      });
      return;
    }

    next();
  };
}
