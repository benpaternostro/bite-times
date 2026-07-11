# bite-times Value Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow bite-times from a single-function solunar calculator into the best offline fishing-times toolkit on npm: day ratings, ISO timestamps, multi-day ranges, a `npx bite-times` CLI, and accurate tide predictions via harmonic constituents.

**Architecture:** All changes are additive to the existing `calculateSolunarPeriods` API. Tide prediction lives in new subpath exports (`bite-times/tides`, `bite-times/noaa`) so the core stays lean; harmonic synthesis is delegated to `@neaps/tide-predictor` (MIT, TypeScript, zero-dep, dual CJS/ESM, validated to median 0.6 min / 5 mm against NOAA predictions across 3,370+ stations). The core gains an astronomy-only spring/neap tide-strength indicator that works offline for any location.

**Tech Stack:** TypeScript 5, tsup (CJS+ESM+dts), vitest, suncalc3 (existing), `@neaps/tide-predictor` ^0.10.0 (new, Task 7 only), `node:util` parseArgs for the CLI (no CLI framework).

## Global Constraints

- Node >= 18 (matches existing `engines`; needed for built-in `fetch` and `util.parseArgs`).
- No new runtime dependencies except `@neaps/tide-predictor@^0.10.0`, added in Task 7.
- Backward compatible: every existing exported name, signature, and field is unchanged; new fields are additive. One intentional behavior change (Task 1): an invalid IANA `timeZone` now throws `RangeError` instead of silently warning and falling back to UTC — document in CHANGELOG.
- `npm test` and `npm run typecheck` must pass at the end of every task.
- Keep suncalc3 as the astronomy engine — do not swap engines in this plan.
- Existing output style stays: `HH:MM` strings remain; new timestamp fields are ISO-8601 with UTC offset (e.g. `2026-01-31T10:31:00+11:00`).
- Tests never hit the network (the NOAA fetcher takes an injectable `fetch`).
- Conventional commits, one commit per task.
- Before Task 1: run `npm install` in the worktree if `node_modules` is missing.
- Windows dev environment: commands below are plain `npm`/`git` and work in PowerShell and bash alike.

## Non-goals (explicitly out of scope)

