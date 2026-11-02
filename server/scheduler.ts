import { runHearingReminders } from './services/caseUpdateService';

/** Runs the hearing-reminder scan in the background, skipping a tick if the previous run is still going. */
export function startScheduler(intervalMs = 60_000) {
  let running = false;
  return setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runHearingReminders();
    } catch (e) {
      console.error("[AUTOMATED BG SCHEDULER ERROR]", e);
    } finally {
      running = false;
    }
  }, intervalMs);
}
