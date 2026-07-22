# bite-times

Solunar bite times calculator for fishing. Computes major/minor feeding
periods, sunrise/sunset, moonrise/moonset, moon phase and illumination, a
0–5 day rating, and spring/neap tide strength for any location and date —
no API calls, works offline. Multi-day forecasts and a `npx bite-times`
CLI included.

Based on the Solunar Theory (John Alden Knight, 1936):

- **Major periods** (2 h): centered on the moon's upper and lower meridian
  transits (moon overhead / moon underfoot)
- **Minor periods** (2 h): centered on moonrise and moonset

Astronomy is computed locally by [suncalc3](https://github.com/hypnos3/suncalc3),
the package's only dependency.

## Install

```bash
npm install bite-times
```

Requires Node.js 18+. Ships CJS and ESM builds with TypeScript types.

## CLI

```bash
npx bite-times --lat=-33.8568 --lon=151.2153 --tz=Australia/Sydney --date=2026-01-31
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
//       startISO: "2026-01-31T10:31:33+11:00", endISO: "2026-01-31T12:31:33+11:00" },
//     { start: "22:56", end: "00:56",
//       startISO: "2026-01-31T22:56:45+11:00", endISO: "2026-02-01T00:56:45+11:00" }
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
  startISO: string; // full ISO-8601 with offset, e.g. "2026-01-31T22:56:45+11:00"
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
  tideStrength: number; // 0-100 astronomical tide forcing (see "Tide strength")
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

### Tide strength

`tideStrength` (0–100) and `tideType` (`spring`/`mid`/`neap`) are the
astronomical spring/neap cycle derived purely from the moon phase — at
new/full moon the sun and moon's pull combine (spring tide, strength
100); at quarter moons they oppose (neap tide, strength 0). This is
global and needs no station data, so it's accurate for any location.

It is **not** a prediction of high/low water *times* — that requires
harmonic constituents calibrated to a specific coastline (NOAA publishes
these openly for the US; no equivalent exists for most of the world),
which this package deliberately doesn't attempt. If you need real tide
times, pair this package's output with a dedicated tide API or library
sourced for your coastline. The pure function is exported as
`computeTideStrength`.

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

MIT © Ben Paternostro

### Third-party

Astronomy calculations are provided by [suncalc3](https://github.com/hypnos3/suncalc3),
used as an external dependency (not bundled) under the BSD-2-Clause license:

> Copyright (c) 2014, Vladimir Agafonkin
> All rights reserved.
>
> Redistribution and use in source and binary forms, with or without modification, are
> permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice, this list of
>    conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice, this list
>    of conditions and the following disclaimer in the documentation and/or other materials
>    provided with the distribution.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
> EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
> MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
> COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
> EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
> SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
> HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
> TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
> SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
