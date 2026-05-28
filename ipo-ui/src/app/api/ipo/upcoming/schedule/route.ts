import { query, isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

type ScheduleRow = {
  id: number;
  hour: number;
  minute: number;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
};

export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database is not configured." }, { status: 503 });
  }

  const rows = await query<ScheduleRow>(
    "SELECT id, hour, minute, enabled, updated_by, updated_at FROM scraper_schedule ORDER BY hour, minute",
  );

  return Response.json({ slots: rows });
}

export async function PUT(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database is not configured." }, { status: 503 });
  }

  const body = await request.json() as {
    slots: { hour: number; minute: number; enabled: boolean }[];
  };

  if (!Array.isArray(body.slots) || body.slots.length === 0 || body.slots.length > 6) {
    return Response.json(
      { error: "ต้องมี 1-6 ช่วงเวลา / Must have 1-6 schedule slots" },
      { status: 400 },
    );
  }

  for (const slot of body.slots) {
    if (
      typeof slot.hour !== "number" || slot.hour < 0 || slot.hour > 23 ||
      typeof slot.minute !== "number" || slot.minute < 0 || slot.minute > 59
    ) {
      return Response.json(
        { error: "เวลาไม่ถูกต้อง / Invalid time value" },
        { status: 400 },
      );
    }
  }

  const seen = new Set<string>();
  for (const slot of body.slots) {
    const key = `${slot.hour}:${slot.minute}`;
    if (seen.has(key)) {
      return Response.json(
        { error: "มีเวลาซ้ำกัน / Duplicate time slots" },
        { status: 400 },
      );
    }
    seen.add(key);
  }

  await query("DELETE FROM scraper_schedule");

  for (const slot of body.slots) {
    await query(
      "INSERT INTO scraper_schedule (hour, minute, enabled, updated_by, updated_at) VALUES ($1, $2, $3, $4, now())",
      [slot.hour, slot.minute, slot.enabled, "admin"],
    );
  }

  const rows = await query<ScheduleRow>(
    "SELECT id, hour, minute, enabled, updated_by, updated_at FROM scraper_schedule ORDER BY hour, minute",
  );

  return Response.json({ slots: rows });
}
