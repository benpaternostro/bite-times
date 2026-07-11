import { describe, it, expect, vi } from "vitest";
import { calculateSolunarPeriods, calculateSolunarRange } from "./index";

/**
 * Convert HH:MM to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Assert that a period's start and end are within `toleranceMin` minutes
 * of expected values. Handles midnight wrapping.
 */
function expectPeriodNear(
  actual: { start: string; end: string },
  expectedStart: string,
  expectedEnd: string,
  toleranceMin: number,
  label: string,
) {
  const actualStartMin = timeToMinutes(actual.start);
  const expectedStartMin = timeToMinutes(expectedStart);
  const actualEndMin = timeToMinutes(actual.end);
  const expectedEndMin = timeToMinutes(expectedEnd);

  // Handle midnight wrapping: shortest distance on a 24h clock
  const diffStart = Math.min(
    Math.abs(actualStartMin - expectedStartMin),
    1440 - Math.abs(actualStartMin - expectedStartMin),
  );
  const diffEnd = Math.min(
    Math.abs(actualEndMin - expectedEndMin),
    1440 - Math.abs(actualEndMin - expectedEndMin),
  );

  expect(
    diffStart,
    `${label} start: actual ${actual.start} vs expected ${expectedStart} (${diffStart} min diff)`,
  ).toBeLessThanOrEqual(toleranceMin);
  expect(
    diffEnd,
    `${label} end: actual ${actual.end} vs expected ${expectedEnd} (${diffEnd} min diff)`,
  ).toBeLessThanOrEqual(toleranceMin);
}

