/**
 * SENTINEL Authentication & RBAC Middleware
 * Verifies tokens, enforces server-owned roles and approval status,
 * and separates demo fixtures from real authentication.
 */

import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient, isSupabaseConfigured } from '../db/supabaseClient';
import { UserRole, UserProfile, ApprovalStatus } from '../../../shared/types';
import { config } from '../config';
import { db } from '../db/database';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

// Development and air-gap demo token definitions (strictly gated)
export const DEMO_USERS: Record<string, UserProfile> = {
  'dev-admin-token': {
    id: 'usr-admin-01',
    name: 'Cmdr. Vance (Admin)',
    email: 'admin@sentinel.mil',
    role: 'administrator',
    status: 'approved',
    createdAt: '2026-10-25T00:00:00.000Z',
    callsign: 'COMMAND-1',
    unit: 'HQ Command Element',
    approvalStatus: 'approved',
    soldierId: 'SOL-101',
    isDemo: true,
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
    approvalStatus: 'approved',
    soldierId: 'SOL-102',
    isDemo: true,
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
    approvalStatus: 'approved',
    soldierId: 'SOL-103',
    isDemo: true,
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
    approvalStatus: 'approved',
    soldierId: 'SOL-104',
    isDemo: true,
  },
  'dev-pending-token': {
    id: 'usr-pending-05',
    name: 'Pending Recruit',
    email: 'pending@sentinel.mil',
    role: 'read_only_viewer',
    status: 'pending',
    approvalStatus: 'pending',
    createdAt: '2026-10-25T00:00:00.000Z',
    isDemo: true,
  },
  'dev-rejected-token': {
    id: 'usr-rejected-06',
    name: 'Rejected Applicant',
    email: 'rejected@sentinel.mil',
    role: 'read_only_viewer',
    status: 'rejected',
    approvalStatus: 'rejected',
    createdAt: '2026-10-25T00:00:00.000Z',
    isDemo: true,
  },
  'dev-suspended-token': {
    id: 'usr-suspended-07',
    name: 'Suspended Operator',
    email: 'suspended@sentinel.mil',
    role: 'read_only_viewer',
    status: 'suspended',
    approvalStatus: 'suspended',
    createdAt: '2026-10-25T00:00:00.000Z',
    isDemo: true,
  },
};

/**
 * Parses and verifies authentication token on request.
 * Populates req.user if valid.
 */
export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token && typeof req.query?.token === 'string') {
    token = (req.query.token as string).trim();
  }

  // Check if test fallback is disabled via env or header (for negative testing)
  const isFallbackDisabled = config.disableTestFallback || req.headers['x-disable-test-fallback'] === 'true';

  // 1. Check for demo / dev tokens (only if demo auth is enabled and not in production)
  if (token && config.enableDemoAuth && config.nodeEnv !== 'production' && DEMO_USERS[token]) {
    req.user = DEMO_USERS[token];
    return next();
  }

  // 2. Check for local registration session token (e.g. reg-token-<id>)
  if (token && token.startsWith('reg-token-')) {
    const regId = token.replace('reg-token-', '');
    const reg = db.getRegistrationById(regId) || db.getRegistrationByAuthUserId(regId);
    if (reg) {
      req.user = {
        id: reg.authUserId,
        name: reg.badgeName || reg.email.split('@')[0],
        email: reg.email,
        role: reg.role,
        status: reg.approvalStatus,
        approvalStatus: reg.approvalStatus,
        createdAt: reg.submittedAt || new Date().toISOString(),
        soldierId: reg.soldierId,
        badgeName: reg.badgeName,
        regimentNo: reg.regimentNo,
        heightCm: reg.heightCm,
        weightKg: reg.weightKg,
        ageYears: reg.ageYears,
      };
      return next();
    }
  }

  // 3. Real Supabase Auth verification
  if (token && isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) {
          // Look up server-owned profile first for authorization and approval state
          const reg = db.getRegistrationByAuthUserId(user.id) || db.getRegistrationByEmail(user.email || '');

          const role: UserRole = reg?.role || 'read_only_viewer';
          const approvalStatus: ApprovalStatus = reg?.approvalStatus || 'pending';

          req.user = {
            id: user.id,
            name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
            email: user.email || 'authenticated@sentinel.mil',
            role,
            status: approvalStatus,
            approvalStatus,
            createdAt: user.created_at || new Date().toISOString(),
            soldierId: reg?.soldierId,
            badgeName: reg?.badgeName,
            regimentNo: reg?.regimentNo,
            callsign: user.user_metadata?.callsign || reg?.badgeName,
            unit: user.user_metadata?.unit || reg?.regimentNo,
          };
          return next();
        }
      } catch (err) {
        // Fall through
      }
    }
  }

  // If a token was provided but was invalid/unrecognized, do NOT apply default admin fallback!
  if (token) {
    return next();
  }

  // If explicit test fallback is disabled, do not synthesize an admin
  if (isFallbackDisabled) {
    return next();
  }

  // 4. Automated testing air-gap fallback for existing baseline tests
  if (config.nodeEnv === 'test') {
    req.user = DEMO_USERS['dev-admin-token'];
    return next();
  }

  // 5. In local development mode without credentials and without explicit token
  if (config.nodeEnv !== 'production' && !isSupabaseConfigured() && config.enableDemoAuth) {
    const devRoleHeader = req.headers['x-sentinel-dev-role'];
    if (typeof devRoleHeader === 'string' && ['administrator', 'operations_officer', 'medical_officer', 'read_only_viewer'].includes(devRoleHeader)) {
      req.user = {
        id: `usr-dev-${devRoleHeader}`,
        name: `Dev ${devRoleHeader}`,
        email: `${devRoleHeader}@sentinel.local`,
        role: devRoleHeader as UserRole,
        status: 'approved',
        approvalStatus: 'approved',
        createdAt: '2026-10-25T00:00:00.000Z',
        isDemo: true,
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
 * Enforces that the authenticated user has approved status.
 * Rejects pending, rejected, and suspended accounts.
 */
export function requireApproved(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required to access operational data',
      },
    });
    return;
  }

  const status = req.user.approvalStatus || 'pending';
  if (status !== 'approved') {
    res.status(403).json({
      success: false,
      error: {
        code: 'ACCOUNT_NOT_APPROVED',
        message: `Account status is '${status}'. Operational access requires administrative approval.`,
        approvalStatus: status,
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

    if (!allowedRoles.includes(req.user.role)) {
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

