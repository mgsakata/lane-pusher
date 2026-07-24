import {
  BUFF_SCALING,
  ENEMY_DEFS,
  PLAYER,
  SPAWN_Y,
  WAVE,
  WEAPON_DEFS,
} from './config';
import type { EnemyDef, PowerUpKind, WeaponKind } from './types';

/**
 * Pure balance math shared by the running game and the test suite. Nothing here
 * touches game state or the DOM, so the tests exercise exactly the numbers the
 * game plays with.
 */

/** Held buff levels, keyed by kind. */
export type Levels = Partial<Record<PowerUpKind, number>>;

function atLevel(table: readonly number[], level: number): number {
  const i = Math.max(0, Math.min(level, table.length - 1));
  return table[i];
}

function lvl(levels: Levels, kind: PowerUpKind): number {
  return levels[kind] ?? 0;
}

// -------------------------------------------------------------------- weapon

/** Seconds between shots for a weapon, after its fire-rate buff. */
export function fireCooldown(weapon: WeaponKind, levels: Levels = {}): number {
  const def = WEAPON_DEFS[weapon];
  let cd = def.baseCooldown;
  if (weapon === 'blaster') cd *= atLevel(BUFF_SCALING.rapid, lvl(levels, 'rapid'));
  if (weapon === 'scatter') cd *= atLevel(BUFF_SCALING.pump, lvl(levels, 'pump'));
  if (weapon === 'railgun') cd *= atLevel(BUFF_SCALING.charge, lvl(levels, 'charge'));
  return cd;
}

/** Damage of a single projectile, after the weapon's damage buff. */
export function projectileDamage(weapon: WeaponKind, levels: Levels = {}): number {
  const def = WEAPON_DEFS[weapon];
  let dmg = def.baseDamage;
  if (weapon === 'blaster') dmg += atLevel(BUFF_SCALING.power, lvl(levels, 'power'));
  if (weapon === 'scatter') dmg += atLevel(BUFF_SCALING.punch, lvl(levels, 'punch'));
  if (weapon === 'railgun') dmg += atLevel(BUFF_SCALING.overload, lvl(levels, 'overload'));
  return dmg;
}

/** Projectiles fired into a single lane per shot (scatter fires several). */
export function pelletsPerLane(weapon: WeaponKind, levels: Levels = {}): number {
  if (weapon === 'scatter') return atLevel(BUFF_SCALING.spread, lvl(levels, 'spread'));
  return 1;
}

/** Lanes a shot covers: scatter both; blaster with TWIN; railgun with FORK. */
export function lanesFired(weapon: WeaponKind, levels: Levels = {}): number {
  if (weapon === 'scatter') return 2;
  if (weapon === 'blaster' && lvl(levels, 'twin') > 0) return 2;
  if (weapon === 'railgun' && lvl(levels, 'fork') > 0) return 2;
  return 1;
}

/** Total projectiles produced by one shot. */
export function projectilesPerFire(weapon: WeaponKind, levels: Levels = {}): number {
  return pelletsPerLane(weapon, levels) * lanesFired(weapon, levels);
}

/** Enemy speed multiplier while the universal SLOW buff is held. */
export function enemySpeedFactor(slowLevel = 0): number {
  return atLevel(BUFF_SCALING.slow, slowLevel);
}

/** Raw damage the weapon puts out per second, summed across its lanes. */
export function weaponDps(weapon: WeaponKind, levels: Levels = {}): number {
  return (
    (projectilesPerFire(weapon, levels) * projectileDamage(weapon, levels)) /
    fireCooldown(weapon, levels)
  );
}

// -------------------------------------------------------------- progression

export function waveHpMultiplier(wave: number): number {
  return 1 + (wave - 1) * WAVE.hpGrowth;
}

export function waveSpeedMultiplier(wave: number): number {
  return Math.min(WAVE.maxSpeedMultiplier, 1 + (wave - 1) * WAVE.speedGrowth);
}

export function spawnInterval(wave: number): number {
  const scaled =
    WAVE.baseSpawnInterval * Math.pow(WAVE.spawnIntervalDecay, wave - 1);
  return Math.max(WAVE.minSpawnInterval, scaled);
}

export function enemyHpAtWave(def: EnemyDef, wave: number): number {
  return Math.max(1, Math.round(def.hp * waveHpMultiplier(wave)));
}

/** HP plus armor plates: the total "durability" a weapon must chew through. */
export function enemyEffectiveHp(def: EnemyDef, wave: number): number {
  return enemyHpAtWave(def, wave) + (def.armor ?? 0);
}

// --------------------------------------------------------- time-to-kill model

export interface KillOpts {
  wave?: number;
  weapon?: WeaponKind;
  levels?: Levels;
}

/** Total projectile hits to break any armor and then destroy the HP. */
export function hitsToKill(def: EnemyDef, opts: KillOpts = {}): number {
  const wave = opts.wave ?? 1;
  const weapon = opts.weapon ?? 'blaster';
  const armor = def.armor ?? 0;
  const hp = enemyHpAtWave(def, wave);
  const dmg = projectileDamage(weapon, opts.levels);
  return armor + Math.ceil(hp / dmg);
}

/** Shots (fire events) to kill: pellets landing per lane batch up the hits. */
export function firesToKill(def: EnemyDef, opts: KillOpts = {}): number {
  const weapon = opts.weapon ?? 'blaster';
  const pellets = pelletsPerLane(weapon, opts.levels);
  return Math.ceil(hitsToKill(def, opts) / pellets);
}

/** Seconds of sustained fire to kill one enemy. */
export function timeToKill(def: EnemyDef, opts: KillOpts = {}): number {
  const weapon = opts.weapon ?? 'blaster';
  return firesToKill(def, opts) * fireCooldown(weapon, opts.levels);
}

/** Seconds an enemy takes to travel from spawn to the player's row. */
export function travelTimeToPlayer(def: EnemyDef, wave = 1, slowLevel = 0): number {
  const speed =
    def.speed *
    waveSpeedMultiplier(wave) *
    atLevel(BUFF_SCALING.slow, slowLevel);
  return (PLAYER.y - SPAWN_Y) / speed;
}

// --------------------------------------------------- throughput ("challenge")

/** Regular, shootable enemies that can spawn at or before a wave. */
export function spawnableDefs(wave: number): EnemyDef[] {
  return ENEMY_DEFS.filter(
    (d) => d.weight > 0 && !d.stripsPowerups && wave >= d.minWave,
  );
}

/** Mean durability (HP + armor) of the enemies in play at a wave. */
export function avgEffectiveHp(wave: number): number {
  const defs = spawnableDefs(wave);
  if (defs.length === 0) return 0;
  const total = defs.reduce((sum, def) => sum + enemyEffectiveHp(def, wave), 0);
  return total / defs.length;
}

/** Enemy durability arriving per second that the player must destroy. */
export function hpDemandPerSecond(wave: number): number {
  return (1 / spawnInterval(wave)) * avgEffectiveHp(wave);
}
