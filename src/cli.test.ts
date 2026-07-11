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

  it("rejects an empty --lat value instead of silently treating it as 0", () => {
    const { exitCode, output } = runCli(["--lat=", "--lon=0"]);
    expect(exitCode).toBe(1);
    expect(output).toContain("--lat and --lon are required");
  });

  it("rejects an empty --lon value instead of silently treating it as 0", () => {
    const { exitCode, output } = runCli(["--lat=0", "--lon="]);
    expect(exitCode).toBe(1);
    expect(output).toContain("--lat and --lon are required");
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

  it("rejects --days below the minimum", () => {
    const { exitCode, output } = runCli([...sydney, "--days=0"]);
    expect(exitCode).toBe(1);
    expect(output).toContain("--days must be an integer between 1 and 60");
  });

  it("rejects --days above the maximum", () => {
    const { exitCode, output } = runCli([...sydney, "--days=61"]);
    expect(exitCode).toBe(1);
    expect(output).toContain("--days must be an integer between 1 and 60");
  });

  it("rejects a non-numeric --days", () => {
    const { exitCode, output } = runCli([...sydney, "--days=abc"]);
    expect(exitCode).toBe(1);
    expect(output).toContain("--days must be an integer between 1 and 60");
  });

  it("reports an out-of-range latitude through the generic error path", () => {
    const { exitCode, output } = runCli(["--lat=91", "--lon=0"]);
    expect(exitCode).toBe(1);
    expect(output).toContain("Error:");
    expect(output).toContain("latitude");
  });

  it("reports an out-of-range longitude cleanly through the generic error path", () => {
    const { exitCode, output } = runCli(["--lat=0", "--lon=181"]);
    expect(exitCode).toBe(1);
    expect(output).toBe(
      "Error: longitude must be a number between -180 and 180, got 181",
    );
  });

  it("defaults --date to today's real UTC date when omitted", () => {
    const { exitCode, output } = runCli(["--lat=0", "--lon=0", "--json"]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(output);
    const expectedDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    expect(data.date).toBe(expectedDate);
  });

  it("reports an invalid IANA timezone cleanly instead of crashing", () => {
    const { exitCode, output } = runCli(["--lat=0", "--lon=0", "--tz=Not/AZone"]);
    expect(exitCode).toBe(1);
    expect(output).toBe("Error: invalid IANA timeZone: Not/AZone");
  });

  it("applies --tz to ISO timestamps in --json output", () => {
    const { exitCode, output } = runCli([...sydney, "--json"]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(output);
    expect(data.majorPeriods.length).toBeGreaterThan(0);
    // Sydney is on daylight saving (AEDT, UTC+11) in late January.
    expect(data.majorPeriods[0].startISO).toMatch(/\+11:00$/);
  });

  it("returns multi-day --json output in chronological order, earliest first", () => {
    const { exitCode, output } = runCli([...sydney, "--days=3", "--json"]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(output);
    expect(data.map((day: { date: string }) => day.date)).toEqual([
      "20260131",
      "20260201",
      "20260202",
    ]);
  });

  it("treats explicit --days=1 the same as omitting --days", () => {
    const explicit = runCli([...sydney, "--days=1", "--json"]);
    const omitted = runCli([...sydney, "--json"]);
    expect(explicit.exitCode).toBe(0);
    expect(omitted.exitCode).toBe(0);
    expect(Array.isArray(JSON.parse(explicit.output))).toBe(false);
    expect(Array.isArray(JSON.parse(omitted.output))).toBe(false);
    expect(explicit.output).toBe(omitted.output);
  });
});
