import {
  findDueScheduleSlot,
  getBangkokClockParts,
} from "./scraper-scheduler-clock";

describe("scraper scheduler clock seam", () => {
  const slots = [
    { hour: 8, minute: 0, enabled: true },
    { hour: 17, minute: 30, enabled: true },
  ];

  it("matches the 08:00 Bangkok schedule window without waiting for wall-clock time", () => {
    const now = getBangkokClockParts(new Date("2026-05-26T01:00:30.000Z"));
    const matched = findDueScheduleSlot(slots, now);

    expect(now).toEqual({ hour: 8, minute: 0, second: 30, key: "8:0" });
    expect(matched).toEqual(slots[0]);
  });

  it("matches the 17:30 Bangkok schedule window without waiting for wall-clock time", () => {
    const now = getBangkokClockParts(new Date("2026-05-26T10:30:45.000Z"));
    const matched = findDueScheduleSlot(slots, now);

    expect(now).toEqual({ hour: 17, minute: 30, second: 45, key: "17:30" });
    expect(matched).toEqual(slots[1]);
  });

  it("does not match disabled slots or times outside the 90 second window", () => {
    const disabled = [{ hour: 8, minute: 0, enabled: false }];
    const inWindow = getBangkokClockParts(new Date("2026-05-26T01:00:30.000Z"));
    const outsideWindow = getBangkokClockParts(new Date("2026-05-26T01:02:00.000Z"));

    expect(findDueScheduleSlot(disabled, inWindow)).toBeNull();
    expect(findDueScheduleSlot(slots, outsideWindow)).toBeNull();
  });
});
