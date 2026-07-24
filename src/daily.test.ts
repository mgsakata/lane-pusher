import { describe, expect, it } from 'vitest';
import { Spawner } from './spawner';
import { dailySeed, utcDayId } from './util';

/** Collects the (kind, lane) of every enemy a seeded spawner produces. */
function spawnSequence(seed: number | null, steps: number): string[] {
  const spawner = new Spawner();
  spawner.reset();
  spawner.seed(seed);
  const out: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    const tick = spawner.update(1 / 60);
    for (const e of tick.enemies) out.push(`${e.def.kind}:${e.lane}`);
  }
  return out;
}

describe('daily seed', () => {
  it('utcDayId formats a date as YYYYMMDD (UTC)', () => {
    expect(utcDayId(new Date('2026-07-24T12:00:00Z'))).toBe(20260724);
    expect(utcDayId(new Date('2026-01-05T00:00:00Z'))).toBe(20260105);
  });

  it('dailySeed is stable per day and differs across days', () => {
    expect(dailySeed(20260724)).toBe(dailySeed(20260724));
    expect(dailySeed(20260724)).not.toBe(dailySeed(20260725));
  });

  it('the same seed yields the identical enemy sequence', () => {
    const a = spawnSequence(12345, 3000);
    const b = spawnSequence(12345, 3000);
    expect(a.length).toBeGreaterThan(10); // actually produced a run
    expect(a).toEqual(b);
  });

  it('different seeds yield different sequences', () => {
    const a = spawnSequence(dailySeed(20260724), 3000);
    const b = spawnSequence(dailySeed(20260725), 3000);
    expect(a).not.toEqual(b);
  });

  it('an unseeded (null) spawner still runs — just nondeterministically', () => {
    const seq = spawnSequence(null, 1500);
    expect(seq.length).toBeGreaterThan(0);
  });
});
