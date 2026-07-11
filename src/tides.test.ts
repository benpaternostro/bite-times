import { describe, it, expect } from "vitest";
import { calculateSolunarPeriods } from "./index";
import {
  combineSolunarWithTides,
  predictTideEvents,
  type TideEvent,
} from "./tides";

const M2_ONLY = [{ name: "M2", amplitude: 1, phase: 0, speed: 28.984104 }];

describe("predictTideEvents", () => {
  it("predicts alternating semidiurnal extremes for a pure M2 tide", () => {
    const events = predictTideEvents({
      constituents: M2_ONLY,
      start: new Date("2026-01-01T00:00:00Z"),
      end: new Date("2026-01-03T00:00:00Z"),
    });
    // ~7-8 extremes in 48h of a 12.42h cycle
    expect(events.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].type).not.toBe(events[i - 1].type);
      const gapHours =
        (events[i].time.getTime() - events[i - 1].time.getTime()) / 3_600_000;
      expect(gapHours).toBeGreaterThan(5.5);
      expect(gapHours).toBeLessThan(7);
    }
    for (const event of events) {
      // |level| ≈ amplitude (nodal corrections shift it a few percent)
      expect(Math.abs(Math.abs(event.level) - 1)).toBeLessThan(0.2);
      expect(event.timeISO).toBe(event.time.toISOString());
      expect(
        event.type === "high" ? event.level : -event.level,
      ).toBeGreaterThan(0);
    }
  });

  it("rejects an empty constituent list", () => {
    expect(() =>
      predictTideEvents({
        constituents: [],
        start: new Date("2026-01-01T00:00:00Z"),
        end: new Date("2026-01-02T00:00:00Z"),
      }),
    ).toThrow(RangeError);
  });

  it("rejects an inverted date range", () => {
    expect(() =>
      predictTideEvents({
        constituents: M2_ONLY,
        start: new Date("2026-01-02T00:00:00Z"),
        end: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toThrow(RangeError);
  });

  it("rejects a date span longer than 10 years to bound worst-case cost", () => {
    expect(() =>
      predictTideEvents({
        constituents: M2_ONLY,
        start: new Date("2000-01-01T00:00:00Z"),
        end: new Date("2011-01-02T00:00:00Z"), // just over 10 years
      }),
    ).toThrow(RangeError);
  });

  it("accepts a date span right at the 10-year cap", () => {
    const events = predictTideEvents({
      constituents: M2_ONLY,
      start: new Date("2000-01-01T00:00:00Z"),
      end: new Date("2009-12-31T00:00:00Z"), // just under 10 years
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it("shifts every level by exactly the offset, leaving timing and type unchanged", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-03T00:00:00Z");
    const base = predictTideEvents({ constituents: M2_ONLY, start, end });
    const offset = 2.5;
    const shifted = predictTideEvents({
      constituents: M2_ONLY,
      start,
      end,
      offset,
    });
    expect(shifted.length).toBe(base.length);
    expect(shifted.length).toBeGreaterThan(0);
    for (let i = 0; i < base.length; i++) {
      expect(shifted[i].timeISO).toBe(base[i].timeISO);
      expect(shifted[i].type).toBe(base[i].type);
      expect(shifted[i].level - base[i].level).toBeCloseTo(offset, 9);
    }
  });

  it("treats an explicit offset of 0 the same as omitting offset entirely", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-03T00:00:00Z");
    const base = predictTideEvents({ constituents: M2_ONLY, start, end });
    const explicitZero = predictTideEvents({
      constituents: M2_ONLY,
      start,
      end,
      offset: 0,
    });
    expect(explicitZero.length).toBe(base.length);
    for (let i = 0; i < base.length; i++) {
      expect(explicitZero[i].timeISO).toBe(base[i].timeISO);
      expect(explicitZero[i].type).toBe(base[i].type);
      expect(explicitZero[i].level).toBeCloseTo(base[i].level, 9);
    }
  });

  it("still produces a strictly alternating high/low sequence with multiple combined constituents", () => {
    const multi = [
      { name: "M2", amplitude: 1, phase: 0, speed: 28.984104 },
      { name: "S2", amplitude: 0.3, phase: 45, speed: 30 },
      { name: "K1", amplitude: 0.15, phase: 200, speed: 15.041069 },
    ];
    const events = predictTideEvents({
      constituents: multi,
      start: new Date("2026-01-01T00:00:00Z"),
      end: new Date("2026-01-05T00:00:00Z"),
    });
    expect(events.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].type).not.toBe(events[i - 1].type);
      expect(events[i].time.getTime()).toBeGreaterThan(
        events[i - 1].time.getTime(),
      );
    }
  });

  it("silently includes a zero-amplitude constituent without altering the result", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-03T00:00:00Z");
    const withoutZero = predictTideEvents({
      constituents: M2_ONLY,
      start,
      end,
    });
    const withZero = predictTideEvents({
      constituents: [
        ...M2_ONLY,
        { name: "S2", amplitude: 0, phase: 90, speed: 30 },
      ],
      start,
      end,
    });
    expect(withZero.length).toBe(withoutZero.length);
    expect(withZero.length).toBeGreaterThan(0);
    for (let i = 0; i < withZero.length; i++) {
      expect(withZero[i].timeISO).toBe(withoutZero[i].timeISO);
      expect(withZero[i].type).toBe(withoutZero[i].type);
      expect(withZero[i].level).toBeCloseTo(withoutZero[i].level, 9);
    }
  });
});

