import {
  ENEMY_DEFS,
  PLAYER,
  POWERUP,
  SPAWN_Y,
  WAVE,
  WEAPON,
} from './config';
import type { EnemyDef } from './types';

/**
 * Pure balance math shared by the running game and the test suite. Nothing here
 * touches game state or the DOM, so the tests exercise exactly the numbers the
 * game plays with.
 */

function atLevel(table: readonly number[], level: number): number {
  const i = Math.max(0, Math.min(level, table.length - 1));
  return table[i];
}

// ------------------------------------------------------------ weapon / buffs

export function weaponDamage(powerLevel = 0): number {
  return WEAPON.damage + atLevel(POWERUP.powerBonusByLevel, powerLevel);
}

export function weaponCooldown(rapidLevel = 0): number {
  return WEAPON.cooldown * atLevel(POWERUP.rapidCooldownByLevel, rapidLevel);
}

export function enemySpeedFactor(slowLevel = 0): number {
  return atLevel(POWERUP.slowFactorByLevel, slowLevel);
}

export function droneShots(droneLevel = 0): number {
  return atLevel(POWERUP.droneShotsByLevel, droneLevel);
}

/** Projectiles produced by one fire event, given the active buff levels. */
export function shotsPerFire(opts: {
  droneLevel?: number;
  dual?: boolean;
} = {}): number {
  return 1 + droneShots(opts.droneLevel ?? 0) + (opts.dual ? 1 : 0);
}

// -------------------------------------------------------------- progression

export function waveHpMultiplier(wave: number): number {
  return 1 + (wave - 1) * WAVE.hpGrowth;
}

export function waveSpeedMultiplier(wave: number): number {
  return Math.min(
    WAVE.maxSpeedMultiplier,
    1 + (wave - 1) * WAVE.speedGrowth,
  );
}

export function spawnInterval(wave: number): number {
  const scaled =
    WAVE.baseSpawnInterval * Math.pow(WAVE.spawnIntervalDecay, wave - 1);
  return Math.max(WAVE.minSpawnInterval, scaled);
}

export function enemyHpAtWave(def: EnemyDef, wave: number): number {
  return Math.max(1, Math.round(def.hp * waveHpMultiplier(wave)));
}

// --------------------------------------------------------- time-to-kill model

export interface KillOpts {
  wave?: number;
  powerLevel?: number;
  rapidLevel?: number;
}

/** Shots to kill: armor plates each take one hit, then HP over per-shot damage. */
export function shotsToKill(def: EnemyDef, opts: KillOpts = {}): number {
  const wave = opts.wave ?? 1;
  const armor = def.armor ?? 0;
  const hp = enemyHpAtWave(def, wave);
  const dmg = weaponDamage(opts.powerLevel ?? 0);
  return armor + Math.ceil(hp / dmg);
}

/** Seconds of sustained single-stream fire to kill one enemy. */
export function timeToKill(def: EnemyDef, opts: KillOpts = {}): number {
  return shotsToKill(def, opts) * weaponCooldown(opts.rapidLevel ?? 0);
}

/** Seconds an enemy takes to travel from spawn to the player's row. */
export function travelTimeToPlayer(def: EnemyDef, wave = 1, slowLevel = 0): number {
  const speed =
    def.speed * waveSpeedMultiplier(wave) * enemySpeedFactor(slowLevel);
  return (PLAYER.y - SPAWN_Y) / speed;
}

// --------------------------------------------------- throughput ("challenge")

/** Regular, shootable enemies that can spawn at or before a wave. */
export function spawnableDefs(wave: number): EnemyDef[] {
  return ENEMY_DEFS.filter(
    (d) => d.weight > 0 && !d.stripsPowerups && wave >= d.minWave,
  );
}

/** Mean shots-to-kill across the enemies in play at a wave. */
export function avgShotsToKill(wave: number, powerLevel = 0): number {
  const defs = spawnableDefs(wave);
  if (defs.length === 0) return 0;
  const total = defs.reduce(
    (sum, def) => sum + shotsToKill(def, { wave, powerLevel }),
    0,
  );
  return total / defs.length;
}

/** Shots the player must land per second to neutralize the spawn stream. */
export function shotsDemandPerSecond(wave: number, powerLevel = 0): number {
  return (1 / spawnInterval(wave)) * avgShotsToKill(wave, powerLevel);
}

/** Shots the player actually outputs per second in their lane. */
export function shotsSupplyPerSecond(rapidLevel = 0, droneLevel = 0): number {
  return shotsPerFire({ droneLevel }) / weaponCooldown(rapidLevel);
}
