import { createRouter } from '../http';
import { db } from '../db/database';
import { runHearingReminders } from '../services/caseUpdateService';

export const systemRoutes = createRouter();

// Supabase Connection Status & Diagnostics
systemRoutes.get('/supabase/status', (req, res) => {
  try {
    res.json(db.getSupabaseStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Manual Retry Sync
systemRoutes.post('/supabase/retry', async (req, res) => {
  const status = await db.retrySupabaseSync();
  res.json({ success: true, status });
});

// Hearings API: Get all listings
systemRoutes.get('/hearings', (req, res) => {
  res.json(db.getHearings());
});

// Emails API: View sent emails log
systemRoutes.get('/email-logs', (req, res) => {
  res.json(db.getEmailLogs());
});

// Scheduler API: Trigger automated deadlines/hearings scanner manual check
systemRoutes.post('/scheduler/run', async (req, res) => {
  try {
    const result = await runHearingReminders();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: "Scheduler execution failed" });
  }
});
