# bite-times

Solunar bite times calculator for fishing. Computes major/minor feeding
periods, sunrise/sunset, moonrise/moonset, moon phase, and illumination for
any location and date — no API calls, works offline.

Based on the Solunar Theory (John Alden Knight, 1936):

- **Major periods** (2 h): centered on the moon's upper and lower meridian
  transits (moon overhead / moon underfoot)
- **Minor periods** (2 h): centered on moonrise and moonset

Astronomy is computed locally by [suncalc3](https://github.com/hypnos3/suncalc3),
the only dependency.

## Install

```bash
npm install bite-times
```

Requires Node.js 18+. Ships CJS and ESM builds with TypeScript types.

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
//   majorPeriods: [ { start: "10:31", end: "12:31" }, { start: "22:56", end: "00:56" } ],
//   minorPeriods: [ { start: "02:56", end: "04:56" }, { start: "18:06", end: "20:06" } ],
//   date: "20260131",
//   sunRise: "06:16",
//   sunSet: "20:00",
//   moonRise: "19:06",
//   moonSet: "03:56",
//   moonPhase: "Waxing Gibbous",
//   moonIllumination: 96
// }
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
}

interface SolunarData {
  majorPeriods: SolunarPeriod[]; // usually 2, sorted by start time
  minorPeriods: SolunarPeriod[]; // usually 2, sorted by start time
  date: string; // "YYYYMMDD" (UTC)
  sunRise: string; // "HH:MM", or "" when the sun doesn't rise
  sunSet: string;
  moonRise: string; // "" when the moon doesn't rise/set that day
  moonSet: string;
  moonPhase: string; // "New Moon" | "Waxing Crescent" | "First Quarter" | "Waxing Gibbous" | "Full Moon" | "Waning Gibbous" | "Last Quarter" | "Waning Crescent"
  moonIllumination: number; // 0-100 (%)
}
```

Periods may span midnight (e.g. `{ start: "22:55", end: "00:55" }`). Polar
regions fall back to estimated transits when the moon doesn't rise or set.

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

## Accuracy

Results are validated in the test suite against independent astronomical
data (sunrise/sunset, moonrise/moonset, and moon transit times) to within
±15 minutes. Solunar period boundaries are inherently approximate — treat
them as guidance, not gospel. Fish remain under no contractual obligation
to bite.

## License

MIT © Ben Quinteros
