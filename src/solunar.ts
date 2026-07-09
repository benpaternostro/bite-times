import SunCalc, { type MoonTimes } from "suncalc3";

export interface SolunarPeriod {
  start: string; // HH:MM format
  end: string; // HH:MM format
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
  // suncalc3 internally uses local Date methods (.getDate(), .setDate(), .setHours())
  // which depend on process.env.TZ. To get correct results for any location regardless
  // of the server's timezone, temporarily set TZ to the target timezone.
  // IMPORTANT: Requires tzdata package on Alpine Linux (see Dockerfile).
  const originalTZ = process.env.TZ;
  if (timeZone) {
    process.env.TZ = timeZone;

    // Verify TZ change took effect (fails silently on Alpine without tzdata)
    const probe = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    const localHour = probe.getHours();
    const utcHour = probe.getUTCHours();
    if (
      localHour === utcHour &&
      !timeZone.includes("UTC") &&
      timeZone !== "Etc/GMT" &&
      timeZone !== "Etc/UTC"
    ) {
      console.warn(
        `⚠️ process.env.TZ='${timeZone}' did not change Date behavior (getHours()=${localHour} === getUTCHours()=${utcHour}). ` +
          `Timezone data may be missing (e.g., Alpine Linux needs 'apk add tzdata'). Solunar calculations will be incorrect.`,
      );
    }
  }

  // Get sun times
  const sunTimes = SunCalc.getSunTimes(date, latitude, longitude);

  // Get moon times
  const moonTimes = SunCalc.getMoonTimes(date, latitude, longitude);

  // Get moon illumination
  const moonIllum = SunCalc.getMoonIllumination(date);

  // Calculate moon transit times (highest and lowest points)
  const { upperTransit, lowerTransit } = calculateMoonTransits(
    date,
    latitude,
    longitude,
    moonTimes,
  );

  // Restore original TZ
  if (originalTZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTZ;
  }

  // Calculate moon phase description
  const moonPhase = getMoonPhaseDescription(moonIllum.phaseValue);

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
    sunRise: sunTimes.sunriseStart?.value
      ? formatTime(sunTimes.sunriseStart.value, date, timeZone)
      : "",
    sunSet: sunTimes.sunsetStart?.value
      ? formatTime(sunTimes.sunsetStart.value, date, timeZone)
      : "",
    moonRise: moonTimes.rise ? formatTime(moonTimes.rise, date, timeZone) : "",
    moonSet: moonTimes.set ? formatTime(moonTimes.set, date, timeZone) : "",
    moonPhase,
    moonIllumination: Math.round(moonIllum.fraction * 100),
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
  };
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
        hour12: false,
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
 * Sort periods by start time (converting HH:MM to minutes for comparison)
 */
function sortPeriods(periods: SolunarPeriod[]): SolunarPeriod[] {
  return [...periods].sort((a, b) => {
    const aMinutes = timeToMinutes(a.start);
    const bMinutes = timeToMinutes(b.start);
    return aMinutes - bMinutes;
  });
}

/**
 * Convert HH:MM time string to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  const [hoursStr, minutesStr] = timeStr.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  return hours * 60 + minutes;
}
