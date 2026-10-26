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
import { authRouter, vitalWatchRouter } from './routes/vitalWatchRoutes';
import { soldierVitalsRouter } from './routes/soldierVitalsRoutes';
import { authenticateToken, requireRole } from './middleware/auth';
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

  // SSE Stream Endpoint
  app.get('/api/events', (req: Request, res: Response) => {
    sseManager.handleConnection(req, res);
  });

  // Global Authentication Token Parser for all API endpoints
  app.use('/api', authenticateToken);

  // Mount API Routers
  app.use('/api/auth', authRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/incidents', incidentRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/telemetry', telemetryRouter);
  app.use('/api/alerts', alertRouter);
  app.use('/api/geointel', geoIntelRouter);
  app.use('/api', mediRouteRouter);
  app.use('/api/demo', requireRole(['administrator', 'admin']), demoRouter);
  app.use('/api/vitalwatch', vitalWatchRouter);
  app.use('/api/vitals', soldierVitalsRouter);

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