describe("combineSolunarWithTides", () => {
  const solunar = calculateSolunarPeriods(
    -33.8568,
    151.2153,
    new Date("2026-01-31T00:00:00Z"),
    "Australia/Sydney",
  );

  it("flags periods that coincide with a tide change", () => {
    const firstMajor = solunar.majorPeriods[0];
    const during = new Date(Date.parse(firstMajor.startISO) + 30 * 60_000);
    const tides: TideEvent[] = [
      { time: during, timeISO: during.toISOString(), level: 1.2, type: "high" },
    ];
    const combined = combineSolunarWithTides(solunar, tides);
    expect(combined).toHaveLength(
      solunar.majorPeriods.length + solunar.minorPeriods.length,
    );
    const flagged = combined.find(
      (p) => p.periodType === "major" && p.startISO === firstMajor.startISO,
    );
    expect(flagged?.coincidesWithTideChange).toBe(true);
  });

  it("flags nothing when there are no tide events", () => {
    const combined = combineSolunarWithTides(solunar, []);
    expect(combined.every((p) => !p.coincidesWithTideChange)).toBe(true);
  });

  it("flags a tide event outside the raw period but inside the expanded window", () => {
    const firstMajor = solunar.majorPeriods[0];
    // 10 minutes after the period ends — outside [start, end] itself, but
    // inside the default ±60-minute window. Only passes if the window
    // actually expands beyond the raw period.
    const justAfterEnd = new Date(Date.parse(firstMajor.endISO) + 10 * 60_000);
    const tides: TideEvent[] = [
      {
        time: justAfterEnd,
        timeISO: justAfterEnd.toISOString(),
        level: 0.5,
        type: "low",
      },
    ];
    const combined = combineSolunarWithTides(solunar, tides);
    const flagged = combined.find(
      (p) => p.periodType === "major" && p.startISO === firstMajor.startISO,
    );
    expect(flagged?.coincidesWithTideChange).toBe(true);
  });

  it("does not flag a tide event outside the default expanded window", () => {
    const firstMajor = solunar.majorPeriods[0];
    // 90 minutes after the period ends — outside the default ±60-minute window
    const wellAfterEnd = new Date(Date.parse(firstMajor.endISO) + 90 * 60_000);
    const tides: TideEvent[] = [
      {
        time: wellAfterEnd,
        timeISO: wellAfterEnd.toISOString(),
        level: 0.5,
        type: "low",
      },
    ];
    const combined = combineSolunarWithTides(solunar, tides);
    const flagged = combined.find(
      (p) => p.periodType === "major" && p.startISO === firstMajor.startISO,
    );
    expect(flagged?.coincidesWithTideChange).toBe(false);
  });

  it("respects a custom windowMinutes argument", () => {
    const firstMajor = solunar.majorPeriods[0];
    // Same 90-minutes-after-end event as above, which the default 60-minute
    // window excludes — a wider explicit window must now include it.
    const wellAfterEnd = new Date(Date.parse(firstMajor.endISO) + 90 * 60_000);
    const tides: TideEvent[] = [
      {
        time: wellAfterEnd,
        timeISO: wellAfterEnd.toISOString(),
        level: 0.5,
        type: "low",
      },
    ];
    const combined = combineSolunarWithTides(solunar, tides, 120);
    const flagged = combined.find(
      (p) => p.periodType === "major" && p.startISO === firstMajor.startISO,
    );
    expect(flagged?.coincidesWithTideChange).toBe(true);
  });

  it("still yields a plain boolean flag when multiple tide events fall in the same window", () => {
    const firstMajor = solunar.majorPeriods[0];
    const t1 = new Date(Date.parse(firstMajor.startISO) + 10 * 60_000);
    const t2 = new Date(Date.parse(firstMajor.startISO) + 20 * 60_000);
    const tides: TideEvent[] = [
      { time: t1, timeISO: t1.toISOString(), level: 1.1, type: "high" },
      { time: t2, timeISO: t2.toISOString(), level: -0.9, type: "low" },
    ];
    const combined = combineSolunarWithTides(solunar, tides);
    expect(combined).toHaveLength(
      solunar.majorPeriods.length + solunar.minorPeriods.length,
    );
    const flagged = combined.find(
      (p) => p.periodType === "major" && p.startISO === firstMajor.startISO,
    );
    expect(flagged?.coincidesWithTideChange).toBe(true);
    expect(typeof flagged?.coincidesWithTideChange).toBe("boolean");
  });

  it("preserves every original SolunarPeriod field unchanged on the returned period", () => {
    const combined = combineSolunarWithTides(solunar, []);
    solunar.majorPeriods.forEach((original, i) => {
      const result = combined[i];
      expect(result.start).toBe(original.start);
      expect(result.end).toBe(original.end);
      expect(result.startISO).toBe(original.startISO);
      expect(result.endISO).toBe(original.endISO);
    });
    const minorOffset = solunar.majorPeriods.length;
    solunar.minorPeriods.forEach((original, i) => {
      const result = combined[minorOffset + i];
      expect(result.start).toBe(original.start);
      expect(result.end).toBe(original.end);
      expect(result.startISO).toBe(original.startISO);
      expect(result.endISO).toBe(original.endISO);
    });
  });
});
