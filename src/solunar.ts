import SunCalc, { type MoonTimes } from "suncalc3";
import { computeDayRating, type DayRatingLabel } from "./rating";
import { computeTideStrength } from "./tide-strength";

export interface SolunarPeriod {
  start: string; // HH:MM format
  end: string; // HH:MM format
  startISO: string; // ISO-8601 with offset, e.g. "2026-01-31T10:31:22+11:00"
  endISO: string;
}

export interface SolunarData {
  majorPeriods: SolunarPeriod[];
  minorPeriods: SolunarPeriod[];
  date: string;
  sunRise: string;
  sunSet: string;
  moonRise: string;
  moonSet: string;
  moonPhase: string;
  moonIllumination: number;
  /** Heuristic day quality, 0–5 (see README "Day rating") */
  dayRating: number;
  dayRatingLabel: DayRatingLabel;
  /** Astronomical tide forcing 0–100 (100 = strongest spring tide) */
  tideStrength: number;
  tideType: "spring" | "mid" | "neap";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate solunar data for `days` consecutive UTC calendar days starting
 * at `startDate` (pass UTC midnight of the first day, like
 * calculateSolunarPeriods).
 */
export function calculateSolunarRange(
  latitude: number,
  longitude: number,
  startDate: Date,
  days: number,
  timeZone?: string,
): SolunarData[] {
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new RangeError(`days must be an integer between 1 and 366, got ${days}`);
  }
  return Array.from({ length: days }, (_, i) =>
    calculateSolunarPeriods(
      latitude,
      longitude,
      new Date(startDate.getTime() + i * MS_PER_DAY),
      timeZone,
    ),
  );
}

function validateInputs(
  latitude: number,
  longitude: number,
  date: Date,
  timeZone?: string,
): void {
  if (typeof latitude !== "number" || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError(`latitude must be a number between -90 and 90, got ${latitude}`);
  }
  if (typeof longitude !== "number" || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError(`longitude must be a number between -180 and 180, got ${longitude}`);
  }
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new TypeError("date must be a valid Date");
  }
  if (timeZone !== undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      throw new RangeError(`invalid IANA timeZone: ${timeZone}`);
    }
  }
}

/**
 * Calculate solunar bite times using SunCalc library
 * Based on Solunar Theory by John Alden Knight (1936)
 *
 * Major Periods (2 hours): Centered on moon upper and lower transit
 * Minor Periods (2 hours): Centered on moonrise and moonset
 */
