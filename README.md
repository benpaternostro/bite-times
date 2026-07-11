# bite-times

Solunar bite times calculator for fishing. Computes major/minor feeding
periods, sunrise/sunset, moonrise/moonset, moon phase and illumination, a
0–5 day rating, and spring/neap tide strength for any location and date —
no API calls, works offline. Multi-day forecasts, a `npx bite-times` CLI,
and optional high/low tide predictions from harmonic constituents.

Based on the Solunar Theory (John Alden Knight, 1936):

- **Major periods** (2 h): centered on the moon's upper and lower meridian
  transits (moon overhead / moon underfoot)
- **Minor periods** (2 h): centered on moonrise and moonset

Astronomy is computed locally by [suncalc3](https://github.com/hypnos3/suncalc3),
the package's only npm dependency. Tide prediction (the optional
`bite-times/tides` subpath, see [Tides](#tides-optional)) vendors its
harmonic synthesis algorithm from
[@neaps/tide-predictor](https://github.com/neaps/tide-predictor) (MIT
licensed) directly into `bite-times`' own source — not as an npm
dependency — so there is no separate package to install and nothing added
to `node_modules`. Neither makes a network call.

## Install

```bash
npm install bite-times
```

Requires Node.js 18+. Ships CJS and ESM builds with TypeScript types.

## CLI

```bash
npx bite-times --lat=-33.8568 --lon=151.2153 --tz=Australia/Sydney
```

```
2026-01-31 (Australia/Sydney)
  Rating ★★★★☆ 3.5 Great · Waxing Gibbous 96% · spring tide (74)
  Sun    06:16 → 20:00
  Moon   19:06 → 03:56
  Major  10:31–12:31, 22:56–00:56
  Minor  02:56–04:56, 18:06–20:06
```

Flags: `--date=YYYY-MM-DD` (default today), `--days=N` (1–60), `--json`,
`--help`. Use the `--lat=-33.85` form — a bare `-33.85` is parsed as a flag.

## Usage

```ts
import { calculateSolunarPeriods } from "bite-times";
// CJS: const { calculateSolunarPeriods } = require("bite-times");

const data = calculateSolunarPeriods(
  -33.8568, // latitude
  151.2153, // longitude
  new Date("2026-01-31T00:00:00Z"), // date (UTC midnight of the target calendar day)
  "Australia/Sydney", // optional IANA timezone for output times (defaults to UTC)
);

console.log(data);
// {
//   majorPeriods: [
//     { start: "10:31", end: "12:31",
//       startISO: "2026-01-31T10:31:22+11:00", endISO: "2026-01-31T12:31:22+11:00" },
//     { start: "22:56", end: "00:56",
//       startISO: "2026-01-31T22:56:04+11:00", endISO: "2026-02-01T00:56:04+11:00" }
//   ],
//   minorPeriods: [ ...same shape, 2 entries... ],
//   date: "20260131",
//   sunRise: "06:16",
//   sunSet: "20:00",
//   moonRise: "19:06",
//   moonSet: "03:56",
//   moonPhase: "Waxing Gibbous",
//   moonIllumination: 96,
//   dayRating: 3.5,
//   dayRatingLabel: "Great",
//   tideStrength: 74,
//   tideType: "spring"
// }
```

For several consecutive days:

```ts
import { calculateSolunarRange } from "bite-times";

const week = calculateSolunarRange(
  -33.8568,
  151.2153,
  new Date("2026-01-31T00:00:00Z"), // UTC midnight of the first day
  7, // 1-366 days
  "Australia/Sydney",
); // SolunarData[]
```

## API

### `calculateSolunarPeriods(latitude, longitude, date, timeZone?)`

| Parameter   | Type     | Description                                                                                          |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `latitude`  | `number` | Decimal degrees, -90 to 90                                                                            |
| `longitude` | `number` | Decimal degrees, -180 to 180                                                                          |
| `date`      | `Date`   | The calendar day to calculate. Pass UTC midnight of the target day, e.g. `new Date("2026-01-31T00:00:00Z")` |
| `timeZone`  | `string?`| Optional IANA timezone (e.g. `"America/New_York"`). All output times are formatted in this zone; defaults to UTC |

Returns `SolunarData`:

```ts
interface SolunarPeriod {
  start: string; // "HH:MM" in the given timezone
  end: string;
  startISO: string; // full ISO-8601 with offset, e.g. "2026-01-31T22:56:04+11:00"
  endISO: string; //  makes midnight-spanning periods unambiguous
}

interface SolunarData {
  majorPeriods: SolunarPeriod[]; // usually 2, sorted chronologically
  minorPeriods: SolunarPeriod[]; // usually 2, sorted chronologically
  date: string; // "YYYYMMDD" (UTC)
  sunRise: string; // "HH:MM", or "" when the sun doesn't rise
  sunSet: string;
  moonRise: string; // "" when the moon doesn't rise/set that day
  moonSet: string;
  moonPhase: string; // "New Moon" | "Waxing Crescent" | "First Quarter" | "Waxing Gibbous" | "Full Moon" | "Waning Gibbous" | "Last Quarter" | "Waning Crescent"
  moonIllumination: number; // 0-100 (%)
  dayRating: number; // 0-5, one decimal (see "Day rating")
  dayRatingLabel: "Poor" | "Fair" | "Good" | "Great" | "Excellent";
  tideStrength: number; // 0-100 astronomical tide forcing (see "Tides")
  tideType: "spring" | "mid" | "neap";
}
```

Periods may span midnight (e.g. `{ start: "22:55", end: "00:55" }`) — use
`startISO`/`endISO` when you need the date. Polar regions fall back to
estimated transits when the moon doesn't rise or set. Invalid latitude,
longitude, date, or timezone inputs throw (`RangeError`/`TypeError`).

### `calculateSolunarRange(latitude, longitude, startDate, days, timeZone?)`

Same as `calculateSolunarPeriods` for `days` (1–366) consecutive UTC
calendar days; returns `SolunarData[]`.

### Day rating

A heuristic in the tradition of published solunar tables, not science:

- up to 2.0 pts — proximity to new/full moon (strongest combined pull)
- up to 1.5 pts — moon distance (perigee = stronger influence)
- up to 1.5 pts — solunar periods coinciding with dawn/dusk (±90 min)

The pure function is exported as `computeDayRating` if you want to rescore
with your own weights. Treat it as guidance; the fish haven't read the
methodology either.

## Tides (optional)

> [!WARNING]
> **Not for navigational use**
>
> Do not use tide calculations from this project for navigation, or depend
> on them in any situation where inaccuracies could result in harm to a
> person or property. Tide predictions are only as good as the harmonics
> data available, and these can be inconsistent and vary widely based on
> the accuracy of the source data and local conditions. Predictions do not
> factor in storm surge, wind waves, uplift, tsunamis, or, sadly, climate
> change.

Solunar periods say when fish feed; tides say when the water moves. For
saltwater fishing you usually want both.

**What works offline anywhere:** `tideStrength`/`tideType` in the core
output — the astronomical spring/neap cycle derived from the moon phase.

**What needs station data:** actual high/low water _times_. Tides are
dominated by local coastline shape, so they cannot be computed from
coordinates alone — you need harmonic constituents for a nearby tide
station. Given those, prediction is accurate to within a few minutes:

```ts
import { predictTideEvents, combineSolunarWithTides } from "bite-times/tides";
import { getNoaaConstituents } from "bite-times/noaa"; // bundled offline, US stations

const constituents = getNoaaConstituents("9410170"); // San Diego
const tides = predictTideEvents({
  constituents,
  start: new Date("2026-01-31T00:00:00Z"),
  end: new Date("2026-02-01T00:00:00Z"),
});
// [{ time, timeISO, level, type: "high" | "low" }, ...]

const periods = combineSolunarWithTides(solunarData, tides);
// solunar periods flagged with coincidesWithTideChange
```

`bite-times/noaa` ships a bundled, offline snapshot of every NOAA station
with published harmonic constituents (1,358 stations as of the dataset's
2026-07-10 generation date) — `getNoaaConstituents` is synchronous and
makes no network call. Harmonic synthesis vendors its algorithm from
[@neaps/tide-predictor](https://github.com/neaps/tide-predictor) (MIT
licensed, see `src/vendor/tide-predictor.js` for the unmodified source and
attribution) directly into `bite-times` — no separate npm dependency.
Outside the US, fetch constituents from your national hydrographic office
in the same `{ name, amplitude, phase, speed }` shape and pass them
straight to `predictTideEvents`.

If you want tide predictions on their own — not paired with solunar
data — the [neaps](https://github.com/openwatersio/neaps) package (from the
same author as @neaps/tide-predictor) already does more of that job:
coordinate-based station lookup (no station id needed) plus a much larger
(~51 MB) worldwide harmonics database, vs. bite-times' US-only, ~1 MB
bundled dataset. bite-times intentionally doesn't depend on that larger
database — `bite-times/tides` exists to plug tide data into
`combineSolunarWithTides()`, which is the part neither `neaps` nor
`@neaps/tide-predictor` does.

## Timezone notes (please read)

- This library does **not** resolve coordinates to a timezone. Pass an IANA
  timezone if you want local times (in a server app, resolve it yourself with
  e.g. [geo-tz](https://www.npmjs.com/package/geo-tz)).
- During the (synchronous) calculation the library temporarily sets
  `process.env.TZ` to the target timezone and restores it afterwards. This is
  a deliberate workaround: suncalc3 internally uses local `Date` methods, and
  this is the only way to get correct event times for arbitrary locations.
  Don't rely on `process.env.TZ` from concurrent async code while a
  calculation is in flight.
- On Alpine Linux images, install `tzdata` (`apk add tzdata`) or `TZ` changes
  are silently ignored and results will be wrong. The library logs a
  `console.warn` when it detects this.
- Outside Node.js (browsers, workers), passing `timeZone` throws a
  descriptive error unless it matches the environment's ambient timezone —
  the astronomy engine computes in the ambient zone and cannot be
  redirected without `process.env.TZ`.

## Accuracy

Results are validated in the test suite against independent astronomical
data (sunrise/sunset, moonrise/moonset, and moon transit times) to within
±15 minutes. Solunar period boundaries are inherently approximate — treat
them as guidance, not gospel. Fish remain under no contractual obligation
to bite.

## License

MIT © Ben Quinteros
