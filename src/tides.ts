import { createTidePredictor } from "./vendor/tide-predictor.js";
import type { SolunarData, SolunarPeriod } from "./solunar";

export interface TideConstituent {
  /** Standard constituent name, e.g. "M2", "S2", "K1", "O1" */
  name: string;
  /** Amplitude in the station's units (NOAA metric = meters) */
  amplitude: number;
  /** Phase lag in degrees, GMT-referenced (NOAA field: phase_GMT) */
  phase: number;
  /** Angular speed in degrees per hour, e.g. M2 = 28.984104 */
  speed: number;
}

export interface TideEvent {
  time: Date;
  /** UTC ISO-8601 */
  timeISO: string;
  /** Water level relative to the station datum, in constituent units */
  level: number;
  type: "high" | "low";
}

export interface TidePredictionInput {
  constituents: TideConstituent[];
  start: Date;
  end: Date;
  /** Optional value added to all levels (e.g. datum shift) */
  offset?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_SPAN_DAYS = 3660; // ~10 years — generous for tide tables, bounded against DoS

const MAX_SPAN_MS = MAX_SPAN_DAYS * MS_PER_DAY;

/**
 * Predict high/low tide events by harmonic synthesis. Accuracy matches the
 * quality of the constituents: official station constituents reproduce
 * published tide tables to within a few minutes. Weather effects (storm
 * surge, wind) are NOT modeled. Not for navigation.
 */
export function predictTideEvents(input: TidePredictionInput): TideEvent[] {
  const { constituents, start, end, offset } = input;
  if (!Array.isArray(constituents) || constituents.length === 0) {
    throw new RangeError("constituents must be a non-empty array");
  }
  if (
    !(start instanceof Date) ||
    isNaN(start.getTime()) ||
    !(end instanceof Date) ||
    isNaN(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    throw new RangeError(
      "start and end must be valid Dates with end after start",
    );
  }
  if (end.getTime() - start.getTime() > MAX_SPAN_MS) {
    throw new RangeError(
      `date span between start and end must not exceed ${MAX_SPAN_DAYS} days (~10 years); ` +
        "harmonic synthesis cost grows with the span, and this cap guards against " +
        "unbounded CPU/memory use from a caller-supplied range",
    );
  }

  const predictor =
    offset !== undefined
      ? createTidePredictor(constituents, { offset })
      : createTidePredictor(constituents);
  const extremes = predictor.getExtremesPrediction({ start, end });

  return extremes.map((extreme) => ({
    time: extreme.time,
    timeISO: extreme.time.toISOString(),
    level: extreme.level,
    type: extreme.high ? ("high" as const) : ("low" as const),
  }));
}

export interface TideAwarePeriod extends SolunarPeriod {
  periodType: "major" | "minor";
  /** true when a high/low tide falls within the period (± windowMinutes) */
  coincidesWithTideChange: boolean;
}

/**
 * Annotate a day's solunar periods with whether a tide change (high or low
 * water) falls inside the period, expanded by windowMinutes on both sides.
 * Anglers rate solunar windows that line up with moving water around a tide
 * change more highly than either signal alone.
 */
export function combineSolunarWithTides(
  solunar: SolunarData,
  tides: TideEvent[],
  windowMinutes = 60,
): TideAwarePeriod[] {
  const windowMs = windowMinutes * 60 * 1000;
  const annotate = (
    period: SolunarPeriod,
    periodType: "major" | "minor",
  ): TideAwarePeriod => {
    const windowStart = Date.parse(period.startISO) - windowMs;
    const windowEnd = Date.parse(period.endISO) + windowMs;
    const coincidesWithTideChange = tides.some((tide) => {
      const t = tide.time.getTime();
      return t >= windowStart && t <= windowEnd;
    });
    return { ...period, periodType, coincidesWithTideChange };
  };
  return [
    ...solunar.majorPeriods.map((p) => annotate(p, "major")),
    ...solunar.minorPeriods.map((p) => annotate(p, "minor")),
  ];
}