export function calculateSolunarPeriods(
  latitude: number,
  longitude: number,
  date: Date,
  timeZone?: string,
): SolunarData {
  validateInputs(latitude, longitude, date, timeZone);

  // suncalc3 internally uses local Date methods (.getDate(), .setDate(), .setHours())
  // which depend on process.env.TZ. To get correct results for any location regardless
  // of the server's timezone, temporarily set TZ to the target timezone.
  // IMPORTANT: Requires tzdata package on Alpine Linux (see Dockerfile).
  const canSetTZ =
    typeof process !== "undefined" &&
    typeof process.env === "object" &&
    process.env !== null;

  if (timeZone && !canSetTZ) {
    const ambient = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ambient !== timeZone) {
      throw new Error(
        `bite-times: timeZone '${timeZone}' requires Node.js. Outside Node, ` +
          `astronomy is computed in the ambient timezone ('${ambient}') and ` +
          `cannot be redirected. Omit timeZone, or only request the ambient zone.`,
      );
    }
    // Ambient zone matches the requested zone: suncalc3's local-Date math
    // is already correct; no TZ mutation needed.
  }

  const originalTZ = canSetTZ ? process.env.TZ : undefined;
  if (timeZone && canSetTZ) {
    process.env.TZ = timeZone;

    // Verify TZ change took effect (fails silently on Alpine without tzdata).
    // Compare CANONICALIZED zone names (both run through the same Intl
    // canonicalization, so legacy aliases like "Asia/Calcutta" vs
    // "Asia/Kolkata" still match) rather than comparing getHours() to
    // getUTCHours() — that numeric heuristic can't tell "TZ mutation
    // silently failed" apart from "this zone genuinely has a UTC+0 offset
    // right now" (e.g. Africa/Accra, Europe/London in winter), and false-
    // positives on every such zone.
    const ambientZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    const requestedZone = new Intl.DateTimeFormat(undefined, {
      timeZone,
    }).resolvedOptions().timeZone;
    if (ambientZone !== requestedZone) {
      console.warn(
        `⚠️ process.env.TZ='${timeZone}' did not change Date behavior (ambient Intl zone is still '${ambientZone}'). ` +
          `Timezone data may be missing (e.g., Alpine Linux needs 'apk add tzdata'). Solunar calculations will be incorrect.`,
      );
    }
  }

  // suncalc3 anchors its day-window search at LOCAL midnight/noon (via
  // .setHours() on the input Date, using process.env.TZ above). For a
  // timezone BEHIND UTC (e.g. America/New_York, UTC-5), UTC midnight of
  // the requested day falls in the PREVIOUS local calendar day — without
  // this shift, moon-based fields silently anchor a full day early. Shift
  // `date` by the timezone's UTC offset so its local calendar day matches
  // the UTC calendar day the caller asked for. Uses Intl with an explicit
  // timeZone, independent of the process.env.TZ mutation above, so it's a
  // no-op for positive offsets (already correct) and safe even when
  // canSetTZ is false and the ambient zone matches.
  const anchoredDate = toLocalDayAnchor(date, timeZone);

  // Get sun times
  const sunTimes = SunCalc.getSunTimes(anchoredDate, latitude, longitude);

  // Get moon times
  const moonTimes = SunCalc.getMoonTimes(anchoredDate, latitude, longitude);

  // Get moon illumination
  const moonIllum = SunCalc.getMoonIllumination(date);

  // Calculate moon transit times (highest and lowest points)
  const { upperTransit, lowerTransit } = calculateMoonTransits(
    date,
    latitude,
    longitude,
    moonTimes,
  );

  // Moon distance for the day rating (independent of the TZ workaround)
  const moonPosition = SunCalc.getMoonPosition(date, latitude, longitude);

  // Restore original TZ
  if (timeZone && canSetTZ) {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  }

  // Calculate moon phase description
  const moonPhase = getMoonPhaseDescription(moonIllum.phaseValue);

  const periodCenters = [
    upperTransit,
    lowerTransit,
    moonTimes.rise && !isNaN(moonTimes.rise.getTime()) ? moonTimes.rise : null,
    moonTimes.set && !isNaN(moonTimes.set.getTime()) ? moonTimes.set : null,
  ].filter((d): d is Date => d instanceof Date);
  const sunEvents = [
    sunTimes.sunriseStart?.value,
    sunTimes.sunsetStart?.value,
  ].filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()));
  const dayRating = computeDayRating({
    phaseValue: moonIllum.phaseValue,
    moonDistanceKm: moonPosition.distance,
    periodCenters,
    sunEvents,
  });
  const tide = computeTideStrength(moonIllum.phaseValue);

  // Create major periods (2 hours centered on moon transits)
  const majorPeriods: SolunarPeriod[] = [];

  if (upperTransit) {
    majorPeriods.push(createPeriod(upperTransit, 2, date, timeZone));
  }

  if (lowerTransit) {
    majorPeriods.push(createPeriod(lowerTransit, 2, date, timeZone));
  }

  // Create minor periods (2 hours centered on moonrise/moonset)
  // Minor periods use 2 hours, consistent with widely published solunar tables
  const minorPeriods: SolunarPeriod[] = [];

  if (moonTimes.rise && !isNaN(moonTimes.rise.getTime())) {
    minorPeriods.push(createPeriod(moonTimes.rise, 2, date, timeZone));
  }

  if (moonTimes.set && !isNaN(moonTimes.set.getTime())) {
    minorPeriods.push(createPeriod(moonTimes.set, 2, date, timeZone));
  }

  // Sort periods by start time
  const sortedMajorPeriods = sortPeriods(majorPeriods);
  const sortedMinorPeriods = sortPeriods(minorPeriods);

  return {
    majorPeriods: sortedMajorPeriods,
    minorPeriods: sortedMinorPeriods,
    date: formatDate(date),
    sunRise: sunTimes.sunriseStart?.valid
      ? formatTime(sunTimes.sunriseStart.value, date, timeZone)
      : "",
    sunSet: sunTimes.sunsetStart?.valid
      ? formatTime(sunTimes.sunsetStart.value, date, timeZone)
      : "",
    moonRise: moonTimes.rise ? formatTime(moonTimes.rise, date, timeZone) : "",
    moonSet: moonTimes.set ? formatTime(moonTimes.set, date, timeZone) : "",
    moonPhase,
    moonIllumination: Math.round(moonIllum.fraction * 100),
    dayRating: dayRating.rating,
    dayRatingLabel: dayRating.label,
    tideStrength: tide.strength,
    tideType: tide.type,
  };
}

