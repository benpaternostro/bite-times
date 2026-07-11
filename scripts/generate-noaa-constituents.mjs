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

    for (const c of entries) {
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
