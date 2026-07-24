/** A pseudo-random source: returns a float in [0, 1). Defaults to Math.random. */
export type Rng = () => number;

export function randRange(min: number, max: number, rng: Rng = Math.random): number {
  return min + rng() * (max - min);
}

export function randInt(
  minInclusive: number,
  maxExclusive: number,
  rng: Rng = Math.random,
): number {
  return Math.floor(randRange(minInclusive, maxExclusive, rng));
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation, used for the player's lane slide. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Picks one item at random, biased by `weightOf`. Items with a weight of zero
 * are never returned. Returns undefined only if every candidate weighs zero.
 */
export function pickWeighted<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  rng: Rng = Math.random,
): T | undefined {
  let total = 0;
  for (const item of items) total += Math.max(0, weightOf(item));
  if (total <= 0) return undefined;

  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** Small, fast, seedable PRNG (public-domain mulberry32) for deterministic runs. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The UTC calendar day as a plain integer (e.g. 2026-07-24 → 20260724). Used to
 * bucket daily scores and to derive the day's shared seed; UTC so every player
 * worldwide shares the same "run of the day" regardless of timezone.
 */
export function utcDayId(date: Date = new Date()): number {
  return (
    date.getUTCFullYear() * 10000 +
    (date.getUTCMonth() + 1) * 100 +
    date.getUTCDate()
  );
}

/** A well-scrambled 32-bit seed from a day id, so consecutive days feel distinct. */
export function dailySeed(dayId: number): number {
  let s = dayId >>> 0;
  s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d);
  s = Math.imul(s ^ (s >>> 13), 0x297a2d39);
  return (s ^ (s >>> 16)) >>> 0;
}
