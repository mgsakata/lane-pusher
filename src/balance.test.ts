import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, WAVE } from './config';
import * as B from './balance';
import type { EnemyKind } from './types';

const def = (kind: EnemyKind) => {
  const found = ENEMY_DEFS.find((d) => d.kind === kind);
  if (!found) throw new Error(`no def for ${kind}`);
  return found;
};

describe('buff scaling', () => {
  it('PWR raises weapon damage each level', () => {
    expect(B.weaponDamage(0)).toBe(1);
    expect(B.weaponDamage(1)).toBe(2);
    expect(B.weaponDamage(3)).toBe(4);
    expect(B.weaponDamage(3)).toBeGreaterThan(B.weaponDamage(1));
  });

  it('RAPID lowers the fire cooldown each level', () => {
    expect(B.weaponCooldown(1)).toBeLessThan(B.weaponCooldown(0));
    expect(B.weaponCooldown(3)).toBeLessThan(B.weaponCooldown(1));
  });

  it('SLOW reduces enemy speed each level', () => {
    expect(B.enemySpeedFactor(0)).toBe(1);
    expect(B.enemySpeedFactor(1)).toBeLessThan(1);
    expect(B.enemySpeedFactor(3)).toBeLessThan(B.enemySpeedFactor(1));
  });

  it('DRONE adds shots to each fire, and DUAL adds one more', () => {
    expect(B.shotsPerFire({ droneLevel: 0 })).toBe(1);
    expect(B.shotsPerFire({ droneLevel: 2 })).toBe(3);
    expect(B.shotsPerFire({ droneLevel: 1, dual: true })).toBe(3);
  });
});

describe('time-to-kill: variety and fairness', () => {
  it('fragile enemies die faster than tanky ones', () => {
    expect(B.shotsToKill(def('runner'))).toBeLessThan(B.shotsToKill(def('grunt')));
    expect(B.shotsToKill(def('grunt'))).toBeLessThan(B.shotsToKill(def('brute')));
  });

  it('armored enemies must have their plates broken before HP counts', () => {
    const a = def('armored');
    const plates = a.armor ?? 0;
    expect(plates).toBeGreaterThan(0);
    expect(B.shotsToKill(a)).toBeGreaterThanOrEqual(plates + 1);
    expect(B.shotsToKill(a)).toBeGreaterThan(B.shotsToKill(def('grunt')));
  });

  it('any single enemy can be gunned down before it reaches you if focused', () => {
    for (const d of B.spawnableDefs(30)) {
      const wave = d.minWave;
      expect(B.timeToKill(d, { wave })).toBeLessThan(
        B.travelTimeToPlayer(d, wave),
      );
    }
  });

  it('but no enemy is a free kill — everything takes at least one shot', () => {
    for (const d of B.spawnableDefs(30)) {
      expect(B.shotsToKill(d, { wave: d.minWave })).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('spawn pressure: an escalating challenge', () => {
  it('the opening waves are sustainable with the base weapon', () => {
    expect(B.shotsDemandPerSecond(1)).toBeLessThan(B.shotsSupplyPerSecond(0, 0));
  });

  it('by mid game the base weapon alone cannot keep up', () => {
    expect(B.shotsDemandPerSecond(5)).toBeGreaterThan(
      B.shotsSupplyPerSecond(0, 0),
    );
  });

  it('pressure keeps climbing wave over wave', () => {
    expect(B.shotsDemandPerSecond(5)).toBeGreaterThan(B.shotsDemandPerSecond(3));
    expect(B.shotsDemandPerSecond(10)).toBeGreaterThan(
      B.shotsDemandPerSecond(5),
    );
  });

  it('a leveled loadout restores sustainability against a mid-game wave', () => {
    // Maxed rapid + drone out-produces even base-damage demand at wave 15...
    expect(B.shotsSupplyPerSecond(3, 3)).toBeGreaterThan(
      B.shotsDemandPerSecond(15),
    );
    // ...and leveling PWR meaningfully cuts the demand itself.
    expect(B.shotsDemandPerSecond(15, 3)).toBeLessThan(
      B.shotsDemandPerSecond(15, 0),
    );
  });
});

describe('wave scaling', () => {
  it('enemies grow tankier at higher waves', () => {
    expect(B.shotsToKill(def('brute'), { wave: 10 })).toBeGreaterThan(
      B.shotsToKill(def('brute'), { wave: 1 }),
    );
  });

  it('enemies speed up at higher waves, up to the cap', () => {
    expect(B.waveSpeedMultiplier(10)).toBeGreaterThan(B.waveSpeedMultiplier(1));
    expect(B.waveSpeedMultiplier(999)).toBeLessThanOrEqual(
      WAVE.maxSpeedMultiplier + 1e-9,
    );
  });

  it('spawns arrive faster at higher waves, down to the floor', () => {
    expect(B.spawnInterval(10)).toBeLessThan(B.spawnInterval(1));
    expect(B.spawnInterval(999)).toBeGreaterThanOrEqual(
      WAVE.minSpawnInterval - 1e-9,
    );
  });
});

describe('progression pays off', () => {
  it('a maxed loadout kills a tough enemy far faster than the base weapon', () => {
    const base = B.timeToKill(def('brute'), { wave: 5 });
    const maxed = B.timeToKill(def('brute'), {
      wave: 5,
      powerLevel: 3,
      rapidLevel: 3,
    });
    expect(maxed).toBeLessThan(base * 0.5);
  });
});