- Global tide times from bare lat/lon with no data: physically impossible offline without a multi-GB model or the 51 MB `@neaps/tide-database`. We document `neaps` as an opt-in companion instead of depending on it.
- Coordinate→timezone resolution (stays the caller's job, per README).
- Swapping suncalc3 for astronomy-engine (worth considering later to remove the `process.env.TZ` hack entirely; Task 10 mitigates instead).

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/solunar.ts` | Modify | Core calc: gains validation, ISO timestamps, rating/tide-strength wiring, `calculateSolunarRange`, browser guard |
| `src/suncalc3.d.ts` | Modify | Add `getMoonPosition` declaration (moon distance for rating) |
| `src/rating.ts` + `src/rating.test.ts` | Create | Day rating (0–5) pure function |
| `src/tide-strength.ts` + `src/tide-strength.test.ts` | Create | Spring/neap strength from moon phase (pure) |
| `src/cli.ts`, `src/cli-run.ts`, `src/cli.test.ts` | Create | `npx bite-times` CLI; `cli-run.ts` is the testable core |
| `src/tides.ts` + `src/tides.test.ts` | Create | Subpath `bite-times/tides`: harmonic tide events + solunar×tide combiner |
| `src/noaa.ts` + `src/noaa.test.ts` | Create | Subpath `bite-times/noaa`: fetch NOAA harmonic constituents |
| `src/index.ts` | Modify | Export new core functions/types (not tides/noaa — subpaths only, keeps core import lean) |
| `src/solunar.test.ts` | Modify | New integration tests |
| `package.json`, `tsup.config.ts` | Modify | bin, exports map, entries, dependency |
| `README.md`, `CHANGELOG.md` | Modify/Create | Docs + release notes |

---

### Task 1: Input validation

**Files:**
- Modify: `src/solunar.ts`
- Test: `src/solunar.test.ts`

**Interfaces:**
- Consumes: existing `calculateSolunarPeriods(latitude, longitude, date, timeZone?)`.
- Produces: same signature; throws `RangeError` for out-of-range lat/lon or invalid IANA timezone, `TypeError` for invalid `Date`. Later tasks (5, 6) rely on these exact error types.

- [ ] **Step 1: Write the failing tests**

Append to the top-level `describe("solunarCalculator")` block in `src/solunar.test.ts`:

```ts
describe("input validation", () => {
  const validDate = new Date("2026-01-31T00:00:00Z");

  it("throws RangeError for latitude out of range", () => {
    expect(() => calculateSolunarPeriods(91, 0, validDate)).toThrow(RangeError);
    expect(() => calculateSolunarPeriods(-91, 0, validDate)).toThrow(RangeError);
  });

  it("throws RangeError for longitude out of range", () => {
    expect(() => calculateSolunarPeriods(0, 181, validDate)).toThrow(RangeError);
    expect(() => calculateSolunarPeriods(0, -181, validDate)).toThrow(RangeError);
  });

  it("throws TypeError for an invalid date", () => {
    expect(() => calculateSolunarPeriods(0, 0, new Date("nope"))).toThrow(TypeError);
  });

  it("throws RangeError for an invalid IANA timezone", () => {
    expect(() => calculateSolunarPeriods(0, 0, validDate, "Not/AZone")).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the 4 new tests FAIL (no error thrown / warn-fallback behavior), all pre-existing tests PASS.

- [ ] **Step 3: Implement validation**

In `src/solunar.ts`, add this function above `calculateSolunarPeriods`:

```ts
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
```

Then make it the first statement of `calculateSolunarPeriods` (before the `originalTZ` line):

```ts
  validateInputs(latitude, longitude, date, timeZone);
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS. (The old silent-UTC-fallback path in `formatTime` is now unreachable for user input; leave it as defense in depth.)

- [ ] **Step 5: Commit**

```bash
git add src/solunar.ts src/solunar.test.ts
git commit -m "feat: validate latitude, longitude, date and timezone inputs"
```

---

### Task 2: ISO-8601 timestamps on periods (fixes midnight ambiguity)

**Files:**
- Modify: `src/solunar.ts`
- Test: `src/solunar.test.ts`

**Interfaces:**
- Consumes: `createPeriod`, `formatTime` internals from `src/solunar.ts`.
- Produces: `SolunarPeriod` gains required fields `startISO: string` and `endISO: string` (ISO-8601 with offset, e.g. `"2026-01-31T10:31:22+11:00"`). Tasks 6 and 9 consume `startISO`/`endISO`. `sortPeriods` now sorts chronologically by `startISO`.

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(p.startISO).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(p.startISO).toContain("+11:00"); // AEDT in January
    expect(p.startISO.slice(11, 16)).toBe(p.start);
    expect(p.endISO.slice(11, 16)).toBe(p.end);
    // Every period is exactly 2 hours — even across midnight
    expect(Date.parse(p.endISO) - Date.parse(p.startISO)).toBe(2 * 60 * 60 * 1000);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `startISO` is `undefined`.

- [ ] **Step 3: Implement**

In `src/solunar.ts`:

1. Extend the interface:

```ts
export interface SolunarPeriod {
  start: string; // HH:MM format
  end: string; // HH:MM format
  startISO: string; // ISO-8601 with offset, e.g. "2026-01-31T10:31:22+11:00"
  endISO: string;
}
```

2. Add `formatISO` next to `formatTime`:

```ts
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
```

3. Extend `createPeriod`'s return value:

```ts
  return {
    start: formatTime(startTime, baseDate, timeZone),
    end: formatTime(endTime, baseDate, timeZone),
    startISO: formatISO(startTime, timeZone),
    endISO: formatISO(endTime, timeZone),
  };
```

4. Replace `sortPeriods` (and delete the now-unused `timeToMinutes` helper) so ordering is chronological rather than by clock time:

```ts
/**
 * Sort periods chronologically by their ISO start timestamp
 */
function sortPeriods(periods: SolunarPeriod[]): SolunarPeriod[] {
  return [...periods].sort(
    (a, b) => Date.parse(a.startISO) - Date.parse(b.startISO),
  );
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS (existing Sydney/New York expectations are already in chronological order).

- [ ] **Step 5: Commit**

```bash
git add src/solunar.ts src/solunar.test.ts
git commit -m "feat: add ISO-8601 startISO/endISO to periods and sort chronologically"
```

---

### Task 3: Day rating (0–5)

**Files:**
- Create: `src/rating.ts`
- Test: `src/rating.test.ts`
- Modify: `src/solunar.ts`, `src/suncalc3.d.ts`, `src/index.ts`, `src/solunar.test.ts`

**Interfaces:**
- Consumes: `moonIllum.phaseValue`, `SunCalc.getMoonPosition(date, lat, lng).distance` (declaration added here), transit/rise/set Dates already computed in `calculateSolunarPeriods`.
- Produces: `computeDayRating(input: DayRatingInput): DayRating` where `DayRating = { rating: number; label: DayRatingLabel }` and `DayRatingLabel = "Poor" | "Fair" | "Good" | "Great" | "Excellent"`. `SolunarData` gains `dayRating: number` and `dayRatingLabel: DayRatingLabel`. Task 6 consumes both fields.

- [ ] **Step 1: Write the failing unit tests**

Create `src/rating.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeDayRating } from "./rating";

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `./rating` module not found.

- [ ] **Step 3: Implement `src/rating.ts`**

```ts
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
```

- [ ] **Step 4: Run unit tests**

Run: `npm test`
Expected: rating tests PASS.

- [ ] **Step 5: Wire into `calculateSolunarPeriods`**

1. In `src/suncalc3.d.ts`, add inside `declare module "suncalc3"`:

```ts
  export interface MoonPosition {
    azimuth: number;
    altitude: number;
    /** Earth–moon distance in km */
    distance: number;
    parallacticAngle: number;
  }
```

and add to the `SunCalc` const declaration:

```ts
    getMoonPosition(
      dateValue: Date | number,
      lat: number,
      lng: number,
    ): MoonPosition;
```

2. In `src/solunar.ts`:

```ts
import { computeDayRating, type DayRatingLabel } from "./rating";
```

Extend `SolunarData`:

```ts
  /** Heuristic day quality, 0–5 (see README "Day rating") */
  dayRating: number;
  dayRatingLabel: DayRatingLabel;
```

Inside `calculateSolunarPeriods`, after the transit calculation (before the TZ restore block is fine — moon distance does not depend on TZ):

```ts
  const moonPosition = SunCalc.getMoonPosition(date, latitude, longitude);
```

After the TZ restore block:

```ts
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
```

Add to the returned object:

```ts
    dayRating: dayRating.rating,
    dayRatingLabel: dayRating.label,
```

3. In `src/index.ts`:

```ts
export { calculateSolunarPeriods } from "./solunar";
export type { SolunarData, SolunarPeriod } from "./solunar";
export { computeDayRating } from "./rating";
export type { DayRating, DayRatingInput, DayRatingLabel } from "./rating";
```

4. Add an integration test in `src/solunar.test.ts`:

```ts
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
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/rating.ts src/rating.test.ts src/solunar.ts src/suncalc3.d.ts src/index.ts src/solunar.test.ts
git commit -m "feat: add 0-5 day rating from moon phase, distance and dawn/dusk overlap"
```

---

### Task 4: Spring/neap tide strength (core, offline, global)

**Files:**
- Create: `src/tide-strength.ts`
- Test: `src/tide-strength.test.ts`
- Modify: `src/solunar.ts`, `src/index.ts`, `src/solunar.test.ts`

**Interfaces:**
- Consumes: `moonIllum.phaseValue` (already computed).
- Produces: `computeTideStrength(phaseValue: number): TideStrength` where `TideStrength = { strength: number; type: "spring" | "mid" | "neap" }`. `SolunarData` gains `tideStrength: number` (0–100) and `tideType: "spring" | "mid" | "neap"`. Task 6 consumes both fields.

Note: this is the astronomical tide *forcing* (spring vs neap), which is global and accurate — it is not a tide *time* prediction. Actual high/low water times require station constituents (Task 7).

- [ ] **Step 1: Write the failing tests**

Create `src/tide-strength.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `./tide-strength` module not found.

- [ ] **Step 3: Implement `src/tide-strength.ts`**

```ts
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
  const distToSyzygy = Math.min(
    phaseValue,
    Math.abs(phaseValue - 0.5),
    1 - phaseValue,
  );
  const strength = Math.round(100 * (1 - distToSyzygy / 0.25));
  const type = strength >= 67 ? "spring" : strength <= 33 ? "neap" : "mid";
  return { strength, type };
}
```

- [ ] **Step 4: Wire into core and exports**

In `src/solunar.ts`:

```ts
import { computeTideStrength } from "./tide-strength";
```

Extend `SolunarData`:

```ts
  /** Astronomical tide forcing 0–100 (100 = strongest spring tide) */
  tideStrength: number;
  tideType: "spring" | "mid" | "neap";
```

In `calculateSolunarPeriods`, next to the rating computation:

```ts
  const tide = computeTideStrength(moonIllum.phaseValue);
```

Add to the returned object:

```ts
    tideStrength: tide.strength,
    tideType: tide.type,
```

In `src/index.ts` add:

```ts
export { computeTideStrength } from "./tide-strength";
export type { TideStrength } from "./tide-strength";
```

Integration test in `src/solunar.test.ts`:

```ts
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
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tide-strength.ts src/tide-strength.test.ts src/solunar.ts src/index.ts src/solunar.test.ts
git commit -m "feat: add spring/neap tide strength indicator to core output"
```

---

### Task 5: Multi-day range helper

**Files:**
- Modify: `src/solunar.ts`, `src/index.ts`
- Test: `src/solunar.test.ts`

**Interfaces:**
- Consumes: `calculateSolunarPeriods` (Task 1 validation errors propagate).
- Produces: `calculateSolunarRange(latitude: number, longitude: number, startDate: Date, days: number, timeZone?: string): SolunarData[]`. Task 6 (CLI) consumes this exact signature.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

Also add `calculateSolunarRange` to the import at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `calculateSolunarRange` is not exported.

- [ ] **Step 3: Implement**

In `src/solunar.ts`:

```ts
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
```

In `src/index.ts`, extend the first export line:

```ts
export { calculateSolunarPeriods, calculateSolunarRange } from "./solunar";
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/solunar.ts src/index.ts src/solunar.test.ts
git commit -m "feat: add calculateSolunarRange for multi-day forecasts"
```

---

### Task 6: CLI (`npx bite-times`)

**Files:**
- Create: `src/cli.ts`, `src/cli-run.ts`, `src/cli.test.ts`
- Modify: `package.json`, `tsup.config.ts`

**Interfaces:**
- Consumes: `calculateSolunarRange` (Task 5), `SolunarData` fields `dayRating`, `dayRatingLabel`, `tideStrength`, `tideType` (Tasks 3–4), `moonPhase`, `moonIllumination`, `sunRise/sunSet/moonRise/moonSet`, `majorPeriods/minorPeriods`.
- Produces: `runCli(argv: string[]): { exitCode: number; output: string }` (pure, testable); `dist/cli.js` bin entry named `bite-times`.

Gotcha documented up front: Node's `parseArgs` treats a leading `-` as an option, so negative coordinates must use the `--lat=-33.85` form. The usage text and all examples use `=`.

- [ ] **Step 1: Write the failing tests**

Create `src/cli.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runCli } from "./cli-run";

describe("runCli", () => {
  const sydney = [
    "--lat=-33.8568",
    "--lon=151.2153",
    "--date=2026-01-31",
    "--tz=Australia/Sydney",
  ];

  it("prints machine-readable JSON with --json", () => {
    const { exitCode, output } = runCli([...sydney, "--json"]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(output);
    expect(data.date).toBe("20260131");
    expect(data.majorPeriods).toHaveLength(2);
    expect(data.dayRating).toBeGreaterThanOrEqual(0);
  });

  it("prints a readable day summary by default", () => {
    const { exitCode, output } = runCli(sydney);
    expect(exitCode).toBe(0);
    expect(output).toContain("2026-01-31 (Australia/Sydney)");
    expect(output).toContain("Rating");
    expect(output).toContain("Major");
    expect(output).toContain("Minor");
  });

  it("returns an array for multi-day --json output", () => {
    const { exitCode, output } = runCli([...sydney, "--days=3", "--json"]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(output);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(3);
  });

  it("fails with usage when coordinates are missing", () => {
    const { exitCode, output } = runCli([]);
    expect(exitCode).toBe(1);
    expect(output).toContain("--lat and --lon are required");
    expect(output).toContain("Usage:");
  });

  it("shows help with --help", () => {
    const { exitCode, output } = runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(output).toContain("Usage:");
  });

  it("fails cleanly on a malformed date", () => {
    const { exitCode, output } = runCli([
      "--lat=0",
      "--lon=0",
      "--date=31/01/2026",
    ]);
    expect(exitCode).toBe(1);
    expect(output).toContain("YYYY-MM-DD");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `./cli-run` module not found.

- [ ] **Step 3: Implement `src/cli-run.ts`**

```ts
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
    return { exitCode: 1, output: `Error: ${(error as Error).message}\n\n${USAGE}` };
  }

  if (values.help) {
    return { exitCode: 0, output: USAGE };
  }
  if (values.lat === undefined || values.lon === undefined) {
    return { exitCode: 1, output: `Error: --lat and --lon are required.\n\n${USAGE}` };
  }

  const days = values.days === undefined ? 1 : Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    return { exitCode: 1, output: "Error: --days must be an integer between 1 and 60." };
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
```

Create `src/cli.ts` (the shebang is preserved by esbuild/tsup):

```ts
#!/usr/bin/env node
import { runCli } from "./cli-run";

const { exitCode, output } = runCli(process.argv.slice(2));
if (exitCode === 0) {
  console.log(output);
} else {
  console.error(output);
}
process.exit(exitCode);
```

- [ ] **Step 4: Wire up build + bin**

`tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node18",
});
```

`package.json` — add after `"types"`:

```json
  "bin": {
    "bite-times": "./dist/cli.js"
  },
```

- [ ] **Step 5: Run tests + typecheck + smoke test**

Run: `npm test && npm run typecheck && npm run build`
Then: `node dist/cli.js --lat=-33.8568 --lon=151.2153 --date=2026-01-31 --tz=Australia/Sydney`
Expected: tests PASS; the smoke run prints the day summary with Rating/Sun/Moon/Major/Minor lines and exits 0. Also verify `node dist/cli.js --help` exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts src/cli-run.ts src/cli.test.ts package.json tsup.config.ts
git commit -m "feat: add npx bite-times CLI with pretty and JSON output"
```

---

### Task 7: Tide predictions from harmonic constituents (`bite-times/tides`)

**Files:**
- Create: `src/tides.ts`, `src/tides.test.ts`
- Modify: `package.json`, `tsup.config.ts`

**Interfaces:**
- Consumes: `createTidePredictor(constituents, options?)` from `@neaps/tide-predictor` — constituents are `{ name, amplitude, phase, speed }`; `.getExtremesPrediction({ start, end })` returns `[{ time: Date, level: number, high: boolean, low: boolean, label: string }]`. All internal math is UTC.
- Produces: `predictTideEvents(input: TidePredictionInput): TideEvent[]` with `TideEvent = { time: Date; timeISO: string; level: number; type: "high" | "low" }` and `TideConstituent = { name: string; amplitude: number; phase: number; speed: number }`. Tasks 8 and 9 consume `TideConstituent` and `TideEvent` respectively.

- [ ] **Step 1: Add the dependency**

Run: `npm install @neaps/tide-predictor@^0.10.0`
Expected: package.json `dependencies` gains the entry; install succeeds (~420 KB, zero transitive deps, ships CJS + ESM + types).

- [ ] **Step 2: Write the failing tests**

Create `src/tides.test.ts`. A single M2 constituent (principal lunar semidiurnal, period 12.4206 h) gives a known sinusoid — extremes must alternate high/low roughly every 6.21 h at level ≈ ±amplitude — so the test needs no external station data:

```ts
import { describe, it, expect } from "vitest";
import { predictTideEvents } from "./tides";

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
      expect(event.type === "high" ? event.level : -event.level).toBeGreaterThan(0);
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
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `./tides` module not found.

- [ ] **Step 4: Implement `src/tides.ts`**

```ts
import { createTidePredictor } from "@neaps/tide-predictor";

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
    throw new RangeError("start and end must be valid Dates with end after start");
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
```

Implementation note: if the level-sign assertion in Step 2 fails because `@neaps/tide-predictor` applies nodal corrections differently than expected, relax only the `0.2` tolerance (up to `0.3`) — do not delete the alternation or spacing assertions; they are the correctness core.

- [ ] **Step 5: Wire up subpath export + build entry**

`tsup.config.ts` entry becomes:

```ts
  entry: ["src/index.ts", "src/cli.ts", "src/tides.ts"],
```

`package.json` exports map gains (keep the existing `"."` entry):

```json
    "./tides": {
      "import": {
        "types": "./dist/tides.d.mts",
        "default": "./dist/tides.mjs"
      },
      "require": {
        "types": "./dist/tides.d.ts",
        "default": "./dist/tides.js"
      }
    }
```

- [ ] **Step 6: Run tests + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS; `dist/tides.js`, `dist/tides.mjs`, `dist/tides.d.ts` exist.

- [ ] **Step 7: Commit**

```bash
git add src/tides.ts src/tides.test.ts package.json package-lock.json tsup.config.ts
git commit -m "feat: add bite-times/tides harmonic tide prediction subpath"
```

---

### Task 8: NOAA constituent fetcher (`bite-times/noaa`)

**Files:**
- Create: `src/noaa.ts`, `src/noaa.test.ts`
- Modify: `package.json`, `tsup.config.ts`

**Interfaces:**
- Consumes: `TideConstituent` type from `./tides` (Task 7); global `fetch` (Node 18+).
- Produces: `fetchNoaaConstituents(stationId: string, fetchImpl?: typeof fetch): Promise<TideConstituent[]>`. US NOAA stations only; documented as such.

- [ ] **Step 1: Write the failing tests**

Create `src/noaa.test.ts` (fetch is injected — no network in tests):

```ts
import { describe, it, expect } from "vitest";
import { fetchNoaaConstituents } from "./noaa";

const sampleBody = {
  HarmonicConstituents: [
    { name: "M2", amplitude: 0.55, phase_GMT: 271.6, speed: 28.984104 },
    { name: "K1", amplitude: 0.33, phase_GMT: 96.9, speed: 15.041069 },
    { name: "Z0", amplitude: 0, phase_GMT: 0, speed: 0 },
  ],
  units: "meters",
};

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchNoaaConstituents", () => {
  it("maps the NOAA harcon response and drops zero-amplitude entries", async () => {
    const constituents = await fetchNoaaConstituents(
      "9410170",
      fakeFetch(200, sampleBody),
    );
    expect(constituents).toEqual([
      { name: "M2", amplitude: 0.55, phase: 271.6, speed: 28.984104 },
      { name: "K1", amplitude: 0.33, phase: 96.9, speed: 15.041069 },
    ]);
  });

  it("throws on HTTP errors", async () => {
    await expect(
      fetchNoaaConstituents("9410170", fakeFetch(404, {})),
    ).rejects.toThrow("HTTP 404");
  });

  it("throws when a station has no constituents", async () => {
    await expect(
      fetchNoaaConstituents("9410170", fakeFetch(200, { HarmonicConstituents: [] })),
    ).rejects.toThrow(/no harmonic constituents/i);
  });

  it("rejects malformed station ids without fetching", async () => {
    await expect(fetchNoaaConstituents("abc")).rejects.toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `./noaa` module not found.

- [ ] **Step 3: Implement `src/noaa.ts`**

```ts
import type { TideConstituent } from "./tides";

interface NoaaHarconResponse {
  HarmonicConstituents?: Array<{
    name: string;
    amplitude: number;
    phase_GMT: number;
    speed: number;
  }>;
  units?: string;
}

/**
 * Fetch a NOAA CO-OPS station's harmonic constituents (metric units,
 * GMT phases) and map them to bite-times TideConstituent format.
 * US stations only — find station ids at https://tidesandcurrents.noaa.gov.
 * Fetch once and cache/ship the result: constituents change rarely
 * (they are re-derived from observations only every few years).
 */
export async function fetchNoaaConstituents(
  stationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TideConstituent[]> {
  if (!/^\d{7}$/.test(stationId)) {
    throw new RangeError(
      `stationId must be a 7-digit NOAA station id, got '${stationId}'`,
    );
  }
  const url = `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${stationId}/harcon.json?units=metric`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `NOAA harcon request failed for station ${stationId}: HTTP ${response.status}`,
    );
  }
  const body = (await response.json()) as NoaaHarconResponse;
  const constituents = (body.HarmonicConstituents ?? [])
    .filter((c) => c.amplitude > 0)
    .map((c) => ({
      name: c.name,
      amplitude: c.amplitude,
      phase: c.phase_GMT,
      speed: c.speed,
    }));
  if (constituents.length === 0) {
    throw new Error(
      `Station ${stationId} returned no harmonic constituents ` +
        `(subordinate stations have none — use the reference station instead)`,
    );
  }
  return constituents;
}
```

- [ ] **Step 4: Wire up subpath export + build entry**

`tsup.config.ts` entry becomes:

```ts
  entry: ["src/index.ts", "src/cli.ts", "src/tides.ts", "src/noaa.ts"],
```

`package.json` exports map gains:

```json
    "./noaa": {
      "import": {
        "types": "./dist/noaa.d.mts",
        "default": "./dist/noaa.mjs"
      },
      "require": {
        "types": "./dist/noaa.d.ts",
        "default": "./dist/noaa.js"
      }
    }
```

- [ ] **Step 5: Run tests + typecheck + one manual live check**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

Manual live check (once, not in CI):

```bash
curl -s "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9410170/harcon.json?units=metric" | head -c 400
```

Expected: JSON starting with `{"units": "meters", "HarmonicConstituents": [{"number": 1, "name": "M2", ...`. If the field names differ from `NoaaHarconResponse`, fix the interface to match reality before committing.

- [ ] **Step 6: Commit**

```bash
git add src/noaa.ts src/noaa.test.ts package.json tsup.config.ts
git commit -m "feat: add bite-times/noaa constituent fetcher for NOAA stations"
```

---

### Task 9: Solunar × tide combination

**Files:**
- Modify: `src/tides.ts`
- Test: `src/tides.test.ts`

**Interfaces:**
- Consumes: `SolunarData`, `SolunarPeriod` (with `startISO`/`endISO` from Task 2), `TideEvent` (Task 7).
- Produces: `combineSolunarWithTides(solunar: SolunarData, tides: TideEvent[], windowMinutes?: number): TideAwarePeriod[]` where `TideAwarePeriod = SolunarPeriod & { periodType: "major" | "minor"; coincidesWithTideChange: boolean }`.

- [ ] **Step 1: Write the failing test**

Append to `src/tides.test.ts` (add the new imports at the top):

```ts
import { calculateSolunarPeriods } from "./index";
import { combineSolunarWithTides, type TideEvent } from "./tides";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `combineSolunarWithTides` is not exported.

- [ ] **Step 3: Implement in `src/tides.ts`**

Add the import at the top:

```ts
import type { SolunarData, SolunarPeriod } from "./solunar";
```

Append:

```ts
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
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tides.ts src/tides.test.ts
git commit -m "feat: add combineSolunarWithTides to flag periods near tide changes"
```

---

### Task 10: Browser/runtime guard for the TZ workaround

**Files:**
- Modify: `src/solunar.ts`
- Test: `src/solunar.test.ts`

**Interfaces:**
- Consumes: the existing `process.env.TZ` set/restore block in `calculateSolunarPeriods`.
- Produces: importing the module never touches `process`; calling with a `timeZone` in an environment without `process.env` throws a clear `Error` — unless the ambient timezone already matches, in which case results are correct and computation proceeds.

Background: suncalc3 computes with local `Date` methods, so outside Node the ambient timezone silently determines results. Today the code would either throw a confusing `ReferenceError` (bundlers without process shims) or return wrong times. This task makes the failure mode explicit and documents the one safe browser path.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — currently throws `ReferenceError: process is not defined` (message does not match `/requires Node/`).

- [ ] **Step 3: Implement**

In `calculateSolunarPeriods`, replace the block from `const originalTZ = process.env.TZ;` through the end of the TZ-probe `if (timeZone) { ... }` with:

```ts
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
```

And replace the restore block with:

```ts
  // Restore original TZ
  if (timeZone && canSetTZ) {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS (including every pre-existing timezone test — Node path behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/solunar.ts src/solunar.test.ts
git commit -m "fix: fail clearly instead of crashing when timeZone is used outside Node"
```

---

### Task 11: README, CHANGELOG, release prep (v1.1.0)

**Files:**
- Modify: `README.md`, `package.json`
- Create: `CHANGELOG.md`

**Interfaces:**
- Consumes: everything shipped in Tasks 1–10.
- Produces: docs for every new feature; version `1.1.0`; publish checklist executed by the maintainer.

- [ ] **Step 1: Update README.md**

Make these edits (keep the existing voice — dry, honest, no marketing):

1. Update the intro paragraph's feature list to mention day rating, tide strength, multi-day ranges, the CLI, and optional tide predictions.

2. Add a **CLI** section after **Install**:

````markdown
## CLI

```bash
npx bite-times --lat=-33.8568 --lon=151.2153 --tz=Australia/Sydney
```

```
2026-01-31 (Australia/Sydney)
  Rating ★★★★☆ 3.9 Great · Waxing Gibbous 96% · spring tide (84)
  Sun    06:16 → 20:00
  Moon   19:06 → 03:56
  Major  10:31–12:31, 22:56–00:56
  Minor  02:56–04:56, 18:06–20:06
```

Flags: `--date=YYYY-MM-DD` (default today), `--days=N` (1–60), `--json`,
`--help`. Use the `--lat=-33.85` form — a bare `-33.85` is parsed as a flag.
````

3. Extend the documented `SolunarPeriod`/`SolunarData` interfaces with the new fields (`startISO`, `endISO`, `dayRating`, `dayRatingLabel`, `tideStrength`, `tideType`) and add a short **Day rating** subsection explaining the three heuristic components (syzygy proximity 0–2, moon distance 0–1.5, dawn/dusk overlap 0–1.5) and that it is guidance, not science.

4. Document `calculateSolunarRange(latitude, longitude, startDate, days, timeZone?)`.

5. Add a **Tides** section:

````markdown
## Tides (optional)

Solunar periods say when fish feed; tides say when the water moves. For
saltwater fishing you usually want both.

**What works offline anywhere:** `tideStrength`/`tideType` in the core
output — the astronomical spring/neap cycle derived from the moon phase.

**What needs station data:** actual high/low water *times*. Tides are
dominated by local coastline shape, so they cannot be computed from
coordinates alone — you need harmonic constituents for a nearby tide
station. Given those, prediction is accurate to within a few minutes:

```ts
import { predictTideEvents, combineSolunarWithTides } from "bite-times/tides";
import { fetchNoaaConstituents } from "bite-times/noaa"; // US stations

const constituents = await fetchNoaaConstituents("9410170"); // San Diego
const tides = predictTideEvents({
  constituents,
  start: new Date("2026-01-31T00:00:00Z"),
  end: new Date("2026-02-01T00:00:00Z"),
});
// [{ time, timeISO, level, type: "high" | "low" }, ...]

const periods = combineSolunarWithTides(solunarData, tides);
// solunar periods flagged with coincidesWithTideChange
```

Constituents change rarely — fetch once, then everything runs offline.
Outside the US, get constituents from your national hydrographic office,
or use the [neaps](https://github.com/openwatersio/neaps) package (bundles
a ~51 MB worldwide station database). Harmonic prediction does not model
weather (storm surge, wind). Not for navigation.
````

6. In **Timezone notes**, add one line: outside Node (browsers/workers), passing `timeZone` throws unless it matches the ambient zone.

- [ ] **Step 2: Create CHANGELOG.md**

```markdown
# Changelog

## 1.1.0 — unreleased

### Added

- `dayRating` (0–5) and `dayRatingLabel` — heuristic day quality from moon
  phase, moon distance, and solunar/dawn-dusk overlap
- `startISO`/`endISO` on periods — full ISO-8601 timestamps that make
  midnight-spanning periods unambiguous
- `tideStrength` (0–100) and `tideType` (`spring`/`mid`/`neap`) — offline
  astronomical tide forcing
- `calculateSolunarRange()` — multi-day forecasts
- `npx bite-times` CLI with pretty and `--json` output
- `bite-times/tides` — high/low tide prediction from harmonic constituents
  (via @neaps/tide-predictor), plus `combineSolunarWithTides()`
- `bite-times/noaa` — fetch harmonic constituents for NOAA (US) stations

### Changed

- Invalid `latitude`/`longitude`/`date` now throw instead of returning
  garbage; an invalid IANA `timeZone` now throws `RangeError` instead of
  warning and silently using UTC
- Periods are sorted chronologically (previously by wall-clock time, which
  misordered midnight-spanning periods)
- Outside Node.js, passing `timeZone` now throws a descriptive error
  instead of crashing with `ReferenceError: process is not defined`
```

- [ ] **Step 3: Bump version**

In `package.json`: `"version": "1.1.0"`. Add keywords `"tides"`, `"tide times"`, `"cli"`, `"fishing forecast"` to the keywords array.

- [ ] **Step 4: Full verification**

Run: `npm run prepublishOnly` (runs typecheck + build + test)
Then: `npm pack --dry-run`
Expected: everything green; the tarball contains `dist/` (including `cli.js`, `tides.*`, `noaa.*`), README, CHANGELOG, LICENSE; size well under 1 MB.

Smoke the packed CLI one more time: `node dist/cli.js --lat=-33.8568 --lon=151.2153 --date=2026-01-31 --tz=Australia/Sydney --days=2`
Expected: two day blocks, exit 0.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "docs: document rating, tides, CLI; prepare 1.1.0 release"
```

- [ ] **Step 6: Release (maintainer action, after merge to main)**

```bash
git tag v1.1.0
npm publish
git push origin main --tags
```

---

## Self-Review Notes

- **Spec coverage:** tide info (Tasks 4, 7, 8, 9 — with the honest accuracy story), package value (Tasks 1–5 close the gaps vs. commercial solunar tables), CLI (Task 6), docs/release (Task 11). ✓
- **Type consistency:** `SolunarPeriod.startISO/endISO` defined in Task 2, consumed in Tasks 6/9; `TideConstituent`/`TideEvent` defined in Task 7, consumed in Tasks 8/9; `dayRating`/`dayRatingLabel`/`tideStrength`/`tideType` defined in Tasks 3–4, consumed in Task 6. ✓
- **Known risks:** (1) `@neaps/tide-predictor`'s nodal corrections may shift the M2 test levels a few percent — tolerance note in Task 7 Step 4. (2) NOAA harcon field names verified live in Task 8 Step 5 before commit. (3) `Intl` `longOffset` requires Node 18's full-ICU builds — official Node 18+ binaries all ship full-ICU.
