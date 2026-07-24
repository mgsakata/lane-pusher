import { describe, expect, it } from 'vitest';
import { simulate } from './testing/sim';

/**
 * Full-game simulations: the real Game loop driven by a greedy survival
 * autopilot with seeded randomness. These assert on how the integrated game
 * actually plays — the positioning pressure (one lane fired at a time) that the
 * balance formulas alone cannot capture.
 */

const SEEDS = [1, 2, 3];
const MAX_SECONDS = 180;

const base = SEEDS.map((seed) => simulate({ seed, buffed: false, maxSeconds: MAX_SECONDS }));
const buffed = SEEDS.map((seed) => simulate({ seed, buffed: true, maxSeconds: MAX_SECONDS }));
// A realistic player who actually collects the drops that fall (so this run
// feels pickup frequency, unlike the forced base/maxed runs above).
const realistic = SEEDS.map((seed) =>
  simulate({ seed, buffed: false, collect: true, maxSeconds: MAX_SECONDS }),
);

const meanWave = (runs: typeof base) =>
  runs.reduce((s, r) => s + r.wave, 0) / runs.length;

describe('unbuffed survival (the game is lethal)', () => {
  it('an autopilot with no power-ups always dies', () => {
    for (const run of base) expect(run.died).toBe(true);
  });

  it('and dies within the first several waves', () => {
    for (const run of base) {
      expect(run.wave).toBeLessThanOrEqual(6);
      expect(run.elapsed).toBeLessThan(MAX_SECONDS);
    }
  });
});

describe('a maxed loadout survives dramatically longer', () => {
  it('survives well past where the base weapon dies', () => {
    for (const run of buffed) {
      expect(run.died).toBe(false); // still alive at the survival cap
      expect(run.wave).toBeGreaterThanOrEqual(7);
    }
  });

  it('even the worst buffed run outlasts the best unbuffed run', () => {
    const worstBuffedWave = Math.min(...buffed.map((r) => r.wave));
    const bestBaseWave = Math.max(...base.map((r) => r.wave));
    expect(worstBuffedWave).toBeGreaterThan(bestBaseWave);
  });

  it('clears far more enemies before the run ends', () => {
    const avgBaseKills = base.reduce((s, r) => s + r.kills, 0) / base.length;
    const avgBuffKills = buffed.reduce((s, r) => s + r.kills, 0) / buffed.length;
    expect(avgBuffKills).toBeGreaterThan(avgBaseKills * 2);
  });
});

describe('a realistic player who collects pickups lands between the extremes', () => {
  it('outlasts the no-buff floor (grabbing drops helps)', () => {
    expect(meanWave(realistic)).toBeGreaterThan(meanWave(base));
  });

  it('but never beats a forced maxed loadout', () => {
    expect(meanWave(realistic)).toBeLessThanOrEqual(meanWave(buffed));
  });

  it('accumulates buffs over a run', () => {
    expect(Math.max(...realistic.map((r) => r.buffs))).toBeGreaterThan(0);
  });
});

describe('the simulation is deterministic', () => {
  it('the same seed produces the same outcome', () => {
    const a = simulate({ seed: 42, buffed: false, maxSeconds: MAX_SECONDS });
    const b = simulate({ seed: 42, buffed: false, maxSeconds: MAX_SECONDS });
    expect(a).toEqual(b);
  });

  it('a run leaves global Math.random restored', () => {
    const before = Math.random;
    simulate({ seed: 7, buffed: false, maxSeconds: 5 });
    expect(Math.random).toBe(before);
  });
});
