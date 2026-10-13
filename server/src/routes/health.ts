import { Router } from 'express';
import { pool } from '../db';

export const healthRouter = Router();

/** Liveness: is the process up? Use this for the platform health check so a DB blip does not restart the app. */
healthRouter.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

/** Readiness: can we reach the database? */
healthRouter.get('/api/health', async (_req, res) => {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 2000)),
    ]);
    res.json({ ok: true, db: 'up', pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});
