import { describe, expect, it } from 'vitest';
import { projectileDamage } from './balance';
import { Effects } from './powerups';

describe('Effects leveling', () => {
  it('a leveled buff rises with each pickup and caps at maxLevel', () => {
    const e = new Effects();
    expect(e.level('punch')).toBe(0);
    e.apply('punch');
    expect(e.level('punch')).toBe(1);
    e.apply('punch');
    e.apply('punch');
    expect(e.level('punch')).toBe(3);
    e.apply('punch'); // already at max
    expect(e.level('punch')).toBe(3);
  });

  it('an on/off buff stays at level 1 no matter how many are collected', () => {
    const e = new Effects();
    e.apply('twin');
    e.apply('twin');
    expect(e.level('twin')).toBe(1);
    expect(e.isActive('twin')).toBe(true);
  });

  it('instant pickups are applied, not stored as buffs', () => {
    const e = new Effects();
    expect(e.apply('heal').heal).toBeGreaterThan(0);
    expect(e.isActive('heal')).toBe(false);
    expect(e.apply('shield').shieldCharges).toBeGreaterThan(0);
    expect(e.apply('bomb').bomb).toBe(true);
  });

  it('stripAll clears every buff level and reports the count', () => {
    const e = new Effects();
    e.apply('spread');
    e.apply('punch');
    e.apply('punch');
    expect(e.list().length).toBe(2);

    const lost = e.stripAll();
    expect(lost).toBe(2);
    expect(e.level('punch')).toBe(0);
    expect(e.level('spread')).toBe(0);
  });

  it('stripOne removes one level of a held candidate, leaving the rest', () => {
    const e = new Effects();
    e.apply('rapid');
    e.apply('rapid'); // level 2
    e.apply('punch'); // not a candidate below

    const stripped = e.stripOne(['rapid']);
    expect(stripped).toBe('rapid');
    expect(e.level('rapid')).toBe(1); // one level gone
    expect(e.level('punch')).toBe(1); // untouched
  });

  it('stripOne returns null when no candidate is held', () => {
    const e = new Effects();
    e.apply('rapid');
    expect(e.stripOne(['twin', 'slow'])).toBeNull();
    expect(e.level('rapid')).toBe(1);
  });

  it('list reports level, and levelMap feeds the balance model', () => {
    const e = new Effects();
    e.apply('punch');
    e.apply('punch');
    expect(e.list().find((b) => b.def.kind === 'punch')?.level).toBe(2);
    // Two PUNCH pickups => level 2, matching the same-level balance calc.
    expect(projectileDamage('scatter', e.levelMap())).toBe(
      projectileDamage('scatter', { punch: 2 }),
    );
  });
});

describe('timed and instant effects', () => {
  it('a timed burst activates and then expires', () => {
    const e = new Effects();
    expect(e.timedActive('frenzy')).toBe(false);
    e.apply('frenzy');
    expect(e.timedActive('frenzy')).toBe(true);
    e.tick(0.5);
    expect(e.timedActive('frenzy')).toBe(true); // still running
    e.tick(999);
    expect(e.timedActive('frenzy')).toBe(false);
  });

  it('timed bursts are listed with remaining time and survive a strip', () => {
    const e = new Effects();
    e.apply('freeze');
    e.apply('rapid'); // a buff, gets stripped
    expect(e.timedList().find((t) => t.def.kind === 'freeze')?.remaining).toBeGreaterThan(0);
    e.stripAll();
    expect(e.timedActive('freeze')).toBe(true); // bursts aren't stripped
    expect(e.level('rapid')).toBe(0);
  });

  it('VIT reports a max-health instant', () => {
    const e = new Effects();
    expect(e.apply('vit').maxHealth).toBeGreaterThan(0);
    expect(e.apply('heal').maxHealth).toBe(0);
  });
});
