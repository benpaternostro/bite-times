declare module "suncalc3" {
  export interface SunTimeEvent {
    value: Date;
    ts: number;
    name: string;
    /**
     * False during polar day/polar night, when the sun never rises or
     * never sets on the queried day. `value` is still populated with a
     * placeholder Date even when `valid` is false — always check `valid`
     * before using `value`.
     */
    valid: boolean;
  }

  export interface SunTimes {
    sunriseStart?: SunTimeEvent;
    sunsetStart?: SunTimeEvent;
  }

  export interface MoonTimes {
    /**
     * NOTE: suncalc3's real runtime returns the NUMBER NaN (not null/undefined)
     * when there is no moonrise/moonset on the queried day — a consequence of
     * the ~24h50m lunar day not lining up with the calendar day. Typed here as
     * nullable for ergonomic truthy-checking (`if (moonTimes.rise && ...)`),
     * which is safe because NaN is falsy too. Do NOT write a `!= null` check
     * against these fields — `NaN != null` is `true` in JavaScript, so it would
     * let NaN through and a subsequent `.getTime()` call would throw.
     */
    rise?: Date | null;
    set?: Date | null;
    highest?: Date | null;
    alwaysUp?: boolean;
    alwaysDown?: boolean;
  }

  export interface MoonPhaseInfo {
    from: number;
    to: number;
    id: string;
    emoji: string;
    code: string;
    name: string;
    weight: number;
    css: string;
  }

  export interface MoonIllumination {
    fraction: number;
    /** NOTE: an object, not a number — the 0-1 numeric phase is `phaseValue` */
    phase: MoonPhaseInfo;
    phaseValue: number;
    angle: number;
  }

  export interface MoonTransit {
    main: Date | null;
    invert: Date | null;
  }

  export interface MoonPosition {
    azimuth: number;
    altitude: number;
    /** Earth–moon distance in km */
    distance: number;
    parallacticAngle: number;
  }

  const SunCalc: {
    getSunTimes(
      dateValue: Date | number,
      lat: number,
      lng: number,
      height?: number,
      addDeprecated?: boolean,
      inUTC?: boolean,
    ): SunTimes;
    getMoonTimes(
      dateValue: Date | number,
      lat: number,
      lng: number,
      inUTC?: boolean,
    ): MoonTimes;
    getMoonIllumination(dateValue: Date | number): MoonIllumination;
    moonTransit(
      rise: Date | number,
      set: Date | number,
      lat: number,
      lng: number,
    ): MoonTransit;
    getMoonPosition(
      dateValue: Date | number,
      lat: number,
      lng: number,
    ): MoonPosition;
  };

  export default SunCalc;
}