/**
 * Calculate moon upper and lower transit times using SunCalc.moonTransit()
 * Upper transit: Moon crosses meridian above horizon (moon overhead / "moon over")
 * Lower transit: Moon crosses meridian below horizon (moon underfoot / "moon under")
 *
 * Uses suncalc3's dedicated moonTransit() which computes both transits properly
 * from rise/set data, avoiding the inaccuracy of a fixed 12.42h offset.
 */
function calculateMoonTransits(
  date: Date,
  latitude: number,
  longitude: number,
  moonTimes: MoonTimes,
): { upperTransit: Date | null; lowerTransit: Date | null } {
  let upperTransit: Date | null = null;
  let lowerTransit: Date | null = null;

  // Use SunCalc.moonTransit() for accurate transit calculation
  if (
    moonTimes.rise &&
    moonTimes.set &&
    !isNaN(moonTimes.rise.getTime()) &&
    !isNaN(moonTimes.set.getTime())
  ) {
    const transit = SunCalc.moonTransit(
      moonTimes.rise,
      moonTimes.set,
      latitude,
      longitude,
    );

    if (transit.main && !isNaN(transit.main.getTime())) {
      upperTransit = transit.main;
    }

    if (transit.invert && !isNaN(transit.invert.getTime())) {
      lowerTransit = transit.invert;
    }
  }

  // If only one transit was found, estimate the other ~12.42h away (half lunar day)
  if (upperTransit && !lowerTransit) {
    lowerTransit = new Date(upperTransit.getTime() + 12.42 * 60 * 60 * 1000);
  } else if (lowerTransit && !upperTransit) {
    upperTransit = new Date(lowerTransit.getTime() + 12.42 * 60 * 60 * 1000);
  }

  // Last resort fallback for polar regions where moon doesn't rise/set
  if (
    !upperTransit &&
    moonTimes.highest &&
    !isNaN(moonTimes.highest.getTime())
  ) {
    upperTransit = moonTimes.highest;
  }

  if (!lowerTransit && upperTransit) {
    lowerTransit = new Date(upperTransit.getTime() + 12.42 * 60 * 60 * 1000);
  }

  return {
    upperTransit,
    lowerTransit,
  };
}

/**
 * Create a period centered on a given time
 * @param centerTime - The center point of the period
 * @param durationHours - Total duration in hours (period extends durationHours/2 on each side)
 * @param baseDate - Base date for formatting (to handle day boundaries)
 * @param timeZone - Optional IANA timezone (e.g., 'America/New_York', 'Australia/Sydney')
 */
function createPeriod(
  centerTime: Date,
  durationHours: number,
  baseDate: Date,
  timeZone?: string,
): SolunarPeriod {
  const halfDuration = (durationHours / 2) * 60 * 60 * 1000; // Convert to milliseconds

  const startTime = new Date(centerTime.getTime() - halfDuration);
  const endTime = new Date(centerTime.getTime() + halfDuration);

  return {
    start: formatTime(startTime, baseDate, timeZone),
    end: formatTime(endTime, baseDate, timeZone),
    startISO: formatISO(startTime, timeZone),
    endISO: formatISO(endTime, timeZone),
  };
}

/**
 * Format a Date as ISO-8601 with the UTC offset of the given timezone,
 * e.g. "2026-01-31T10:31:22+11:00". Defaults to UTC ("+00:00").
 */
