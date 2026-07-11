// Type declarations for the vendored tide-predictor.js (see that file for
// provenance/license). Only the surface actually used by src/tides.ts is
// declared here.
export interface VendoredConstituent {
  name: string;
  amplitude: number;
  phase: number;
  speed: number;
}

export interface VendoredExtremeEvent {
  time: Date;
  level: number;
  high: boolean;
  low: boolean;
  label: string;
}

export interface VendoredExtremesOptions {
  start: Date;
  end: Date;
  labels?: { high?: string; low?: string };
  offsets?: {
    height?: { high: number; low: number; type: "ratio" | "fixed" };
    time?: { high: number; low: number };
  };
}

export function createTidePredictor(
  constituents: VendoredConstituent[],
  options?: { offset?: number },
): {
  getExtremesPrediction(
    options: VendoredExtremesOptions,
  ): VendoredExtremeEvent[];
};
