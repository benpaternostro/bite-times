# Offline NOAA Constituents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `bite-times/noaa`'s live `fetch()` call to NOAA's API with a bundled, offline static dataset covering all 1,358 NOAA stations that publish harmonic constituents, so the published `bite-times` package makes zero network calls under any code path — while keeping identical output for every station id the live version supported.

**Architecture:** A dev-only generation script (`scripts/generate-noaa-constituents.mjs`, never published, never run automatically) fetches NOAA's public data once and writes a compact JSON snapshot (`src/data/noaa-constituents.json`, ~1MB) committed to the repo. `bite-times/noaa` becomes a synchronous, offline lookup (`getNoaaConstituents(stationId)`) over that bundled file — no `fetch`, no `AbortSignal`, no async. tsup inlines the JSON directly into `dist/noaa.js`/`dist/noaa.mjs` at build time, so nothing extra needs to ship in `package.json`'s `files` field.

**Tech Stack:** TypeScript 5, tsup (esbuild's native JSON-import inlining), vitest, plain Node ESM for the generation script (no new dependencies).

## Global Constraints

- Zero runtime network calls anywhere in the published package — this is the entire point of this plan.
- No new dependencies (generation script uses Node's built-in `fetch`).
- `getNoaaConstituents` must return byte-identical `TideConstituent[]` shape and filtering behavior (`amplitude > 0`) to the old `fetchNoaaConstituents`, so `predictTideEvents`/`combineSolunarWithTides` and every existing doc example need zero changes.
- The generation script and its output data file (`src/data/noaa-constituents.json`) are committed to the repo (source of truth), but the script itself is never part of the published npm package (`files` stays `["dist", "CHANGELOG.md"]` — verify this after the change).
- `npm test` must stay network-free (already true; this plan makes it *more* true by removing the `fetchImpl` injection pattern entirely).
- Empirically confirmed before writing this plan (verified live against NOAA's API, 2026-07-11): all 1,358 harmonic-constituent stations return the exact same 37 constituent names in the exact same order, and each constituent's `speed` (its astronomical frequency) is identical across every station — only `amplitude` and `phase` vary per station. The generation script must not *assume* this blindly, though — it builds the canonical constituent list from real observed data and logs any station that doesn't match, so a future NOAA data change can't silently corrupt the dataset.

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `scripts/generate-noaa-constituents.mjs` | Create | Dev-only, one-shot script: fetch NOAA's full harcon station list + per-station harmonics, write the compact JSON snapshot |
| `src/data/noaa-constituents.json` | Create (generated) | Committed data snapshot: canonical constituent names/speeds + per-station amplitude/phase arrays |
| `src/noaa.ts` | Rewrite | Replace `fetchNoaaConstituents` (async, live) with `getNoaaConstituents` (sync, offline, reads the bundled JSON) |
| `src/noaa.test.ts` | Rewrite | Drop fetch mocking entirely; test against real bundled data |
| `tsconfig.json` | Modify | Add `resolveJsonModule: true` so `tsc --noEmit` accepts the JSON import |
| `package.json` | Modify | Add a `generate:noaa-data` maintainer script; bump keywords/description if needed |
| `README.md` | Modify | Remove "fetches ... from NOAA's free public API" language; show the new synchronous example; state the data snapshot date and station count; the "no API calls, works offline" claim becomes true with zero caveats |
| `CHANGELOG.md` | Modify | Note the (pre-release) breaking rename `fetchNoaaConstituents` → `getNoaaConstituents`, now synchronous |

---

### Task 1: Generation script

**Files:**
- Create: `scripts/generate-noaa-constituents.mjs`
- Modify: `package.json` (add `"generate:noaa-data"` script)

**Interfaces:**
- Produces: a runnable script, invoked as `node scripts/generate-noaa-constituents.mjs`, that writes `src/data/noaa-constituents.json` in this exact shape:
  ```json
  {
    "generatedAt": "2026-07-11",
    "constituentNames": ["M2", "S2", "..."],
    "constituentSpeeds": [28.984104, 30, "..."],
    "stations": {
      "9410170": { "name": "SAN DIEGO, SAN DIEGO BAY", "lat": 32.7142, "lng": -117.1736, "amplitudes": [0.542, "..."], "phases": [143.3, "..."] }
    }
  }
  ```
  `amplitudes`/`phases` are arrays aligned index-for-index with the top-level `constituentNames`/`constituentSpeeds` arrays; a station missing a given constituent gets `0` in both slots at that index (equivalent to "absent" — matches the existing `amplitude > 0` filter used by consumers, defined in Task 3).
- Consumed by: Task 2 (running it for real) and Task 3 (`getNoaaConstituents` reads the file this produces).

This is a one-shot maintainer tool, not part of the published package — it is never imported by `src/`, never referenced by `tsup.config.ts`, and `package.json`'s `files` field never includes `scripts/`.

- [ ] **Step 1: Write the script**

```js
// scripts/generate-noaa-constituents.mjs
//
// Dev-only maintainer tool. Fetches NOAA's public harmonic-constituent
// dataset ONCE and writes a compact offline snapshot to
// src/data/noaa-constituents.json. Run this manually before a release if
// you want fresher data — it is never run automatically (not in `build`,
// `test`, or `prepublishOnly`), and this file itself is never published.
//
// Usage: node scripts/generate-noaa-constituents.mjs

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const STATIONS_LIST_URL =
  "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=harcon";
const HARCON_URL = (id) =>
  `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${id}/harcon.json?units=metric`;

const CONCURRENCY = 8;
const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "noaa-constituents.json",
);

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  console.log("Fetching NOAA harmonic-constituent station list...");
  const list = await fetchJson(STATIONS_LIST_URL);
  const stationIds = list.stations.map((s) => s.id);
  console.log(`Found ${stationIds.length} stations. Fetching harmonics (concurrency=${CONCURRENCY})...`);

  const constituentNames = [];
  const constituentSpeeds = [];
  const nameIndex = new Map(); // name -> index into constituentNames/Speeds
  const stations = {};
  let done = 0;
  const anomalies = [];

  await mapWithConcurrency(list.stations, CONCURRENCY, async (meta) => {
    let harcon;
    try {
      harcon = await fetchJson(HARCON_URL(meta.id));
    } catch (err) {
      anomalies.push(`${meta.id}: fetch failed — ${err.message}`);
      done++;
      return;
    }
    const entries = harcon.HarmonicConstituents ?? [];
    if (entries.length === 0) {
      anomalies.push(`${meta.id}: zero constituents returned`);
      done++;
      return;
    }

    const seenNames = new Set();
    for (const c of entries) {
      seenNames.add(c.name);
      if (!nameIndex.has(c.name)) {
        nameIndex.set(c.name, constituentNames.length);
        constituentNames.push(c.name);
        constituentSpeeds.push(c.speed);
      }
    }
    // 37 is what every station returned during initial verification (2026-07-11);
    // log anything different so a future NOAA format change doesn't silently corrupt data.
    if (entries.length !== 37) {
      anomalies.push(`${meta.id}: ${entries.length} constituents (expected 37)`);
    }

    const amplitudes = new Array(constituentNames.length).fill(0);
    const phases = new Array(constituentNames.length).fill(0);
    for (const c of entries) {
      const idx = nameIndex.get(c.name);
      amplitudes[idx] = c.amplitude;
      phases[idx] = c.phase_GMT;
    }
    stations[meta.id] = {
      name: meta.name,
      lat: meta.lat,
      lng: meta.lng,
      amplitudes,
      phases,
    };

    done++;
    if (done % 100 === 0) {
      console.log(`  ${done}/${stationIds.length}...`);
    }
  });

  // Backfill: stations processed before a later-discovered constituent name
  // was added need 0-padding at the new index too.
  for (const s of Object.values(stations)) {
    while (s.amplitudes.length < constituentNames.length) {
      s.amplitudes.push(0);
      s.phases.push(0);
    }
  }

  console.log(`Done. ${Object.keys(stations).length}/${stationIds.length} stations written.`);
  if (anomalies.length > 0) {
    console.log(`${anomalies.length} anomalies:`);
    for (const a of anomalies.slice(0, 20)) console.log(`  - ${a}`);
    if (anomalies.length > 20) console.log(`  ... and ${anomalies.length - 20} more`);
  }

  const output = {
    generatedAt: new Date().toISOString().slice(0, 10),
    constituentNames,
    constituentSpeeds,
    stations,
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(output), "utf-8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the maintainer npm script**

In `package.json`, inside `"scripts"`, add (do not touch `prepublishOnly` — this must never run automatically):

```json
    "generate:noaa-data": "node scripts/generate-noaa-constituents.mjs",
```

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-noaa-constituents.mjs package.json
git commit -m "chore: add dev-only NOAA constituent snapshot generator"
```

---

### Task 2: Generate the real dataset

**Files:**
- Create (generated, then committed): `src/data/noaa-constituents.json`

**Interfaces:**
- Consumes: Task 1's script.
- Produces: the real, committed data file that Task 3 reads. This is the task that actually gives the offline package its data — there is no placeholder here, the file must contain real NOAA harmonics for all 1,358 stations.

- [ ] **Step 1: Run the generator**

```bash
mkdir -p src/data
node scripts/generate-noaa-constituents.mjs
```

Expected: takes roughly 1-3 minutes (1,358 stations at concurrency 8). Final lines look like:

```
Done. 1358/1358 stations written.
Wrote .../src/data/noaa-constituents.json
```

If any anomalies are logged, read them — a handful of stations occasionally returning fewer constituents than others is fine (the 0-padding handles it); a large fraction failing means investigate before proceeding (e.g. a transient NOAA outage — just re-run).

- [ ] **Step 2: Sanity-check the output**

```bash
node -e "
const d = require('./src/data/noaa-constituents.json');
console.log('stations:', Object.keys(d.stations).length);
console.log('constituent count:', d.constituentNames.length);
console.log('San Diego (9410170):', d.stations['9410170']);
"
```

Expected: `stations: 1358` (or close — see anomaly notes above), `constituent count: 37`, and San Diego's entry shows `name: "SAN DIEGO, SAN DIEGO BAY"` with 37-element `amplitudes`/`phases` arrays whose first value (M2) is amplitude ≈ `0.542`, phase ≈ `143.3`.

- [ ] **Step 3: Check file size**

```bash
ls -la src/data/noaa-constituents.json
```

Expected: roughly 700KB–1.1MB. If it's dramatically larger (multi-MB) or smaller (under 300KB), stop and investigate the script before committing — something is probably wrong with the encoding.

- [ ] **Step 4: Commit**

```bash
git add src/data/noaa-constituents.json
git commit -m "data: generate offline NOAA harmonic-constituent snapshot (1358 stations, 2026-07-11)"
```

---

### Task 3: Replace the live fetcher with an offline lookup

**Files:**
- Modify: `src/noaa.ts`
- Modify: `src/noaa.test.ts`

**Interfaces:**
- Consumes: `src/data/noaa-constituents.json` (Task 2), `TideConstituent` type from `./tides` (unchanged).
- Produces: `getNoaaConstituents(stationId: string): TideConstituent[]` — **synchronous**, no `Promise`, no `fetchImpl` parameter. This is a pre-release breaking rename from the old `fetchNoaaConstituents(stationId, fetchImpl?)`; nothing downstream in this repo depends on the old name outside `src/noaa.ts`/`src/noaa.test.ts`/README, all updated in this task and Task 5.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/noaa.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getNoaaConstituents } from "./noaa";

describe("getNoaaConstituents", () => {
  it("returns real constituents for a known station (San Diego, 9410170)", () => {
    const constituents = getNoaaConstituents("9410170");
    expect(constituents.length).toBeGreaterThan(0);
    const m2 = constituents.find((c) => c.name === "M2");
    expect(m2).toBeDefined();
    expect(m2?.speed).toBeCloseTo(28.984104, 5);
    expect(m2?.amplitude).toBeGreaterThan(0);
  });

  it("never returns a zero-amplitude constituent", () => {
    const constituents = getNoaaConstituents("9410170");
    expect(constituents.every((c) => c.amplitude > 0)).toBe(true);
  });

  it("returns the TideConstituent shape with no extra fields", () => {
    const constituents = getNoaaConstituents("9410170");
    for (const c of constituents) {
      expect(Object.keys(c).sort()).toEqual(
        ["amplitude", "name", "phase", "speed"].sort(),
      );
    }
  });

  it("rejects malformed station ids", () => {
    expect(() => getNoaaConstituents("abc")).toThrow(RangeError);
    expect(() => getNoaaConstituents("123")).toThrow(RangeError);
  });

  it("throws a clear error for a well-formed but unknown station id", () => {
    expect(() => getNoaaConstituents("9999999")).toThrow(/not found/i);
  });

  it("works for a second, independent station (Boston, 8443970)", () => {
    const constituents = getNoaaConstituents("8443970");
    expect(constituents.length).toBeGreaterThan(0);
    const m2 = constituents.find((c) => c.name === "M2");
    expect(m2?.amplitude).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `getNoaaConstituents` is not exported (old code still exports `fetchNoaaConstituents`).

- [ ] **Step 3: Replace the implementation**

Replace the entire contents of `src/noaa.ts`:

```ts
import type { TideConstituent } from "./tides";
import noaaData from "../data/noaa-constituents.json";

interface NoaaStationEntry {
  name: string;
  lat: number;
  lng: number;
  amplitudes: number[];
  phases: number[];
}

interface NoaaDataset {
  generatedAt: string;
  constituentNames: string[];
  constituentSpeeds: number[];
  stations: Record<string, NoaaStationEntry>;
}

const dataset = noaaData as NoaaDataset;

/**
 * Look up a NOAA CO-OPS station's harmonic constituents from a bundled,
 * offline snapshot (generated {@link dataset.generatedAt}, covering
 * {@link dataset.stations} US stations). No network access — this runs
 * entirely offline. US stations only; find station ids at
 * https://tidesandcurrents.noaa.gov. Constituents change rarely (NOAA
 * re-derives them from observations only every few years), so a periodic
 * snapshot stays accurate; see scripts/generate-noaa-constituents.mjs to
 * refresh it.
 */
export function getNoaaConstituents(stationId: string): TideConstituent[] {
  if (!/^\d{7}$/.test(stationId)) {
    throw new RangeError(
      `stationId must be a 7-digit NOAA station id, got '${stationId}'`,
    );
  }
  const station = dataset.stations[stationId];
  if (!station) {
    throw new Error(
      `Station ${stationId} not found in the bundled NOAA dataset ` +
        `(${Object.keys(dataset.stations).length} stations, generated ${dataset.generatedAt}). ` +
        `Check the id at https://tidesandcurrents.noaa.gov, or it may be a ` +
        `subordinate station without full harmonics — use the reference station instead.`,
    );
  }
  const constituents: TideConstituent[] = [];
  for (let i = 0; i < dataset.constituentNames.length; i++) {
    const amplitude = station.amplitudes[i];
    if (amplitude > 0) {
      constituents.push({
        name: dataset.constituentNames[i],
        amplitude,
        phase: station.phases[i],
        speed: dataset.constituentSpeeds[i],
      });
    }
  }
  return constituents;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all `getNoaaConstituents` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/noaa.ts src/noaa.test.ts
git commit -m "feat: replace live NOAA fetch with an offline bundled lookup

BREAKING (pre-release, v1.1.0 unpublished): fetchNoaaConstituents
(async, live fetch) is replaced by getNoaaConstituents (sync, offline,
reads a bundled snapshot). bite-times now makes zero network calls
anywhere in the package."
```

---

### Task 4: Build wiring

**Files:**
- Modify: `tsconfig.json`
- Modify: `package.json` (verify `files`)

**Interfaces:**
- Consumes: Task 3's `import noaaData from "../data/noaa-constituents.json"`.
- Produces: a clean `tsc --noEmit` and a `dist/noaa.js`/`dist/noaa.mjs` with the JSON data inlined.

- [ ] **Step 1: Enable JSON module resolution**

In `tsconfig.json`, add `"resolveJsonModule": true` to `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: PASS, no errors about the JSON import.

Run: `npm run build`
Expected: `Build success` for ESM, CJS, and DTS. Then verify the data actually landed in the bundle:

```bash
ls -la dist/noaa.js dist/noaa.mjs
node -e "
const { getNoaaConstituents } = require('./dist/noaa.js');
console.log(getNoaaConstituents('9410170').length, 'constituents for San Diego');
"
```

Expected: `dist/noaa.js`/`dist/noaa.mjs` are each roughly 700KB-1.2MB (the inlined data dominates their size), and the smoke command prints a constituent count > 0 with **no network activity** (there is no `fetch` call anywhere in this code path anymore — confirm with `grep -c fetch dist/noaa.js`, expected `0`).

- [ ] **Step 3: Confirm `files` doesn't need changes**

```bash
grep -A3 '"files"' package.json
```

Expected: still `["dist", "CHANGELOG.md"]` — the JSON data is compiled into `dist/noaa.js`/`.mjs` by tsup, so `src/data/` itself never needs to be listed; it only needs to exist in the repo for `tsup` to read at build time.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json
git commit -m "build: enable resolveJsonModule for the bundled NOAA dataset"
```

---

### Task 5: Docs — remove the live-API claims, document the offline dataset

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `getNoaaConstituents` (Task 3), the real `generatedAt`/station count from `src/data/noaa-constituents.json` (Task 2) — read the actual committed file's `generatedAt` value and `Object.keys(stations).length` before writing the docs numbers below, and use the real values (do not guess).

- [ ] **Step 1: Update the Tides section of README.md**

Replace the code example and the paragraph after it (the one starting "Constituents change rarely") with:

````markdown
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
generation date — see `CHANGELOG.md`) — `getNoaaConstituents` is
synchronous and makes no network call. Harmonic synthesis is done by
[@neaps/tide-predictor](https://github.com/neaps/tide-predictor) (MIT
licensed), a small, bring-your-own-constituents library with no station
database of its own. Outside the US, fetch constituents from your
national hydrographic office in the same
`{ name, amplitude, phase, speed }` shape and pass them straight to
`predictTideEvents`.

If you want tide predictions on their own — not paired with solunar
data — the [neaps](https://github.com/openwatersio/neaps) package (from the
same author as @neaps/tide-predictor) already does more of that job:
coordinate-based station lookup plus a much larger (~51 MB) worldwide
harmonics database. bite-times' own bundled dataset is US-only and
smaller by design — `bite-times/tides` exists to plug tide data into
`combineSolunarWithTides()`, which is the part neither `neaps` nor
`@neaps/tide-predictor` does.
````

- [ ] **Step 2: Fix the top-of-README claim**

Confirm the intro paragraph's "no API calls, works offline" claim (near the top of `README.md`) no longer needs a caveat — it's now unconditionally true. No text change needed there, but re-read it once to confirm nothing else in the file still describes `bite-times/noaa` as a live fetch (search for the word "fetch" across `README.md` and update any remaining stale references).

- [ ] **Step 3: Update CHANGELOG.md**

In the `## 1.1.0 — unreleased` section, update the `bite-times/noaa` bullet under `### Added` to:

```markdown
- `bite-times/noaa` — offline lookup of harmonic constituents for NOAA
  (US) stations, from a bundled snapshot (no network call)
```

Since v1.1.0 hasn't shipped yet, there's no need for a separate "breaking change" entry — just describe the shipped behavior accurately.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document the offline NOAA dataset, drop live-fetch language"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test/typecheck/build**

Run: `npm run prepublishOnly`
Expected: typecheck, build, and all tests pass.

- [ ] **Step 2: Confirm zero network code in the shipped package**

```bash
grep -rn "fetch(" dist/*.js dist/*.mjs
```

Expected: **no matches**. (If `bite-times/tides`/`bite-times/noaa` no longer call `fetch` anywhere, this command returns nothing — the strongest possible confirmation that the "no API calls, works offline" claim is now literally true of the shipped code, not just the docs.)

- [ ] **Step 3: Pack and smoke-test offline**

```bash
npm pack --dry-run
```

Expected: tarball still contains only `dist/*`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json` — no `src/data/*.json` listed separately (it's inlined into `dist/noaa.js`/`.mjs`).

Then actually pack it, install into a fresh scratch project, and run:

```bash
node -e "
const { getNoaaConstituents } = require('bite-times/noaa');
console.log(getNoaaConstituents('9410170').length, 'constituents');
"
```

Expected: prints a constituent count > 0, with no network request made (there is no code path left that could make one).

- [ ] **Step 4: Commit (if any stray build artifacts need cleaning)**

```bash
git status --short
```

Expected: clean tree. If not, investigate before considering this plan complete.

---

## Self-Review Notes

- **Spec coverage:** live NOAA fetch removed (Task 3), full functional parity via a real generated dataset covering all supported stations (Task 2), zero network calls verified mechanically not just by inspection (Task 6 Step 2), docs corrected (Task 5). ✓
- **Type consistency:** `getNoaaConstituents(stationId: string): TideConstituent[]` defined in Task 3 matches every later reference (README Task 5, verification Task 6); `TideConstituent` itself is unchanged from `src/tides.ts`, so `predictTideEvents`/`combineSolunarWithTides` need no changes anywhere. ✓
- **Known risk:** the generation script (Task 1/2) makes ~1,358 real HTTP calls to NOAA's public API during plan *execution* (not at package build/install/runtime) — this is a one-time, human/agent-initiated maintenance action, exactly analogous to vendoring a dependency's data, and is the only place in this entire plan that touches a network.
