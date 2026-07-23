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

  it('a hazard strip clears every buff level and reports the count', () => {
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
