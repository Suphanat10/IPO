export type ScheduleSlotClock = { hour: number; minute: number; enabled: boolean };
export type BangkokClockParts = { hour: number; minute: number; second: number; key: string };

const BANGKOK_TZ = "Asia/Bangkok";
const MATCH_WINDOW_SECONDS = 90;

export function getBangkokClockParts(now: Date = new Date()): BangkokClockParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BANGKOK_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const vals: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") vals[p.type] = Number(p.value);
  }

  const hour = vals.hour === 24 ? 0 : vals.hour;
  const minute = vals.minute;
  const second = vals.second;
  return { hour, minute, second, key: `${hour}:${minute}` };
}

export function findDueScheduleSlot(
  slots: ScheduleSlotClock[],
  now: BangkokClockParts,
): ScheduleSlotClock | null {
  const totalSeconds = now.hour * 3600 + now.minute * 60 + now.second;

  return slots.find((slot) => {
    if (!slot.enabled) return false;
    const slotSeconds = slot.hour * 3600 + slot.minute * 60;
    const diff = totalSeconds - slotSeconds;
    return diff >= 0 && diff < MATCH_WINDOW_SECONDS;
  }) ?? null;
}

export function scheduleSlotKey(slot: Pick<ScheduleSlotClock, "hour" | "minute">): string {
  return `${slot.hour}:${slot.minute}`;
}
