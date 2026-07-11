import type { TideConstituent } from "./tides";
import noaaData from "./data/noaa-constituents.json";

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
 * offline snapshot (generated on the date in `dataset.generatedAt`,
 * covering every US station NOAA publishes harmonics for). No network
 * access — this runs entirely offline. Find station ids at
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
