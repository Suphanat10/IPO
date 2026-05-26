import { query, isDatabaseConfigured } from "./db";
import { triggerScrape } from "./scraper-runner";
import {
  findDueScheduleSlot,
  getBangkokClockParts,
  scheduleSlotKey,
  type BangkokClockParts,
} from "./scraper-scheduler-clock";

type ScheduleRow = { hour: number; minute: number; enabled: boolean };
type RunningRow = { cnt: string };

const CHECK_INTERVAL_MS = 60_000;

let lastTriggeredKey = "";
let intervalId: ReturnType<typeof setInterval> | null = null;

async function tick(now: BangkokClockParts = getBangkokClockParts()) {
  if (!isDatabaseConfigured()) return;

  try {
    const slots = await query<ScheduleRow>(
      "SELECT hour, minute, enabled FROM scraper_schedule WHERE enabled = true",
    );

    const matched = findDueScheduleSlot(slots, now);
    if (!matched) return;

    const matchKey = scheduleSlotKey(matched);
    if (matchKey === lastTriggeredKey) return;

    const running = await query<RunningRow>(
      "SELECT COUNT(*)::text AS cnt FROM scrape_runs WHERE status = 'running'",
    );
    if (Number(running[0]?.cnt) > 0) {
      console.log(`[scraper-scheduler] Skipping ${matchKey} -- another scrape is still running`);
      return;
    }

    lastTriggeredKey = matchKey;
    console.log(`[scraper-scheduler] Triggering scheduled scrape at ${now.key} (Bangkok) for slot ${matchKey}`);

    await triggerScrape(`scheduler (${matchKey})`);
  } catch (err) {
    console.error("[scraper-scheduler] Error during tick:", err);
  }
}

function resetLastTriggered(now: BangkokClockParts = getBangkokClockParts()) {
  if (lastTriggeredKey && lastTriggeredKey !== `${now.hour}:${now.minute}`) {
    lastTriggeredKey = "";
  }
}

export async function runSchedulerTickForTest(now: Date) {
  await tick(getBangkokClockParts(now));
}

export function resetSchedulerStateForTest() {
  lastTriggeredKey = "";
}

export function startScheduler() {
  if (intervalId != null) return;

  console.log("[scraper-scheduler] Starting scheduler (checking every 60s, Bangkok time)");

  intervalId = setInterval(() => {
    resetLastTriggered();
    void tick();
  }, CHECK_INTERVAL_MS);

  setTimeout(() => void tick(), 5_000);
}

export function stopScheduler() {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[scraper-scheduler] Scheduler stopped");
  }
}
