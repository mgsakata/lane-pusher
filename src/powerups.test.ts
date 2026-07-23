import { describe, expect, it } from 'vitest';
import { weaponDamage } from './balance';
import { Effects } from './powerups';

describe('Effects leveling', () => {
  it('a leveled buff rises with each pickup and caps at maxLevel', () => {
    const e = new Effects();
    expect(e.level('power')).toBe(0);
    e.apply('power');
    expect(e.level('power')).toBe(1);
    e.apply('power');
    expect(e.level('power')).toBe(2);
    e.apply('power');
    expect(e.level('power')).toBe(3);
    e.apply('power'); // already at max
    expect(e.level('power')).toBe(3);
  });

  it('an on/off buff stays at level 1 no matter how many are collected', () => {
    const e = new Effects();
    e.apply('double');
    e.apply('double');
    e.apply('double');
    expect(e.level('double')).toBe(1);
    expect(e.isActive('double')).toBe(true);
  });

  it('instant pickups are applied, not stored as buffs', () => {
    const e = new Effects();

    const heal = e.apply('heal');
    expect(heal.heal).toBeGreaterThan(0);
    expect(e.isActive('heal')).toBe(false);

    const shield = e.apply('shield');
    expect(shield.shieldCharges).toBeGreaterThan(0);
    expect(e.isActive('shield')).toBe(false);

    const bomb = e.apply('bomb');
    expect(bomb.bomb).toBe(true);
    expect(e.isActive('bomb')).toBe(false);
  });

  it('a hazard strip clears every buff level and reports the count', () => {
    const e = new Effects();
    e.apply('power');
    e.apply('rapid');
    e.apply('rapid');
    expect(e.list().length).toBe(2);

    const lost = e.stripAll();
    expect(lost).toBe(2);
    expect(e.level('power')).toBe(0);
    expect(e.level('rapid')).toBe(0);
  });

  it('list reports each held buff with its current level', () => {
    const e = new Effects();
    e.apply('rapid');
    e.apply('rapid');
    const rapid = e.list().find((b) => b.def.kind === 'rapid');
    expect(rapid?.level).toBe(2);
  });

  it('buff level drives weapon output through the balance model', () => {
    const e = new Effects();
    e.apply('power');
    e.apply('power');
    // Two PWR pickups => level 2 => +2 damage over the base of 1.
    expect(weaponDamage(e.level('power'))).toBe(3);
  });
});