function formatISO(date: Date, timeZone?: string): string {
  if (!date || isNaN(date.getTime())) {
    return "";
  }
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  const rawOffset = parts.timeZoneName ?? "GMT";
  let offset = rawOffset === "GMT" ? "+00:00" : rawOffset.replace("GMT", "");
  if (/^[+-]\d{2}$/.test(offset)) {
    offset += ":00";
  }
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/**
 * The timezone's UTC offset (local minus UTC) in milliseconds at the given
 * instant, e.g. +11h for Australia/Sydney, -5h for America/New_York.
 * Independent of process.env.TZ — uses Intl's explicit timeZone option.
 */
function getUtcOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  });
  const rawOffset =
    dtf.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ??
    "GMT";
  if (rawOffset === "GMT") return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(rawOffset);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

/**
 * suncalc3's day-window search (getSunTimes/getMoonTimes) anchors at LOCAL
 * midnight or noon via `.setHours()`, which only snaps to the correct
 * calendar day if the input instant already falls within that local day.
 * `date` here is UTC midnight of the target day; for a timezone ahead of
 * UTC that's already within the target local day (no-op), but for a
 * timezone behind UTC it falls in the PREVIOUS local day. Shift `date` to
 * the actual UTC instant of local midnight of the target day so `.setHours`
 * lands on the right day regardless of offset sign.
 *
 * The UTC offset itself can change between `date` and the shifted instant
 * if a DST transition falls at/near local midnight (e.g. America/Santiago's
 * fall-back transition is exactly at local midnight some years) — sampling
 * the offset only once can pick up the wrong side of that transition and
 * land a full day off, the very bug this function exists to prevent.
 * Iterate to a fixed point: re-sample the offset at each candidate instant
 * until it stops changing. Converges in at most 2 steps for any real-world
 * IANA transition (a single boundary can only be crossed once).
 */
function toLocalDayAnchor(date: Date, timeZone?: string): Date {
  if (!timeZone) return date;
  let anchored = date;
  for (let i = 0; i < 3; i++) {
    const next = new Date(date.getTime() - getUtcOffsetMs(anchored, timeZone));
    if (next.getTime() === anchored.getTime()) break;
    anchored = next;
  }
  return anchored;
}

/**
 * Format time to HH:MM string in the specified timezone
 * @param date - Date object to format (in UTC)
 * @param baseDate - Base date (unused but kept for backward compatibility)
 * @param timeZone - Optional IANA timezone. If not provided, uses UTC
 */
function formatTime(date: Date, baseDate: Date, timeZone?: string): string {
  if (!date || isNaN(date.getTime())) {
    return "";
  }

  if (timeZone) {
    // Convert UTC time to local timezone
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        // hour12: false is NOT reliably equivalent to hourCycle: "h23" across
        // ICU versions — on some builds (verified: Node 20.20.2 / ICU 78.2)
        // it resolves to hourCycle "h24" and renders midnight as "24:56"
        // instead of "00:56". Request h23 explicitly to avoid the ambiguity.
        hourCycle: "h23",
      });

      const parts = formatter.formatToParts(date);
      const hour = parts.find((p) => p.type === "hour")?.value || "00";
      const minute = parts.find((p) => p.type === "minute")?.value || "00";

      return `${hour}:${minute}`;
    } catch (error) {
      // If timezone is invalid, fall back to UTC
      console.warn(`Invalid timezone ${timeZone}, using UTC`);
    }
  }

  // Fallback to UTC
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Format date to YYYYMMDD string in UTC
 */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");

  return `${year}${month}${day}`;
}

/**
 * Get moon phase description from phase value
 * Phase: 0 = new moon, 0.25 = first quarter, 0.5 = full moon, 0.75 = last quarter
 */
function getMoonPhaseDescription(phase: number): string {
  if (phase < 0.0625) return "New Moon";
  if (phase < 0.1875) return "Waxing Crescent";
  if (phase < 0.3125) return "First Quarter";
  if (phase < 0.4375) return "Waxing Gibbous";
  if (phase < 0.5625) return "Full Moon";
  if (phase < 0.6875) return "Waning Gibbous";
  if (phase < 0.8125) return "Last Quarter";
  if (phase < 0.9375) return "Waning Crescent";
  return "New Moon";
}

/**
 * Sort periods chronologically by their ISO start timestamp
 */
function sortPeriods(periods: SolunarPeriod[]): SolunarPeriod[] {
  return [...periods].sort(
    (a, b) => Date.parse(a.startISO) - Date.parse(b.startISO),
  );
}
