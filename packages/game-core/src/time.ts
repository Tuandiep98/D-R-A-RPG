/** Fixed simulation rate shared by client-local and server hosts. */
export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;

/** Converts a duration in seconds to whole ticks (at least one). */
export const secondsToTicks = (seconds: number): number =>
  Math.max(1, Math.round(seconds * TICK_RATE));
