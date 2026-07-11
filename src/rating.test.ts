import { describe, it, expect } from "vitest";
import { computeDayRating } from "./rating";
import type { DayRating, DayRatingLabel } from "./rating";

describe("computeDayRating", () => {
  it("rates full moon at perigee with a dawn-overlapping period as Excellent", () => {
    const sunrise = new Date("2026-01-31T06:00:00Z");
    const result = computeDayRating({
      phaseValue: 0.5, // full moon
      moonDistanceKm: 363300, // perigee
      periodCenters: [sunrise, new Date("2026-01-31T18:00:00Z")],
      sunEvents: [sunrise, new Date("2026-01-31T21:00:00Z")],
    });
    expect(result.rating).toBeGreaterThanOrEqual(4.25); // 2 + 1.5 + 0.75
    expect(result.label).toBe("Excellent");
  });

  it("rates quarter moon at apogee with no overlap as Poor", () => {
    const result = computeDayRating({
      phaseValue: 0.25, // first quarter
      moonDistanceKm: 405500, // apogee
      periodCenters: [new Date("2026-01-31T12:00:00Z")],
      sunEvents: [
        new Date("2026-01-31T06:00:00Z"),
        new Date("2026-01-31T20:00:00Z"),
      ],
    });
    expect(result.rating).toBeLessThan(1.5);
    expect(result.label).toBe("Poor");
  });

  it("caps rating at 5 and never goes below 0", () => {
    const s = new Date("2026-01-31T06:00:00Z");
    const max = computeDayRating({
      phaseValue: 0,
      moonDistanceKm: 350000,
      periodCenters: [s, s, s, s],
      sunEvents: [s],
    });
    expect(max.rating).toBeLessThanOrEqual(5);
    const min = computeDayRating({
      phaseValue: 0.25,
      moonDistanceKm: 410000,
      periodCenters: [],
      sunEvents: [],
    });
    expect(min.rating).toBeGreaterThanOrEqual(0);
  });

  describe("rating label boundaries", () => {
    it("labels a rating of exactly 1.5 as Fair, not Poor", () => {
      const result = computeDayRating({
        phaseValue: 0.0625, // distToSyzygy 0.0625 -> phaseScore 1.5
        moonDistanceKm: 405500, // apogee -> perigeeScore 0
        periodCenters: [],
        sunEvents: [],
      });
      expect(result.rating).toBe(1.5);
      expect(result.label).toBe("Fair");
    });

    it("labels a rating of exactly 2.5 as Good, not Fair", () => {
      const t = new Date("2026-01-31T06:00:00Z");
      const result = computeDayRating({
        phaseValue: 0.03125, // phaseScore 1.75
        moonDistanceKm: 405500, // perigeeScore 0
        periodCenters: [t], // overlapScore 0.75
        sunEvents: [t],
      });
      expect(result.rating).toBe(2.5);
      expect(result.label).toBe("Good");
    });

    it("labels a rating of exactly 3.5 as Great, not Good", () => {
      const result = computeDayRating({
        phaseValue: 0, // new moon -> phaseScore 2
        moonDistanceKm: 363300, // perigee -> perigeeScore 1.5
        periodCenters: [],
        sunEvents: [],
      });
      expect(result.rating).toBe(3.5);
      expect(result.label).toBe("Great");
    });

    it("labels a rating of 4.2 (just below the 4.25 cutoff) as Great", () => {
      const t = new Date("2026-01-31T06:00:00Z");
      const result = computeDayRating({
        phaseValue: 0.00625, // phaseScore 1.95
        moonDistanceKm: 363300, // perigeeScore 1.5
        periodCenters: [t], // overlapScore 0.75
        sunEvents: [t],
      });
      expect(result.rating).toBe(4.2);
      expect(result.label).toBe("Great");
    });

    it("labels a rating of 4.3 (just above the 4.25 cutoff) as Excellent", () => {
      const t1 = new Date("2026-01-31T06:00:00Z");
      const t2 = new Date("2026-01-31T18:00:00Z");
      const result = computeDayRating({
        phaseValue: 0.0875, // phaseScore 1.3
        moonDistanceKm: 363300, // perigeeScore 1.5
        periodCenters: [t1, t2], // overlapScore 1.5 (both overlap their own sun event)
        sunEvents: [t1, t2],
      });
      expect(result.rating).toBe(4.3);
      expect(result.label).toBe("Excellent");
    });
  });

  describe("overlapScore", () => {
    it("caps overlapScore at 1.5 even with 3 overlapping period centers", () => {
      const s1 = new Date("2026-01-31T06:00:00Z");
      const s2 = new Date("2026-01-31T12:00:00Z");
      const s3 = new Date("2026-01-31T18:00:00Z");
      const result = computeDayRating({
        phaseValue: 0.25, // quarter moon -> phaseScore 0
        moonDistanceKm: 405500, // apogee -> perigeeScore 0
        periodCenters: [s1, s2, s3], // uncapped would be 3 * 0.75 = 2.25
        sunEvents: [s1, s2, s3],
      });
      expect(result.rating).toBe(1.5); // capped at 1.5, not 2.25
      expect(result.label).toBe("Fair");
    });

    it("counts a period center exactly 90 minutes from a sun event as overlapping", () => {
      const sun = new Date("2026-01-31T06:00:00Z");
      const center = new Date(sun.getTime() + 90 * 60 * 1000);
      const result = computeDayRating({
        phaseValue: 0.25, // phaseScore 0
        moonDistanceKm: 405500, // perigeeScore 0
        periodCenters: [center],
        sunEvents: [sun],
      });
      expect(result.rating).toBe(0.8); // single 0.75 overlap, rounded
      expect(result.label).toBe("Poor");
    });

    it("does not count a period center 91 minutes from a sun event as overlapping", () => {
      const sun = new Date("2026-01-31T06:00:00Z");
      const center = new Date(sun.getTime() + 91 * 60 * 1000);
      const result = computeDayRating({
        phaseValue: 0.25, // phaseScore 0
        moonDistanceKm: 405500, // perigeeScore 0
        periodCenters: [center],
        sunEvents: [sun],
      });
      expect(result.rating).toBe(0);
      expect(result.label).toBe("Poor");
    });

    it("does not double-count a single period center that is near multiple sun events", () => {
      const center = new Date("2026-01-31T12:00:00Z");
      const sunA = new Date(center.getTime() - 30 * 60 * 1000);
      const sunB = new Date(center.getTime() + 30 * 60 * 1000);
      const result = computeDayRating({
        phaseValue: 0.25, // phaseScore 0
        moonDistanceKm: 405500, // perigeeScore 0
        periodCenters: [center], // overlaps both sunA and sunB
        sunEvents: [sunA, sunB],
      });
      expect(result.rating).toBe(0.8); // one 0.75 contribution, not 1.5
      expect(result.label).toBe("Poor");
    });

    it("contributes zero overlap when both periodCenters and sunEvents are empty", () => {
      const result = computeDayRating({
        phaseValue: 0.5, // full moon -> phaseScore 2
        moonDistanceKm: 384400, // midway -> perigeeScore 0.75
        periodCenters: [],
        sunEvents: [],
      });
      expect(result.rating).toBe(2.8); // phaseScore + perigeeScore only
      expect(result.label).toBe("Good");
    });
  });

  describe("perigeeScore clamping", () => {
    it("clamps perigeeScore to its 1.5 max when moonDistanceKm is far inside perigee", () => {
      const result = computeDayRating({
        phaseValue: 0.25, // phaseScore 0
        moonDistanceKm: 300000, // well closer than perigee
        periodCenters: [],
        sunEvents: [],
      });
      expect(result.rating).toBe(1.5);
      expect(result.label).toBe("Fair");
    });

    it("clamps perigeeScore to 0 when moonDistanceKm is far beyond apogee", () => {
      const result = computeDayRating({
        phaseValue: 0.25, // phaseScore 0
        moonDistanceKm: 450000, // well farther than apogee
        periodCenters: [],
        sunEvents: [],
      });
      expect(result.rating).toBe(0);
      expect(result.label).toBe("Poor");
    });
  });

  describe("type consistency", () => {
    it("returns a DayRating whose fields match the declared DayRating/DayRatingLabel types", () => {
      const result: DayRating = computeDayRating({
        phaseValue: 0.125, // phaseScore 1.0
        moonDistanceKm: 384400, // perigeeScore 0.75
        periodCenters: [],
        sunEvents: [],
      });
      const label: DayRatingLabel = result.label;
      const validLabels: DayRatingLabel[] = [
        "Poor",
        "Fair",
        "Good",
        "Great",
        "Excellent",
      ];
      expect(typeof result.rating).toBe("number");
      expect(validLabels).toContain(label);
      expect(result.rating).toBe(1.8);
      expect(label).toBe("Fair");
    });
  });

  describe("input validation", () => {
    const validCenters = [new Date("2026-01-31T06:00:00Z")];

    it("throws RangeError for a non-finite phaseValue", () => {
      expect(() =>
        computeDayRating({
          phaseValue: NaN,
          moonDistanceKm: 380000,
          periodCenters: [],
          sunEvents: [],
        }),
      ).toThrow(RangeError);
      expect(() =>
        computeDayRating({
          phaseValue: Infinity,
          moonDistanceKm: 380000,
          periodCenters: [],
          sunEvents: [],
        }),
      ).toThrow(RangeError);
    });

    it("throws RangeError for a phaseValue outside 0-1", () => {
      expect(() =>
        computeDayRating({
          phaseValue: -0.1,
          moonDistanceKm: 380000,
          periodCenters: [],
          sunEvents: [],
        }),
      ).toThrow(RangeError);
      expect(() =>
        computeDayRating({
          phaseValue: 1.1,
          moonDistanceKm: 380000,
          periodCenters: [],
          sunEvents: [],
        }),
      ).toThrow(RangeError);
    });

    it("throws RangeError for a non-finite moonDistanceKm", () => {
      expect(() =>
        computeDayRating({
          phaseValue: 0.5,
          moonDistanceKm: NaN,
          periodCenters: validCenters,
          sunEvents: [],
        }),
      ).toThrow(RangeError);
    });
  });
});
