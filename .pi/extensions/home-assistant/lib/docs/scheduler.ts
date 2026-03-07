/**
 * Docs auto-update scheduler.
 *
 * - On first startup (no index): fetches immediately from GitHub
 * - Daily at configured hour (default 2AM): refreshes index + clears content cache
 *
 * Runs as a background interval, cleaned up on session shutdown.
 */
import { DOCS_UPDATE_HOUR } from "../config.js";
import { indexExists, saveIndex, clearIndexCache } from "./cache.js";
import { buildFromGitHub } from "./builder.js";
import { clearCache } from "./content.js";

let timer: ReturnType<typeof setInterval> | null = null;
let lastUpdate: string | null = null;
let updating = false;

async function doUpdate(reason: string): Promise<void> {
  if (updating) return;
  updating = true;
  try {
    console.log(`[ha-docs] ${reason} — fetching index from GitHub...`);
    const index = await buildFromGitHub((msg) => console.log(`[ha-docs] ${msg}`));
    await saveIndex(index);
    await clearCache();
    clearIndexCache();
    lastUpdate = new Date().toISOString();
    const count = Object.keys(index.integrations).length;
    console.log(`[ha-docs] Index updated: ${count} integrations.`);
  } catch (err: any) {
    console.error(`[ha-docs] Update failed: ${err.message}`);
  } finally {
    updating = false;
  }
}

/**
 * Start the docs scheduler.
 * - If no index exists, fetches immediately.
 * - Schedules daily check every hour (fires when current hour matches DOCS_UPDATE_HOUR).
 */
export async function startScheduler(): Promise<void> {
  // First startup — seed the index if missing
  const exists = await indexExists();
  if (!exists) {
    // Fire and forget — don't block extension startup
    doUpdate("First startup — no index found");
  }

  // Check every hour if it's time to update
  timer = setInterval(async () => {
    const hour = new Date().getHours();
    if (hour === DOCS_UPDATE_HOUR) {
      // Only update once per day — check if we already updated today
      const today = new Date().toISOString().slice(0, 10);
      if (lastUpdate?.startsWith(today)) return;
      await doUpdate(`Scheduled daily update (${DOCS_UPDATE_HOUR}:00)`);
    }
  }, 60 * 60 * 1000); // Check every hour
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
