import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { healthRouter } from './routes/healthRoutes';
import { dashboardRouter } from './routes/dashboardRoutes';
import { incidentRouter } from './routes/incidentRoutes';
import { syncRouter } from './routes/syncRoutes';
import { telemetryRouter } from './routes/telemetryRoutes';
import { alertRouter } from './routes/alertRoutes';
import { geoIntelRouter } from './routes/geoIntelRoutes';
import { mediRouteRouter } from './routes/mediRouteRoutes';
import { demoRouter } from './routes/demoRoutes';
import { authRouter } from './routes/authRoutes';
import { adminRouter } from './routes/adminRoutes';
import { authRouter as vitalWatchAuthRouter, vitalWatchRouter } from './routes/vitalWatchRoutes';
import { soldierVitalsRouter } from './routes/soldierVitalsRoutes';
import { activityRiskRouter } from './routes/activityRiskRoutes';
import { authenticateToken, requireAuth, requireApproved, requireRole } from './middleware/auth';
import { sseManager } from './realtime/sseHandler';
import { ValidationError } from './validation/validators';
import { ERROR_CODES } from '../../shared/contracts';

export function createApp(): express.Application {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Global Authentication Token Parser for all API endpoints
  app.use('/api', authenticateToken);

  // Public / Auth Handlers
  app.use('/api/auth', authRouter);
  app.use('/api/auth', vitalWatchAuthRouter);
  app.use('/api/health', healthRouter);
  // Authenticated & Approved SSE Stream Endpoint
  app.get('/api/events', requireAuth, requireApproved, (req: Request, res: Response) => {
    sseManager.handleConnection(req, res);
  });

  // Protected Operational API Routers (Gated by requireAuth & requireApproved)
  app.use('/api/dashboard', requireAuth, requireApproved, dashboardRouter);
  app.use('/api/incidents', requireAuth, requireApproved, incidentRouter);
  app.use('/api/sync', requireAuth, requireApproved, syncRouter);
  app.use('/api/telemetry', requireAuth, requireApproved, telemetryRouter);
  app.use('/api/alerts', requireAuth, requireApproved, alertRouter);
  app.use('/api/geointel', requireAuth, requireApproved, geoIntelRouter);
  app.use('/api', requireAuth, requireApproved, mediRouteRouter);
  app.use('/api/vitals', requireAuth, requireApproved, soldierVitalsRouter);
  app.use('/api/vitalwatch', requireAuth, requireApproved, vitalWatchRouter);
  app.use('/api', requireAuth, requireApproved, activityRiskRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/demo', requireAuth, requireApproved, requireRole(['administrator', 'admin']), demoRouter);

  // 404 Handler for undefined API routes
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `API endpoint ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  // Static frontend assets serving (Vite production build)
  const possibleDistPaths = [
    path.resolve(process.cwd(), '../dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirname, '../../../dist'),
    path.resolve(__dirname, '../../../../dist'),
  ];
  const frontendDistPath = possibleDistPaths.find((p) => fs.existsSync(path.join(p, 'index.html')));

  if (frontendDistPath) {
    app.use(express.static(frontendDistPath));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  } else {
    app.get('/', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'ok',
        service: 'sentinel-backend',
        version: '1.0.0',
        message: 'SENTINEL API Service is active. Access /api/health for system status.',
      });
    });
  }

  // Global Error Handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
      return;
    }

    // Handle bad JSON body syntax from express.json
    if ('type' in err && (err as any).type === 'entity.parse.failed') {
      res.status(400).json({
        success: false,
        error: {
          code: ERROR_CODES.BAD_REQUEST,
          message: 'Malformed JSON payload in request body',
        },
      });
      return;
    }

    console.error('[SERVER ERROR]', err);
    res.status(500).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: config.nodeEnv === 'production' ? 'An internal server error occurred' : err.message,
      },
    });
  });

  return app;
}

export const app = createApp();
