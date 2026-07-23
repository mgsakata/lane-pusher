export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(minInclusive: number, maxExclusive: number): number {
  return Math.floor(randRange(minInclusive, maxExclusive));
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
): T | undefined {
  let total = 0;
  for (const item of items) total += Math.max(0, weightOf(item));
  if (total <= 0) return undefined;

  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}
