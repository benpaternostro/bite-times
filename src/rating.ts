export type DayRatingLabel = "Poor" | "Fair" | "Good" | "Great" | "Excellent";

export interface DayRatingInput {
  /** 0–1 lunar phase; 0/1 = new moon, 0.5 = full moon */
  phaseValue: number;
  /** Earth–moon distance in km (~356,500 perigee to ~406,700 apogee) */
  moonDistanceKm: number;
  /** Center times of the day's solunar periods (transits, moonrise, moonset) */
  periodCenters: Date[];
  /** Sunrise and sunset times (when they occur) */
  sunEvents: Date[];
}

export interface DayRating {
  /** 0–5, one decimal place */
  rating: number;
  label: DayRatingLabel;
}

const MOON_PERIGEE_KM = 363300;
const MOON_APOGEE_KM = 405500;
const OVERLAP_WINDOW_MS = 90 * 60 * 1000;

/**
 * Heuristic day quality score used by published solunar tables:
 * - up to 2.0 pts: proximity to syzygy (new/full moon — strongest tidal pull)
 * - up to 1.5 pts: moon distance (perigee = stronger influence)
 * - up to 1.5 pts: solunar periods coinciding with dawn/dusk (±90 min),
 *   0.75 each — the classic "major near sunrise" multiplier
 */
export function computeDayRating(input: DayRatingInput): DayRating {
  const { phaseValue, moonDistanceKm, periodCenters, sunEvents } = input;

  if (!Number.isFinite(phaseValue) || phaseValue < 0 || phaseValue > 1) {
    throw new RangeError(
      `phaseValue must be a finite number between 0 and 1, got ${phaseValue}`,
    );
  }
  if (!Number.isFinite(moonDistanceKm)) {
    throw new RangeError(
      `moonDistanceKm must be a finite number, got ${moonDistanceKm}`,
    );
  }

  // Distance from nearest syzygy, 0 (at new/full) to 0.25 (at quarters)
  const distToSyzygy = Math.min(
    phaseValue,
    Math.abs(phaseValue - 0.5),
    1 - phaseValue,
  );
  const phaseScore = 2 * (1 - distToSyzygy / 0.25);

  const distanceFraction =
    (MOON_APOGEE_KM - moonDistanceKm) / (MOON_APOGEE_KM - MOON_PERIGEE_KM);
  const perigeeScore = 1.5 * Math.min(1, Math.max(0, distanceFraction));

  let overlapScore = 0;
  for (const center of periodCenters) {
    const overlaps = sunEvents.some(
      (sun) => Math.abs(center.getTime() - sun.getTime()) <= OVERLAP_WINDOW_MS,
    );
    if (overlaps) {
      overlapScore += 0.75;
    }
  }
  overlapScore = Math.min(1.5, overlapScore);

  const rating = Math.min(
    5,
    Math.max(0, Math.round((phaseScore + perigeeScore + overlapScore) * 10) / 10),
  );
  return { rating, label: ratingLabel(rating) };
}

function ratingLabel(rating: number): DayRatingLabel {
  if (rating < 1.5) return "Poor";
  if (rating < 2.5) return "Fair";
  if (rating < 3.5) return "Good";
  if (rating < 4.25) return "Great";
  return "Excellent";
}
