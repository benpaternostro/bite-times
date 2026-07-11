import { describe, it, expect } from "vitest";
import { getNoaaConstituents } from "./noaa";
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

  it("has matching constituentNames and constituentSpeeds array lengths", () => {
    expect(dataset.constituentNames.length).toBeGreaterThan(0);
    expect(dataset.constituentSpeeds.length).toBe(
      dataset.constituentNames.length,
    );
  });

  it("gives every sampled station amplitudes/phases arrays as long as constituentNames", () => {
    const sampleIds = [
      "9410170", // San Diego
      "8443970", // Boston
      "9455920", // Anchorage
      "8761720", // Grand Isle
      "1611347", // first station in the dataset
      "9992401", // last station in the dataset
    ];
    for (const id of sampleIds) {
      const station = dataset.stations[id];
      expect(station, `station ${id} should exist in dataset`).toBeDefined();
      expect(station.amplitudes.length).toBe(dataset.constituentNames.length);
      expect(station.phases.length).toBe(dataset.constituentNames.length);
    }
  });

  it("keeps M2's speed at the well-established astronomical value for every station that has it", () => {
    const sampleIds = [
      "9410170",
      "8443970",
      "9455920",
      "8761720",
      "1611347",
      "9992401",
    ];
    for (const id of sampleIds) {
      const constituents = getNoaaConstituents(id);
      const m2 = constituents.find((c) => c.name === "M2");
      expect(m2, `station ${id} should include M2`).toBeDefined();
      expect(m2?.speed).toBeCloseTo(28.984104, 5);
    }
  });

  it("handles Anchorage (9455920), a station with an unusually large constituent count", () => {
    const constituents = getNoaaConstituents("9455920");
    // Anchorage is known to carry the full ~120-constituent set per the
    // generation log, far more than a typical station.
    expect(constituents.length).toBeGreaterThan(100);
    expect(constituents.every((c) => c.amplitude > 0)).toBe(true);
    expect(constituents.every((c) => Number.isFinite(c.phase))).toBe(true);
    expect(constituents.every((c) => Number.isFinite(c.speed))).toBe(true);
    const m2 = constituents.find((c) => c.name === "M2");
    expect(m2?.amplitude).toBeGreaterThan(0);
  });

  it("resolves synchronously with no Promise involved", () => {
    const result = getNoaaConstituents("9410170");
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof (result as unknown as { then?: unknown }).then).not.toBe(
      "function",
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it("is deterministic: repeated calls for the same station return an equal result", () => {
    const first = getNoaaConstituents("9410170");
    const second = getNoaaConstituents("9410170");
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });
});
