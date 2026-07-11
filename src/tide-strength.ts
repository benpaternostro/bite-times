export interface TideStrength {
  /** 0 (weakest neap) to 100 (strongest spring) */
  strength: number;
  type: "spring" | "mid" | "neap";
}

/**
 * Astronomical tide forcing from the lunar phase. At new/full moon (syzygy)
 * the sun and moon pull together — spring tides, bigger range, stronger
 * currents. At quarter moons they oppose — neap tides. This is global and
 * needs no station data; it says nothing about local high/low water TIMES.
 */
export function computeTideStrength(phaseValue: number): TideStrength {
  if (!Number.isFinite(phaseValue) || phaseValue < 0 || phaseValue > 1) {
    throw new RangeError(
      `phaseValue must be a finite number between 0 and 1, got ${phaseValue}`,
    );
  }
  const distToSyzygy = Math.min(
    phaseValue,
    Math.abs(phaseValue - 0.5),
    1 - phaseValue,
  );
  const strength = Math.round(100 * (1 - distToSyzygy / 0.25));
  const type = strength >= 67 ? "spring" : strength <= 33 ? "neap" : "mid";
  return { strength, type };
}
