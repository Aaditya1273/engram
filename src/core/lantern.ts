/**
 * Recall probability → how a lantern looks. Brightness, not hue, so it reads for colour-blind users.
 * ponytail: bands sit just under the 0.9 retention target because the FSRS-6 curve is long-tailed;
 * the README's 0.7 / 0.5 bands would almost never show. Tune these with real review data.
 */
export const BAND = { full: 0.9, flicker: 0.82, grey: 0.75, floor: 0.6 };

export interface LanternLook {
  /** 0..1 emissive strength. */
  intensity: number;
  flicker: boolean;
  /** 0..1, applied to the scene under the lantern. */
  saturation: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function lanternLook(r: number): LanternLook {
  return {
    // Squared: the eye reads brightness non-linearly, so a linear ramp makes early fading invisible.
    intensity: 0.08 + 0.92 * clamp01((r - BAND.floor) / (BAND.full - BAND.floor)) ** 2,
    flicker: r < BAND.flicker,
    saturation: r >= BAND.grey ? 1 : clamp01((r - BAND.floor) / (BAND.grey - BAND.floor)),
  };
}
