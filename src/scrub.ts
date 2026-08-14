const SCROLL_RANGE_PX = 6000;
/** Fraction of the remaining distance to the target closed per second of easing. */
const EASE_RATE_PER_SECOND = 6;

/**
 * Maps wheel-scroll deltas onto a clamped time cursor within [min, max]. Scrolling moves an
 * instantly-set target; `current` eases toward it each frame via `tick`, so a burst of wheel
 * events (which arrive in discrete, uneven jumps) still reads as continuous motion.
 */
export class Scrubber {
  private t: number;
  private targetT: number;

  constructor(
    private readonly min: number,
    private readonly max: number,
    initial: number = min,
  ) {
    this.t = initial;
    this.targetT = initial;
  }

  get current(): number {
    return this.t;
  }

  /** Advances the target by a wheel delta (in scroll pixels) and returns the new target. */
  scrollBy(deltaY: number): number {
    const msPerPixel = (this.max - this.min) / SCROLL_RANGE_PX;
    this.targetT = Math.min(this.max, Math.max(this.min, this.targetT + deltaY * msPerPixel));
    return this.targetT;
  }

  /**
   * Jumps straight to `t` with no easing — for direct-manipulation drags, where `current` must
   * track the pointer exactly instead of trailing behind it.
   */
  dragTo(t: number): number {
    this.targetT = Math.min(this.max, Math.max(this.min, t));
    this.t = this.targetT;
    return this.t;
  }

  /** Eases `current` toward the target based on elapsed time; returns whether it's still moving. */
  tick(deltaSeconds: number): boolean {
    const remaining = this.targetT - this.t;
    if (Math.abs(remaining) < 1) {
      this.t = this.targetT;
      return false;
    }
    const easing = 1 - Math.exp(-EASE_RATE_PER_SECOND * deltaSeconds);
    this.t += remaining * easing;
    return true;
  }
}
