import { parseArgs } from "node:util";
import { calculateSolunarRange, type SolunarData } from "./solunar";

const USAGE = `Usage: bite-times --lat=<latitude> --lon=<longitude> [options]

Options:
  --lat=<num>    Latitude in decimal degrees (-90..90). Use '=' for negatives.
  --lon=<num>    Longitude in decimal degrees (-180..180)
  --date=<date>  Calendar day as YYYY-MM-DD (default: today, UTC)
  --tz=<zone>    IANA timezone for output times (default: UTC)
  --days=<n>     Consecutive days to calculate, 1-60 (default: 1)
  --json         Output raw JSON instead of a summary
  --help         Show this help

Example:
  npx bite-times --lat=-33.8568 --lon=151.2153 --tz=Australia/Sydney`;

export function runCli(argv: string[]): { exitCode: number; output: string } {
  let values: {
    lat?: string;
    lon?: string;
    date?: string;
    tz?: string;
    days?: string;
    json?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        lat: { type: "string" },
        lon: { type: "string" },
        date: { type: "string" },
        tz: { type: "string" },
        days: { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    return {
      exitCode: 1,
      output: `Error: ${(error as Error).message}\n\n${USAGE}`,
    };
  }

  if (values.help) {
    return { exitCode: 0, output: USAGE };
  }
  if (!values.lat || !values.lon) {
    return {
      exitCode: 1,
      output: `Error: --lat and --lon are required.\n\n${USAGE}`,
    };
  }

  const days = values.days === undefined ? 1 : Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    return {
      exitCode: 1,
      output: "Error: --days must be an integer between 1 and 60.",
    };
  }

  const dateStr = values.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { exitCode: 1, output: "Error: --date must be YYYY-MM-DD." };
  }

  try {
    const results = calculateSolunarRange(
      Number(values.lat),
      Number(values.lon),
      new Date(`${dateStr}T00:00:00Z`),
      days,
      values.tz,
    );
    if (values.json) {
      const payload = days === 1 ? results[0] : results;
      return { exitCode: 0, output: JSON.stringify(payload, null, 2) };
    }
    return {
      exitCode: 0,
      output: results.map((day) => formatDay(day, values.tz)).join("\n\n"),
    };
  } catch (error) {
    return { exitCode: 1, output: `Error: ${(error as Error).message}` };
  }
}

function stars(rating: number): string {
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function formatDay(day: SolunarData, tz?: string): string {
  const isoDate = `${day.date.slice(0, 4)}-${day.date.slice(4, 6)}-${day.date.slice(6, 8)}`;
  const periods = (list: { start: string; end: string }[]) =>
    list.length ? list.map((p) => `${p.start}–${p.end}`).join(", ") : "—";
  return [
    `${isoDate} (${tz ?? "UTC"})`,
    `  Rating ${stars(day.dayRating)} ${day.dayRating.toFixed(1)} ${day.dayRatingLabel} · ${day.moonPhase} ${day.moonIllumination}% · ${day.tideType} tide (${day.tideStrength})`,
    `  Sun    ${day.sunRise || "—"} → ${day.sunSet || "—"}`,
    `  Moon   ${day.moonRise || "—"} → ${day.moonSet || "—"}`,
    `  Major  ${periods(day.majorPeriods)}`,
    `  Minor  ${periods(day.minorPeriods)}`,
  ].join("\n");
}
