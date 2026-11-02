import express from 'express';
import { config } from './config';
import { errorHandler } from './http';
import { rateLimit, requireAuth, securityHeaders } from './security/middleware';
import { systemRoutes } from './routes/systemRoutes';
import { publicAuthRoutes, accountRoutes } from './routes/authRoutes';
import { caseRoutes } from './routes/caseRoutes';
import { kanoonRoutes } from './routes/kanoonRoutes';
import { legalRoutes } from './routes/legalRoutes';
import { runHearingReminders } from './services/caseUpdateService';

/** Builds the Express app with every /api route mounted. Front-end serving is added by the caller. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy && !['0', 'false', 'no'].includes(config.trustProxy.toLowerCase())) {
    app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? parseInt(config.trustProxy, 10) : config.trustProxy);
  }

  app.use(securityHeaders);
  // Case payloads can carry full judgment text
  app.use(express.json({ limit: '5mb' }));

  // --- Public ---
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  // Scheduled hearing reminders (Vercel Cron, which sends CRON_SECRET as a Bearer token)
  app.get('/api/cron/hearing-reminders', async (req, res) => {
    if (!config.cronSecret || req.headers.authorization !== `Bearer ${config.cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const result = await runHearingReminders();
      res.json({ success: true, sentCount: result.sentCount });
    } catch (err) {
      console.error('[CRON] Hearing reminders failed:', err);
      res.status(500).json({ error: 'Hearing reminder run failed' });
    }
  });

  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 600, message: 'Too many requests. Please slow down.' }));
  app.use('/api', publicAuthRoutes);

  // --- Signed-in users only ---
  app.use('/api', requireAuth);
  app.use('/api', accountRoutes);
  app.use('/api', systemRoutes);
  app.use('/api', legalRoutes);
  app.use('/api/cases', caseRoutes);
  app.use('/api/indiankanoon', kanoonRoutes);

  // Fallback 404 for any unhandled /api routes - ensure they never return HTML
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} not found` });
  });
  app.use('/api', errorHandler(config.isProduction));

  return app;
}
