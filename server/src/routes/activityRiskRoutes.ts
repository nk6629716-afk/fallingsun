import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, requireApproved } from '../middleware/auth';
import { db } from '../db/database';
import { validateCreateActivityInput } from '../validation/validators';
import { generateActivityRiskReview } from '../services/activityRiskService';
import { SoldierActivity } from '../../../shared/types';

export const activityRiskRouter = Router();

// Gated uniformly: requires authentication and approved account status
activityRiskRouter.use(requireAuth, requireApproved);

/**
 * POST /api/activities
 * Records a new physical activity for an authorized soldier.
 */
activityRiskRouter.post('/activities', (req: AuthenticatedRequest, res: Response) => {
  const validated = validateCreateActivityInput(req.body);
  const currentUser = req.user!;

  // Object-level permission check:
  // A soldier can only submit activities for their own soldierId, unless they are medical_officer or administrator.
  const isSelf = currentUser.soldierId && currentUser.soldierId === validated.soldierId;
  const isPrivilegedStaff = currentUser.role === 'medical_officer' || currentUser.role === 'administrator';

  if (!isSelf && !isPrivilegedStaff) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Cannot record activity logs for another soldier without medical officer or administrator clearance.',
      },
    });
    return;
  }

  const activity: SoldierActivity = {
    id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    soldierId: validated.soldierId,
    activityType: validated.activityType,
    durationMinutes: validated.durationMinutes,
    intensity: validated.intensity,
    carriedLoadKg: validated.carriedLoadKg,
    restRecoveryInfo: validated.restRecoveryInfo,
    environmentalConditions: validated.environmentalConditions,
    notes: validated.notes,
    recordedAt: new Date().toISOString(),
    isSimulated: true,
  };

  const saved = db.saveActivity(activity);

  res.status(201).json({
    success: true,
    data: saved,
  });
});

/**
 * GET /api/activities
 * Retrieves physical activities for a soldier.
 */
activityRiskRouter.get('/activities', (req: AuthenticatedRequest, res: Response) => {
  const soldierId = req.query.soldierId as string | undefined;
  const currentUser = req.user!;

  if (!soldierId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'soldierId query parameter is required',
      },
    });
    return;
  }

  // Ownership check
  const isSelf = currentUser.soldierId && currentUser.soldierId === soldierId;
  const isPrivilegedStaff = currentUser.role === 'medical_officer' || currentUser.role === 'administrator';

  if (!isSelf && !isPrivilegedStaff) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Unauthorized access to another personnel member\'s activity records.',
      },
    });
    return;
  }

  const list = db.getActivitiesBySoldier(soldierId);

  res.status(200).json({
    success: true,
    data: list,
  });
});

/**
 * POST /api/activities/:id/risk-review
 * Requests an AI activity risk advisory analysis using Google Gemini.
 */
activityRiskRouter.post('/activities/:id/risk-review', async (req: AuthenticatedRequest, res: Response) => {
  const activity = db.getActivityById(req.params.id);
  if (!activity) {
    res.status(404).json({
      success: false,
      error: {
        code: 'ACTIVITY_NOT_FOUND',
        message: `Activity record with ID ${req.params.id} was not found`,
      },
    });
    return;
  }

  const currentUser = req.user!;
  const isSelf = currentUser.soldierId && currentUser.soldierId === activity.soldierId;
  const isPrivilegedStaff = currentUser.role === 'medical_officer' || currentUser.role === 'administrator';

  if (!isSelf && !isPrivilegedStaff) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Unauthorized: cannot request AI risk review on another personnel member\'s activity.',
      },
    });
    return;
  }

  // Load server-owned soldier profile (do not trust browser-supplied profile)
  const profile = db.getSoldierById(activity.soldierId);

  // Load authorized recent vitals
  const recentVitals = db.getSoldierVitals(activity.soldierId);

  try {
    const review = await generateActivityRiskReview(activity, profile, recentVitals);
    db.saveActivityReview(review);

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'AI_REVIEW_ERROR',
        message: err.message || 'Failed to generate activity risk review',
      },
    });
  }
});

/**
 * GET /api/activities/:id/risk-review
 */
activityRiskRouter.get('/activities/:id/risk-review', (req: AuthenticatedRequest, res: Response) => {
  const review = db.getActivityReviewByActivityId(req.params.id);
  if (!review) {
    res.status(404).json({
      success: false,
      error: {
        code: 'REVIEW_NOT_FOUND',
        message: `No risk review exists for activity ${req.params.id}`,
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: review,
  });
});
