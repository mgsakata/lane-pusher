import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, WAVE, WEAPON_DEFS } from './config';
import * as B from './balance';
import type { Levels } from './balance';
import type { EnemyKind, WeaponKind } from './types';

const def = (kind: EnemyKind) => {
  const found = ENEMY_DEFS.find((d) => d.kind === kind);
  if (!found) throw new Error(`no def for ${kind}`);
  return found;
};

const WEAPONS: WeaponKind[] = ['blaster', 'scatter', 'railgun'];
const maxed: Record<WeaponKind, Levels> = {
  blaster: { rapid: 3, twin: 1 },
  scatter: { spread: 3, punch: 3 },
  railgun: { charge: 3, overload: 3 },
};

describe('weapons have distinct identities', () => {
  it('the railgun hits harder but fires slower than the blaster', () => {
    expect(B.projectileDamage('railgun')).toBeGreaterThan(B.projectileDamage('blaster'));
    expect(B.fireCooldown('railgun')).toBeGreaterThan(B.fireCooldown('blaster'));
  });

  it('scatter covers both lanes; the blaster only does with TWIN', () => {
    expect(B.lanesFired('scatter')).toBe(2);
    expect(B.lanesFired('blaster')).toBe(1);
    expect(B.lanesFired('blaster', { twin: 1 })).toBe(2);
  });

  it('only the railgun pierces', () => {
    expect(WEAPON_DEFS.railgun.pierce).toBe(true);
    expect(WEAPON_DEFS.blaster.pierce).toBe(false);
    expect(WEAPON_DEFS.scatter.pierce).toBe(false);
  });
});

describe('each weapon buff upgrades its own weapon', () => {
  it('RAPID and CHARGE lower fire cooldown', () => {
    expect(B.fireCooldown('blaster', { rapid: 3 })).toBeLessThan(B.fireCooldown('blaster'));
    expect(B.fireCooldown('railgun', { charge: 3 })).toBeLessThan(B.fireCooldown('railgun'));
  });

  it('PUNCH and OVERLOAD raise projectile damage', () => {
    expect(B.projectileDamage('scatter', { punch: 3 })).toBeGreaterThan(
      B.projectileDamage('scatter'),
    );
    expect(B.projectileDamage('railgun', { overload: 3 })).toBeGreaterThan(
      B.projectileDamage('railgun'),
    );
  });

  it('SPREAD adds pellets per lane', () => {
    expect(B.pelletsPerLane('scatter', { spread: 3 })).toBeGreaterThan(
      B.pelletsPerLane('scatter'),
    );
  });

  it('every weapon maxes out to far higher DPS than its base', () => {
    for (const w of WEAPONS) {
      expect(B.weaponDps(w, maxed[w])).toBeGreaterThan(B.weaponDps(w) * 3);
    }
  });
});

describe('time-to-kill: variety and fairness', () => {
  it('fragile enemies die faster than tanky ones', () => {
    expect(B.firesToKill(def('runner'), { weapon: 'blaster' })).toBeLessThan(
      B.firesToKill(def('grunt'), { weapon: 'blaster' }),
    );
    expect(B.firesToKill(def('grunt'), { weapon: 'blaster' })).toBeLessThan(
      B.firesToKill(def('brute'), { weapon: 'blaster' }),
    );
  });

  it('armored enemies must have their plates broken before HP counts', () => {
    const a = def('armored');
    const plates = a.armor ?? 0;
    expect(plates).toBeGreaterThan(0);
    expect(B.hitsToKill(a, { weapon: 'blaster' })).toBeGreaterThanOrEqual(plates + 1);
  });

  it('any enemy can be gunned down before it reaches you, with any weapon', () => {
    for (const weapon of WEAPONS) {
      for (const d of B.spawnableDefs(30)) {
        const wave = d.minWave;
        expect(B.timeToKill(d, { weapon, wave })).toBeLessThan(
          B.travelTimeToPlayer(d, wave),
        );
      }
    }
  });

  it('but no enemy is a free kill — everything takes at least one shot', () => {
    for (const d of B.spawnableDefs(30)) {
      expect(B.firesToKill(d, { weapon: 'blaster', wave: d.minWave })).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('spawn pressure: an escalating challenge', () => {
  it('the opening waves are sustainable with the base blaster', () => {
    expect(B.hpDemandPerSecond(1)).toBeLessThan(B.weaponDps('blaster'));
  });

  it('by mid game the base blaster alone cannot keep up', () => {
    expect(B.hpDemandPerSecond(5)).toBeGreaterThan(B.weaponDps('blaster'));
  });

  it('pressure keeps climbing wave over wave', () => {
    expect(B.hpDemandPerSecond(5)).toBeGreaterThan(B.hpDemandPerSecond(3));
    expect(B.hpDemandPerSecond(10)).toBeGreaterThan(B.hpDemandPerSecond(5));
  });

  it('a maxed weapon restores sustainability deep into a run', () => {
    // Scatter's maxed both-lane output beats even a wave-15 demand...
    expect(B.weaponDps('scatter', maxed.scatter)).toBeGreaterThan(
      B.hpDemandPerSecond(15),
    );
    // ...and every maxed weapon clears the mid-game demand.
    for (const w of WEAPONS) {
      expect(B.weaponDps(w, maxed[w])).toBeGreaterThan(B.hpDemandPerSecond(5));
    }
  });
});

describe('wave scaling', () => {
  it('enemies grow tankier at higher waves', () => {
    expect(B.enemyEffectiveHp(def('brute'), 10)).toBeGreaterThan(
      B.enemyEffectiveHp(def('brute'), 1),
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
  it('a maxed weapon kills a tough enemy far faster than at base', () => {
    for (const w of WEAPONS) {
      const base = B.timeToKill(def('brute'), { weapon: w, wave: 5 });
      const max = B.timeToKill(def('brute'), { weapon: w, wave: 5, levels: maxed[w] });
      expect(max).toBeLessThan(base * 0.6);
    }
  });
});
