import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, requireApproved, requireRole } from '../middleware/auth';
import { db } from '../db/database';
import { validateDecisionInput } from '../validation/validators';
import { RegistrationDecisionAudit, ApprovalStatus } from '../../../shared/types';

export const adminRouter = Router();

// Apply auth, approved, and administrator role checks to all /api/admin routes
adminRouter.use(requireAuth, requireApproved, requireRole(['administrator']));

/**
 * GET /api/admin/registrations
 * Lists all soldier/staff registrations, optionally filtered by ?status=pending|approved|rejected|suspended
 */
adminRouter.get('/registrations', (req: AuthenticatedRequest, res: Response) => {
  const statusFilter = req.query.status as ApprovalStatus | undefined;
  const list = db.getRegistrations(statusFilter ? { status: statusFilter } : undefined);

  res.status(200).json({
    success: true,
    data: list,
    meta: {
      total: list.length,
      filter: statusFilter || 'all',
    },
  });
});

/**
 * GET /api/admin/registrations/:id
 */
adminRouter.get('/registrations/:id', (req: AuthenticatedRequest, res: Response) => {
  const reg = db.getRegistrationById(req.params.id);
  if (!reg) {
    res.status(404).json({
      success: false,
      error: {
        code: 'REGISTRATION_NOT_FOUND',
        message: `Registration with ID ${req.params.id} was not found`,
      },
    });
    return;
  }

  const audits = db.getDecisionAudits(reg.id);

  res.status(200).json({
    success: true,
    data: {
      registration: reg,
      audits,
    },
  });
});

/**
 * PATCH /api/admin/registrations/:id/decision
 * Submits an administrative approval, rejection, or suspension decision.
 */
adminRouter.patch('/registrations/:id/decision', (req: AuthenticatedRequest, res: Response) => {
  const reg = db.getRegistrationById(req.params.id);
  if (!reg) {
    res.status(404).json({
      success: false,
      error: {
        code: 'REGISTRATION_NOT_FOUND',
        message: `Registration with ID ${req.params.id} was not found`,
      },
    });
    return;
  }

  const { decision, reason, role } = validateDecisionInput(req.body);
  const previousStatus = reg.approvalStatus;
  const now = new Date().toISOString();
  const decisionBy = req.user?.email || req.user?.id || 'admin';

  // Update registration record
  reg.approvalStatus = decision;
  reg.reviewedAt = now;
  reg.reviewedBy = decisionBy;
  if (reason) reg.decisionReason = reason;
  if (role) reg.role = role;

  db.saveRegistration(reg);

  // Update corresponding soldier profile
  if (reg.soldierId) {
    const soldier = db.getSoldierById(reg.soldierId);
    if (soldier) {
      soldier.approvalStatus = decision;
      soldier.status = decision === 'approved' ? 'active' : 'standby';
      db.saveSoldier(soldier);
    }
  }

  // Create persistent decision audit record
  const audit: RegistrationDecisionAudit = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    registrationId: reg.id,
    previousStatus,
    newStatus: decision,
    decisionBy,
    decisionAt: now,
    reason,
  };
  db.recordDecisionAudit(audit);

  res.status(200).json({
    success: true,
    data: reg,
    message: `Registration has been successfully ${decision}.`,
  });
});
