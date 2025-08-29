// used-cars/api/src/routes/jobs.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { processDueSavedSearches } from '../jobs/alertsRunner';

const prisma = new PrismaClient();
export const jobsRouter = Router();

/**
 * POST /jobs/alerts/run
 * Requires header: x-cron-secret = <your .env CRON_SECRET>
 * Runs the alerts job once (checks due saved searches and writes AlertEvents).
 */
jobsRouter.post('/alerts/run', async (req, res) => {
  try {
    const hdr = String(req.headers['x-cron-secret'] || '');
    const want = String(process.env.CRON_SECRET || '');
    if (!want || hdr !== want) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const result = await processDueSavedSearches(prisma);
    // result typically: { processed: number, wrote: number, ... }
    res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[jobs] alerts/run error:', e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});
