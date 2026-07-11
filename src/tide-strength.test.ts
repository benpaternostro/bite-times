import { describe, it, expect } from "vitest";
import { computeTideStrength } from "./tide-strength";

describe("computeTideStrength", () => {
  it("is a 100-strength spring tide at new and full moon", () => {
    expect(computeTideStrength(0)).toEqual({ strength: 100, type: "spring" });
    expect(computeTideStrength(0.5)).toEqual({ strength: 100, type: "spring" });
    expect(computeTideStrength(1)).toEqual({ strength: 100, type: "spring" });
  });

  it("is a 0-strength neap tide at quarter moons", () => {
    expect(computeTideStrength(0.25)).toEqual({ strength: 0, type: "neap" });
    expect(computeTideStrength(0.75)).toEqual({ strength: 0, type: "neap" });
  });

  it("is mid-strength halfway between", () => {
    expect(computeTideStrength(0.125)).toEqual({ strength: 50, type: "mid" });
  });

  describe("input validation", () => {
    it("throws RangeError for a non-finite phaseValue", () => {
      expect(() => computeTideStrength(NaN)).toThrow(RangeError);
      expect(() => computeTideStrength(Infinity)).toThrow(RangeError);
    });

    it("throws RangeError for a phaseValue outside 0-1", () => {
      expect(() => computeTideStrength(-0.1)).toThrow(RangeError);
      expect(() => computeTideStrength(1.1)).toThrow(RangeError);
    });
  });

  describe("type boundaries", () => {
    it("is exactly strength 67 and type spring right at the spring threshold", () => {
      expect(computeTideStrength(0.0825)).toEqual({ strength: 67, type: "spring" });
    });

    it("is exactly strength 66 and type mid just below the spring threshold", () => {
      expect(computeTideStrength(0.085)).toEqual({ strength: 66, type: "mid" });
    });

    it("is exactly strength 33 and type neap right at the neap threshold", () => {
      expect(computeTideStrength(0.1675)).toEqual({ strength: 33, type: "neap" });
    });

    it("is exactly strength 34 and type mid just above the neap threshold", () => {
      expect(computeTideStrength(0.165)).toEqual({ strength: 34, type: "mid" });
    });
  });

  describe("monotonicity", () => {
    it("strength never increases as phaseValue moves away from the nearest syzygy", () => {
      const steps = 20;
      let previous = computeTideStrength(0).strength;
      expect(previous).toBe(100);
      for (let i = 1; i <= steps; i++) {
        const phaseValue = (i / steps) * 0.25; // sweeps 0 (new moon) to 0.25 (quarter)
        const current = computeTideStrength(phaseValue).strength;
        expect(current).toBeLessThanOrEqual(previous);
        previous = current;
      }
      expect(previous).toBe(0);
    });
  });

  describe("symmetry", () => {
    it("gives equal strength for phaseValue x and 1-x (symmetric around new moon)", () => {
      for (const x of [0.02, 0.08, 0.19, 0.33, 0.41, 0.49]) {
        expect(computeTideStrength(x)).toEqual(computeTideStrength(1 - x));
      }
    });

    it("gives equal strength for 0.5-x and 0.5+x (symmetric around full moon)", () => {
      for (const x of [0.01, 0.05, 0.1, 0.2, 0.24]) {
        expect(computeTideStrength(0.5 - x)).toEqual(computeTideStrength(0.5 + x));
      }
    });
  });

  describe("integer strength", () => {
    it("always returns an integer strength for arbitrary fractional phaseValues", () => {
      const phaseValues = [
        0.0137, 0.0999, 0.1414, 0.2718, 0.3333, 0.4567, 0.6001, 0.7777, 0.9199,
      ];
      for (const phaseValue of phaseValues) {
        const { strength } = computeTideStrength(phaseValue);
        expect(Number.isInteger(strength)).toBe(true);
      }
    });
  });
});
