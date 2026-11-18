/**
 * Watches frame intervals and steps quality down when frames run long for a sustained stretch:
 * level 1 hides the scenes far from where you're looking, level 2 shows paintings instead of 3D models.
 * One-way per session: flipping back and forth would be worse than staying a notch lower.
 *
 * "Long" is p95 over the last second above the budget for 3 s in a row. In the headset the budget is the
 * 72 Hz frame (13.9 ms) plus a margin; on a flat screen, whose refresh rate we don't know, it's 1.3 times the
 * fastest typical interval (so a 60 Hz monitor's steady 16.7 ms frames never count as slow).
 */
export const GUARD = { xrBudgetMs: 15, flatFactor: 1.3, windowMs: 1000, sustainMs: 3000, maxLevel: 2 } as const;

export class FrameGuard {
  level = 0;
  private samples: { t: number; dt: number }[] = [];
  private slowSince: number | null = null;

  constructor(private onLevel: (level: number) => void) {}

  /** dt: this frame's interval in ms; now: a clock in ms; xr: rendering to a headset. */
  sample(dt: number, now: number, xr: boolean) {
    if (this.level >= GUARD.maxLevel || dt <= 0 || dt > 250) return; // tab switches and hitches aren't load
    this.samples.push({ t: now, dt });
    while (this.samples.length && this.samples[0].t < now - GUARD.windowMs) this.samples.shift();
    if (this.samples.length < 20) return;
    const sorted = this.samples.map((s) => s.dt).sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const budget = xr ? GUARD.xrBudgetMs : sorted[Math.floor(sorted.length * 0.1)] * GUARD.flatFactor;
    if (p95 <= budget) {
      this.slowSince = null;
      return;
    }
    this.slowSince ??= now;
    if (now - this.slowSince >= GUARD.sustainMs) {
      this.level++;
      this.slowSince = null;
      this.samples = [];
      this.onLevel(this.level);
    }
  }
}