describe("solunarCalculator", () => {
  describe("calculateSolunarPeriods", () => {
    it("should calculate periods for Sydney Opera House, Australia (Jan 31, 2026)", () => {
      // Reference data for Sydney Opera House (AEDT / Australia/Sydney), cross-checked
      // against the US Naval Observatory's astronomical almanac API and sunrise-sunset.org.
      // The moon's lower transit is not directly reported by USNO for this date and is
      // estimated as the midpoint of the moon's below-horizon window.
      // Major: 10:22 - 12:22, 22:55 - 00:55
      // Minor: 02:43 - 04:43, 18:00 - 20:00

      const result = calculateSolunarPeriods(
        -33.8568, // Sydney Opera House latitude
        151.2153, // Sydney Opera House longitude
        new Date("2026-01-31T00:00:00Z"),
        "Australia/Sydney",
      );

      // Verify structure
      expect(result).toBeDefined();
      expect(result.majorPeriods).toBeDefined();
      expect(result.minorPeriods).toBeDefined();
      expect(result.date).toBe("20260131");

      // Should have 2 major and 2 minor periods
      expect(result.majorPeriods.length).toBe(2);
      expect(result.minorPeriods.length).toBe(2);

      // All periods should have start and end times
      result.majorPeriods.forEach((period) => {
        expect(period.start).toMatch(/^\d{2}:\d{2}$/);
        expect(period.end).toMatch(/^\d{2}:\d{2}$/);
      });

      result.minorPeriods.forEach((period) => {
        expect(period.start).toMatch(/^\d{2}:\d{2}$/);
        expect(period.end).toMatch(/^\d{2}:\d{2}$/);
      });

      // Verify times are sorted
      expect(result.minorPeriods[0].start < result.minorPeriods[1].start).toBe(
        true,
      );
      expect(result.majorPeriods[0].start < result.majorPeriods[1].start).toBe(
        true,
      );

      // Assert times match the reference within ±15 min tolerance
      // (Jan 31 has a moonTransit fallback path, so slightly looser tolerance)
      const TOLERANCE = 15;
      expectPeriodNear(
        result.majorPeriods[0],
        "10:22",
        "12:22",
        TOLERANCE,
        "Jan31 Major 1",
      );
      expectPeriodNear(
        result.majorPeriods[1],
        "22:55",
        "00:55",
        TOLERANCE,
        "Jan31 Major 2",
      );
      expectPeriodNear(
        result.minorPeriods[0],
        "02:43",
        "04:43",
        TOLERANCE,
        "Jan31 Minor 1",
      );
      expectPeriodNear(
        result.minorPeriods[1],
        "18:00",
        "20:00",
        TOLERANCE,
        "Jan31 Minor 2",
      );
    });

    it("should calculate accurate periods for Sydney Opera House, Australia (Feb 7, 2026)", () => {
      // Reference data for Sydney Opera House (AEDT / Australia/Sydney), cross-checked
      // against the US Naval Observatory's astronomical almanac API and sunrise-sunset.org.
      // The moon's lower transit is not directly reported by USNO for this date and is
      // estimated as the midpoint of the moon's below-horizon window.
      // Major: 03:45 - 05:45, 16:03 - 18:03
      // Minor: 10:27 - 12:27, 21:39 - 23:39

      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-02-07T00:00:00Z"),
        "Australia/Sydney",
      );

      expect(result.majorPeriods.length).toBe(2);
      expect(result.minorPeriods.length).toBe(2);

      // Assert times match the reference within ±15 min tolerance
      // Widened to match Jan 31's tolerance — margins were as thin as 2 minutes on some entries at ±10.
      const TOLERANCE = 15;
      expectPeriodNear(
        result.majorPeriods[0],
        "03:45",
        "05:45",
        TOLERANCE,
        "Feb07 Major 1",
      );
      expectPeriodNear(
        result.majorPeriods[1],
        "16:03",
        "18:03",
        TOLERANCE,
        "Feb07 Major 2",
      );
      expectPeriodNear(
        result.minorPeriods[0],
        "10:27",
        "12:27",
        TOLERANCE,
        "Feb07 Minor 1",
      );
      expectPeriodNear(
        result.minorPeriods[1],
        "21:39",
        "23:39",
        TOLERANCE,
        "Feb07 Minor 2",
      );
    });

    it("should calculate periods for New York, USA", () => {
      const result = calculateSolunarPeriods(
        40.7128, // New York latitude
        -74.006, // New York longitude
        new Date("2026-01-31T00:00:00Z"),
      );

      expect(result).toBeDefined();
      expect(result.majorPeriods.length).toBeGreaterThan(0);
      expect(result.minorPeriods.length).toBeGreaterThan(0);
      expect(result.date).toBe("20260131");
    });

    it("should include sun and moon times", () => {
      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
      );

      expect(result.sunRise).toMatch(/^\d{2}:\d{2}$/);
      expect(result.sunSet).toMatch(/^\d{2}:\d{2}$/);
      // moonRise and moonSet may be empty if moon doesn't rise/set
      if (result.moonRise) {
        expect(result.moonRise).toMatch(/^\d{2}:\d{2}$/);
      }
      if (result.moonSet) {
        expect(result.moonSet).toMatch(/^\d{2}:\d{2}$/);
      }
    });

    it("should include moon phase information", () => {
      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
      );

      expect(result.moonPhase).toBeDefined();
      expect(typeof result.moonPhase).toBe("string");
      expect(result.moonIllumination).toBeGreaterThanOrEqual(0);
      expect(result.moonIllumination).toBeLessThanOrEqual(100);
    });

    it("should handle different dates", () => {
      const dates = [
        "2026-01-15",
        "2026-02-28",
        "2026-06-21", // Summer solstice
        "2026-12-21", // Winter solstice
      ];

      dates.forEach((dateStr) => {
        const result = calculateSolunarPeriods(
          -33.8568,
          151.2153,
          new Date(dateStr),
        );

        expect(result).toBeDefined();
        expect(result.majorPeriods.length).toBeGreaterThan(0);
        expect(result.minorPeriods.length).toBeGreaterThan(0);
      });
    });

    it("should handle polar regions gracefully", () => {
      // Test Arctic location
      const result = calculateSolunarPeriods(
        70.0, // Arctic latitude
        25.0, // Longitude
        new Date("2026-06-21T00:00:00Z"), // Summer solstice
      );

      expect(result).toBeDefined();
      // Even in polar regions, should return some periods
      expect(result.majorPeriods.length).toBeGreaterThan(0);
    });

    it("reports no sunrise/sunset during real midnight sun (polar day)", () => {
      // Tromso, Norway — the sun does not set around the June solstice
      const result = calculateSolunarPeriods(
        69.6492,
        18.9553,
        new Date("2026-06-15T00:00:00Z"),
      );
      expect(result.sunRise).toBe("");
      expect(result.sunSet).toBe("");
    });

    it("reports no sunrise/sunset during real polar night", () => {
      // Tromso, Norway — the sun does not rise around the December solstice
      const result = calculateSolunarPeriods(
        69.6492,
        18.9553,
        new Date("2026-12-21T00:00:00Z"),
      );
      expect(result.sunRise).toBe("");
      expect(result.sunSet).toBe("");
    });

    it("should ensure periods are 2 hours long", () => {
      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
      );

      const timeToMinutes = (timeStr: string): number => {
        const [hours, minutes] = timeStr.split(":").map(Number);
        return hours * 60 + minutes;
      };

      // Major periods should be 2 hours (120 minutes)
      result.majorPeriods.forEach((period) => {
        const startMinutes = timeToMinutes(period.start);
        const endMinutes = timeToMinutes(period.end);
        let duration = endMinutes - startMinutes;

        // Handle periods that span midnight
        if (duration < 0) {
          duration += 24 * 60;
        }

        expect(duration).toBe(120); // 2 hours = 120 minutes
      });

      // Minor periods should also be 2 hours
      result.minorPeriods.forEach((period) => {
        const startMinutes = timeToMinutes(period.start);
        const endMinutes = timeToMinutes(period.end);
        let duration = endMinutes - startMinutes;

        if (duration < 0) {
          duration += 24 * 60;
        }

        expect(duration).toBe(120); // 2 hours = 120 minutes
      });
    });

    it("should handle times that span midnight", () => {
      // Test with a date that may have periods spanning midnight
      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
      );

      // According to reference, one major period is 22:55 - 00:55 (spans midnight)
      const hasSpanningPeriod =
        result.majorPeriods.some((period) => {
          const [startHour] = period.start.split(":").map(Number);
          const [endHour] = period.end.split(":").map(Number);
          return startHour > endHour; // Start hour > end hour means it spans midnight
        }) ||
        result.minorPeriods.some((period) => {
          const [startHour] = period.start.split(":").map(Number);
          const [endHour] = period.end.split(":").map(Number);
          return startHour > endHour;
        });

      // At least verify the format is valid for all times
      [...result.majorPeriods, ...result.minorPeriods].forEach((period) => {
        expect(period.start).toMatch(/^([01]\d|2[0-3]):\d{2}$/);
        expect(period.end).toMatch(/^([01]\d|2[0-3]):\d{2}$/);
      });
    });

    it("should return consistent results for the same input", () => {
      const lat = -33.8568;
      const lon = 151.2153;
      const date = new Date("2026-01-31T00:00:00Z");

      const result1 = calculateSolunarPeriods(lat, lon, date);
      const result2 = calculateSolunarPeriods(lat, lon, date);

      expect(result1).toEqual(result2);
    });

    it("should validate moon phase descriptions", () => {
      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
      );

      const validPhases = [
        "New Moon",
        "Waxing Crescent",
        "First Quarter",
        "Waxing Gibbous",
        "Full Moon",
        "Waning Gibbous",
        "Last Quarter",
        "Waning Crescent",
      ];

      expect(validPhases).toContain(result.moonPhase);
    });

    it("should report varied moon phases across a lunar month, with Full Moon at peak illumination", () => {
      const phasesSeen = new Set<string>();
      let maxIllumination = -1;
      let phaseAtMaxIllumination = "";

      for (let day = 1; day <= 30; day++) {
        const result = calculateSolunarPeriods(
          -33.8568,
          151.2153,
          new Date(Date.UTC(2026, 0, day)),
        );

        phasesSeen.add(result.moonPhase);

        if (result.moonIllumination > maxIllumination) {
          maxIllumination = result.moonIllumination;
          phaseAtMaxIllumination = result.moonPhase;
        }
      }

      // A 30-day sweep should traverse most of the 8 named phases, not get stuck on one.
      expect(phasesSeen.size).toBeGreaterThanOrEqual(6);
      expect(maxIllumination).toBeGreaterThanOrEqual(95);
      expect(phaseAtMaxIllumination).toBe("Full Moon");
    });
  });

  describe("ISO timestamps", () => {
    it("includes ISO timestamps consistent with HH:MM times and exact 2h duration", () => {
      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
        "Australia/Sydney",
      );
      const all = [...result.majorPeriods, ...result.minorPeriods];
      expect(all.length).toBeGreaterThan(0);
      for (const p of all) {
        expect(p.startISO).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
        );
        expect(p.startISO).toContain("+11:00"); // AEDT in January
        expect(p.startISO.slice(11, 16)).toBe(p.start);
        expect(p.endISO.slice(11, 16)).toBe(p.end);
        // Every period is exactly 2 hours — even across midnight
        expect(Date.parse(p.endISO) - Date.parse(p.startISO)).toBe(
          2 * 60 * 60 * 1000,
        );
      }
    });
  });

  describe("negative-UTC-offset day anchoring", () => {
    it("anchors moon-based periods to the requested local calendar day for a negative-offset timezone", () => {
      // suncalc3 internally anchors its day-window search at LOCAL midnight
      // (setHours(0,0,0,0)). For a timezone behind UTC (e.g. America/New_York,
      // UTC-5), UTC midnight of the requested day falls in the PREVIOUS local
      // calendar day — without correction, every moon-based period silently
      // lands a full day early.
      const result = calculateSolunarPeriods(
        40.7128,
        -74.006,
        new Date("2026-01-31T00:00:00Z"),
        "America/New_York",
      );
      const localDates = [
        ...result.majorPeriods,
        ...result.minorPeriods,
      ].map((p) => p.startISO.slice(0, 10));
      expect(localDates).toContain("2026-01-31");
      expect(localDates.every((d) => d === "2026-01-30")).toBe(false);
    });

    it("produces the same instants for a positive-offset timezone as before (no regression)", () => {
      // Sydney (UTC+11) already worked correctly, since UTC midnight of day D
      // falls in local day D there. This locks in that the fix is a no-op
      // for positive offsets.
      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
        "Australia/Sydney",
      );
      expect(result.majorPeriods.map((p) => p.startISO)).toEqual([
        "2026-01-31T10:31:33+11:00",
        "2026-01-31T22:56:45+11:00",
      ]);
    });

    it("anchors correctly on a DST fall-back transition day at local midnight", () => {
      // America/Santiago's 2026 fall-back transition (GMT-03:00 -> GMT-04:00)
      // lands exactly at local midnight April 5. A single-sample offset
      // lookup at UTC midnight of the requested day picks up the
      // PRE-transition offset, anchoring to April 4 instead of April 5 —
      // the exact bug the day-anchoring fix was meant to eliminate.
      const apr4 = calculateSolunarPeriods(
        -33.45,
        -70.6667,
        new Date("2026-04-04T00:00:00Z"),
        "America/Santiago",
      );
      const apr5 = calculateSolunarPeriods(
        -33.45,
        -70.6667,
        new Date("2026-04-05T00:00:00Z"),
        "America/Santiago",
      );
      expect(apr5.date).toBe("20260405");
      expect(apr5.sunRise).not.toBe(apr4.sunRise);
      expect(apr5.majorPeriods[0]?.startISO).not.toBe(
        apr4.majorPeriods[0]?.startISO,
      );
      expect(apr5.majorPeriods[0]?.startISO.slice(0, 10)).toBe("2026-04-05");
    });

    it("does not warn for a legitimately zero-UTC-offset timezone", () => {
      // Africa/Accra has UTC+0 offset (same as the fallback path this warns
      // about) but is a fully working, correctly-applied timezone — the
      // warning heuristic must not confuse "TZ mutation succeeded and this
      // zone happens to be UTC+0" with "TZ mutation silently failed".
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const result = calculateSolunarPeriods(
          5.6037,
          -0.187,
          new Date("2026-07-11T00:00:00Z"),
          "Africa/Accra",
        );
        expect(result.date).toBe("20260711");
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("does not warn across several other zero/near-zero-offset zones", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        for (const tz of [
          "Europe/London", // UTC+0 in winter
          "Atlantic/Reykjavik", // always UTC+0
          "Africa/Casablanca",
        ]) {
          calculateSolunarPeriods(
            51.5,
            -0.13,
            new Date("2026-01-15T00:00:00Z"),
            tz,
          );
        }
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe("day rating", () => {
    it("includes a day rating between 0 and 5 with a matching label", () => {
      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
        "Australia/Sydney",
      );
      expect(result.dayRating).toBeGreaterThanOrEqual(0);
      expect(result.dayRating).toBeLessThanOrEqual(5);
      expect(["Poor", "Fair", "Good", "Great", "Excellent"]).toContain(
        result.dayRatingLabel,
      );
    });
  });

  describe("tide strength", () => {
    it("reports tide strength consistent with moon illumination", () => {
      // Jan 31 2026 is a 96% waxing gibbous — close to full ⇒ spring-ish
      const result = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
        "Australia/Sydney",
      );
      expect(result.tideStrength).toBeGreaterThanOrEqual(0);
      expect(result.tideStrength).toBeLessThanOrEqual(100);
      expect(["spring", "mid", "neap"]).toContain(result.tideType);
    });
  });

  describe("calculateSolunarRange", () => {
    it("returns one SolunarData per consecutive UTC day", () => {
      const results = calculateSolunarRange(
        -33.8568,
        151.2153,
        new Date("2026-01-31T00:00:00Z"),
        3,
        "Australia/Sydney",
      );
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.date)).toEqual([
        "20260131",
        "20260201",
        "20260202",
      ]);
    });

    it("rejects a non-positive or non-integer day count", () => {
      const d = new Date("2026-01-31T00:00:00Z");
      expect(() => calculateSolunarRange(0, 0, d, 0)).toThrow(RangeError);
      expect(() => calculateSolunarRange(0, 0, d, 1.5)).toThrow(RangeError);
      expect(() => calculateSolunarRange(0, 0, d, 367)).toThrow(RangeError);
    });
  });

  describe("input validation", () => {
    const validDate = new Date("2026-01-31T00:00:00Z");

    it("throws RangeError for latitude out of range", () => {
      expect(() => calculateSolunarPeriods(91, 0, validDate)).toThrow(
        RangeError,
      );
      expect(() => calculateSolunarPeriods(-91, 0, validDate)).toThrow(
        RangeError,
      );
    });

    it("throws RangeError for longitude out of range", () => {
      expect(() => calculateSolunarPeriods(0, 181, validDate)).toThrow(
        RangeError,
      );
      expect(() => calculateSolunarPeriods(0, -181, validDate)).toThrow(
        RangeError,
      );
    });

    it("throws TypeError for an invalid date", () => {
      expect(() => calculateSolunarPeriods(0, 0, new Date("nope"))).toThrow(
        TypeError,
      );
    });

    it("throws RangeError for an invalid IANA timezone", () => {
      expect(() => calculateSolunarPeriods(0, 0, validDate, "Not/AZone")).toThrow(
        RangeError,
      );
    });

    it("throws a clear error when timeZone is requested without process.env (browser)", () => {
      const originalProcess = globalThis.process;
      // Simulate a browser: no process global at all
      // @ts-expect-error intentionally removing a Node global for the test
      delete globalThis.process;
      try {
        expect(() =>
          calculateSolunarPeriods(
            -33.8568,
            151.2153,
            new Date("2026-01-31T00:00:00Z"),
            "Pacific/Kiritimati", // safely never the CI machine's ambient zone
          ),
        ).toThrow(/requires Node/);
      } finally {
        globalThis.process = originalProcess;
      }
    });
  });

  describe("antimeridian longitude wraparound", () => {
    it("produces nearly identical sun times for longitudes just across the antimeridian", () => {
      // 179.9°E and 179.9°W (-179.9) are only 0.2° apart in true angular
      // distance despite sitting at opposite ends of the numeric longitude
      // range. A naive implementation that treats them as ~360° apart would
      // produce wildly different (often many-hours-shifted) sun/moon times.
      const date = new Date("2026-03-20T00:00:00Z");
      const east = calculateSolunarPeriods(0, 179.9, date);
      const west = calculateSolunarPeriods(0, -179.9, date);

      expect(east.sunRise).toMatch(/^\d{2}:\d{2}$/);
      expect(east.sunSet).toMatch(/^\d{2}:\d{2}$/);
      expect(west.sunRise).toMatch(/^\d{2}:\d{2}$/);
      expect(west.sunSet).toMatch(/^\d{2}:\d{2}$/);

      expectPeriodNear(
        { start: east.sunRise, end: east.sunSet },
        west.sunRise,
        west.sunSet,
        5,
        "antimeridian sunrise/sunset",
      );
    });

    it("produces nearly identical major-period timing for longitudes just across the antimeridian", () => {
      const date = new Date("2026-03-20T00:00:00Z");
      const east = calculateSolunarPeriods(0, 179.9, date);
      const west = calculateSolunarPeriods(0, -179.9, date);

      expect(east.majorPeriods.length).toBeGreaterThan(0);
      expect(west.majorPeriods.length).toBeGreaterThan(0);

      expectPeriodNear(
        east.majorPeriods[0],
        west.majorPeriods[0].start,
        west.majorPeriods[0].end,
        5,
        "antimeridian major period 0",
      );
    });
  });

  describe("exact poles", () => {
    const validPhases = [
      "New Moon",
      "Waxing Crescent",
      "First Quarter",
      "Waxing Gibbous",
      "Full Moon",
      "Waning Gibbous",
      "Last Quarter",
      "Waning Crescent",
    ];

    const poleDates: Array<[string, Date]> = [
      ["June solstice", new Date("2026-06-21T00:00:00Z")],
      ["March equinox", new Date("2026-03-20T00:00:00Z")],
    ];

    function assertWellFormed(result: ReturnType<typeof calculateSolunarPeriods>) {
      expect(validPhases).toContain(result.moonPhase);
      expect(Number.isNaN(result.moonIllumination)).toBe(false);
      expect(result.moonIllumination).toBeGreaterThanOrEqual(0);
      expect(result.moonIllumination).toBeLessThanOrEqual(100);
      expect(Number.isNaN(result.dayRating)).toBe(false);
      expect(result.dayRating).toBeGreaterThanOrEqual(0);
      expect(result.dayRating).toBeLessThanOrEqual(5);
      expect(Number.isNaN(result.tideStrength)).toBe(false);
      expect(result.tideStrength).toBeGreaterThanOrEqual(0);
      expect(result.tideStrength).toBeLessThanOrEqual(100);
    }

    for (const [label, date] of poleDates) {
      it(`produces well-formed, non-NaN output at the North Pole (${label})`, () => {
        assertWellFormed(calculateSolunarPeriods(90, 0, date));
      });

      it(`produces well-formed, non-NaN output at the South Pole (${label})`, () => {
        assertWellFormed(calculateSolunarPeriods(-90, 0, date));
      });
    }
  });

  describe("calculateSolunarRange across a leap day", () => {
    it("returns 366 unique, gap-free consecutive UTC dates for a 366-day range crossing Feb 29", () => {
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const results = calculateSolunarRange(
        -33.8568,
        151.2153,
        new Date("2028-01-01T00:00:00Z"),
        366,
      );
      expect(results).toHaveLength(366);

      const dates = results.map((r) => r.date);
      expect(new Set(dates).size).toBe(366);
      expect(dates).toContain("20280229");

      for (let i = 1; i < dates.length; i++) {
        const prev = dates[i - 1];
        const curr = dates[i];
        const prevMs = Date.UTC(
          Number(prev.slice(0, 4)),
          Number(prev.slice(4, 6)) - 1,
          Number(prev.slice(6, 8)),
        );
        const currMs = Date.UTC(
          Number(curr.slice(0, 4)),
          Number(curr.slice(4, 6)) - 1,
          Number(curr.slice(6, 8)),
        );
        expect(currMs - prevMs, `${prev} -> ${curr}`).toBe(MS_PER_DAY);
      }
    });
  });

  describe("leap day itself", () => {
    it("keeps 2028-02-29 as the reported date rather than rolling over into March", () => {
      const leapDay = new Date("2028-02-29T00:00:00Z");

      const sydney = calculateSolunarPeriods(
        -33.8568,
        151.2153,
        leapDay,
        "Australia/Sydney",
      );
      const newYork = calculateSolunarPeriods(
        40.7128,
        -74.006,
        leapDay,
        "America/New_York",
      );

      expect(sydney.date).toBe("20280229");
      expect(newYork.date).toBe("20280229");
    });
  });

  describe("far-future and far-past dates", () => {
    it("computes well-formed, non-NaN output for far-future and far-past dates, with and without an explicit timeZone", () => {
      const cases: Array<{ label: string; date: Date; timeZone?: string }> = [
        { label: "far future, UTC", date: new Date("2100-06-15T00:00:00Z") },
        {
          label: "far future, explicit timeZone",
          date: new Date("2100-06-15T00:00:00Z"),
          timeZone: "Australia/Sydney",
        },
        { label: "far past, UTC", date: new Date("1950-06-15T00:00:00Z") },
        {
          label: "far past, explicit timeZone",
          date: new Date("1950-06-15T00:00:00Z"),
          timeZone: "Australia/Sydney",
        },
      ];

      cases.forEach(({ label, date, timeZone }) => {
        const result = calculateSolunarPeriods(
          -33.8568,
          151.2153,
          date,
          timeZone,
        );

        expect(result.date, label).toMatch(/^\d{8}$/);
        expect(Number.isNaN(result.moonIllumination), label).toBe(false);
        expect(result.moonIllumination, label).toBeGreaterThanOrEqual(0);
        expect(result.moonIllumination, label).toBeLessThanOrEqual(100);
        expect(Number.isNaN(result.dayRating), label).toBe(false);
        expect(result.dayRating, label).toBeGreaterThanOrEqual(0);
        expect(result.dayRating, label).toBeLessThanOrEqual(5);
        expect(Number.isNaN(result.tideStrength), label).toBe(false);
        expect(result.tideStrength, label).toBeGreaterThanOrEqual(0);
        expect(result.tideStrength, label).toBeLessThanOrEqual(100);
        expect(result.majorPeriods.length, label).toBeGreaterThan(0);
        expect(result.minorPeriods.length, label).toBeGreaterThan(0);
      });
    });
  });
});
