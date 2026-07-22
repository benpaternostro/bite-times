# Changelog

## 1.1.1 — 2026-07-22

### Changed

- Corrected the copyright/author name to Ben Paternostro across `LICENSE`,
  `package.json`, and this file's own license section
- Added a BSD-2-Clause third-party attribution notice for suncalc3 (the
  package's only dependency) to the README

## 1.1.0 — 2026-07-11

### Added

- `dayRating` (0–5) and `dayRatingLabel` — heuristic day quality from moon
  phase, moon distance, and solunar/dawn-dusk overlap
- `startISO`/`endISO` on periods — full ISO-8601 timestamps that make
  midnight-spanning periods unambiguous
- `tideStrength` (0–100) and `tideType` (`spring`/`mid`/`neap`) — offline
  astronomical tide forcing, accurate anywhere (no station data needed —
  see the README's "Tide strength" section for why this package doesn't
  attempt to predict actual tide *times*)
- `calculateSolunarRange()` — multi-day forecasts
- `npx bite-times` CLI with pretty and `--json` output

### Changed

- Invalid `latitude`/`longitude`/`date` now throw instead of returning
  garbage; an invalid IANA `timeZone` now throws `RangeError` instead of
  warning and silently using UTC
- Periods are sorted chronologically (previously by wall-clock time, which
  misordered midnight-spanning periods)
- Outside Node.js, passing `timeZone` now throws a descriptive error
  instead of crashing with `ReferenceError: process is not defined`

### Fixed

- `formatTime` used `hour12: false`, which is not reliably equivalent to
  `hourCycle: "h23"` across ICU versions — on some builds (Node 20.20.2 /
  ICU 78.2) local midnight rendered as `"24:56"` instead of `"00:56"`. Now
  requests `hourCycle: "h23"` explicitly
- `sunRise`/`sunSet` reported bogus non-empty, identical times instead of
  `""` during real polar day/night (verified at Tromsø, Norway); the
  wrapper checked suncalc3's placeholder `.value` instead of its `.valid`
  flag
- Negative-UTC-offset timezones (all of the Americas, Pacific/Honolulu,
  etc.) anchored `majorPeriods`/`minorPeriods`/`moonRise`/`moonSet` to the
  wrong calendar day whenever an explicit `timeZone` was passed — predates
  this branch, present since v1.0's original `process.env.TZ` workaround.
  Fixed with a local-day-anchoring correction, including a DST-transition
  edge case (a transition falling at/near local midnight, e.g.
  America/Santiago's fall-back, could make a single offset sample stale)
- A false-positive "timezone data may be missing" warning fired for any
  legitimately zero-UTC-offset zone whose name doesn't contain "UTC"
  (Africa/Accra, Atlantic/Reykjavik, Europe/London in winter, etc.)
- `computeDayRating`/`computeTideStrength` now validate `phaseValue`
  (finite, 0–1) and `moonDistanceKm` (finite) instead of silently turning
  `NaN` input into a misleadingly plausible result (e.g.
  `{rating: NaN, label: "Excellent"}`)
- CLI `--lat=`/`--lon=` with an empty value now reports "required" instead
  of silently resolving to `0` (`Number('') === 0` in JavaScript)

### Testing

- 88 tests total (up from the original 12), including exact-boundary
  assertions for every heuristic threshold, antimeridian/polar/leap-day/DST
  edge cases, and CLI argument-handling coverage
