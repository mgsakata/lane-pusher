import type { EnemyDef, PowerUpDef } from './types';

/**
 * Every tunable number lives here. Nothing in this file depends on game state,
 * so it is safe to tweak freely while the dev server is running.
 */

// ---------------------------------------------------------------- playfield

/** Logical resolution. The canvas is scaled to fit the viewport. */
export const WIDTH = 480;
export const HEIGHT = 854;

export const LANE_COUNT = 2;
export const FIELD_MARGIN = 40;
export const LANE_WIDTH = (WIDTH - FIELD_MARGIN * 2) / LANE_COUNT;

/** Enemies that cross this y-value breach your defense and damage you. */
export const GOAL_LINE_Y = HEIGHT - 90;

/** Everything spawns above the top edge and scrolls down. */
export const SPAWN_Y = -60;

export function laneCenterX(lane: number): number {
  return FIELD_MARGIN + LANE_WIDTH * (lane + 0.5);
}

// ------------------------------------------------------------------ player

export const PLAYER = {
  y: GOAL_LINE_Y - 40,
  radius: 22,
  maxHealth: 5,
  /** Seconds to slide between lanes. */
  switchTime: 0.11,
  /** Seconds of invulnerability after taking a hit. */
  invulnTime: 0.9,
};

export const WEAPON = {
  /** Seconds between shots at base fire rate. */
  cooldown: 0.28,
  damage: 1,
  projectileSpeed: 900,
  projectileRadius: 6,
};

// ------------------------------------------------------------------ enemies

export const ENEMY_DEFS: EnemyDef[] = [
  {
    kind: 'grunt',
    hp: 2,
    speed: 105,
    damage: 1,
    score: 10,
    radius: 20,
    color: '#f0653f',
    minWave: 1,
    weight: 10,
  },
  {
    kind: 'runner',
    hp: 1,
    speed: 210,
    damage: 1,
    score: 15,
    radius: 15,
    color: '#f7d154',
    minWave: 2,
    weight: 7,
  },
  {
    kind: 'brute',
    hp: 8,
    speed: 62,
    damage: 2,
    score: 40,
    radius: 30,
    color: '#9b5de5',
    minWave: 3,
    weight: 5,
  },
  {
    kind: 'splitter',
    hp: 4,
    speed: 95,
    damage: 1,
    score: 30,
    radius: 24,
    color: '#3ddc97',
    minWave: 5,
    weight: 5,
  },
  {
    kind: 'boss',
    hp: 45,
    speed: 40,
    damage: 3,
    score: 300,
    radius: 42,
    color: '#ff2e63',
    // Bosses are scheduled explicitly by the spawner, never rolled at random.
    minWave: 999,
    weight: 0,
  },
  {
    kind: 'hazard',
    // Unshootable and unkillable, so hp is nominal and never depleted.
    hp: 1,
    speed: 130,
    // Deals no HP damage; its threat is stripping your buffs on contact.
    damage: 0,
    score: 0,
    radius: 22,
    color: '#ff5cf0',
    minWave: 2,
    weight: 4,
    stripsPowerups: true,
  },
];

/** A dying splitter bursts into this many runners in the same lane. */
export const SPLITTER_CHILDREN = 2;

// -------------------------------------------------------------- progression

export const WAVE = {
  /** Seconds of active spawning per wave. */
  duration: 22,
  /** Seconds of calm between waves. */
  breather: 3,
  /** Seconds between spawns on wave 1. */
  baseSpawnInterval: 1.15,
  /** Spawn interval is multiplied by this per wave, floored below. */
  spawnIntervalDecay: 0.93,
  minSpawnInterval: 0.34,
  /** Enemy hp multiplier: 1 + (wave - 1) * hpGrowth. */
  hpGrowth: 0.18,
  /** Enemy speed multiplier: 1 + (wave - 1) * speedGrowth, capped. */
  speedGrowth: 0.035,
  maxSpeedMultiplier: 2.2,
  /** Every Nth wave is a boss wave. */
  bossEvery: 5,
  /** Score awarded for surviving a wave, multiplied by wave number. */
  clearBonus: 50,
};

// --------------------------------------------------------------- power-ups

export const POWERUP_DEFS: PowerUpDef[] = [
  { kind: 'rapid', label: 'RAPID', type: 'buff', color: '#4cc9f0', weight: 10 },
  { kind: 'double', label: 'DUAL', type: 'buff', color: '#f72585', weight: 8 },
  { kind: 'shield', label: 'SHLD', type: 'instant', color: '#4361ee', weight: 7 },
  { kind: 'heal', label: 'HEAL', type: 'instant', color: '#3ddc97', weight: 5 },
  { kind: 'pierce', label: 'PIER', type: 'buff', color: '#ffd60a', weight: 7 },
  { kind: 'slow', label: 'SLOW', type: 'buff', color: '#b8c0ff', weight: 5 },
];

export const POWERUP = {
  /** Seconds between pickup spawns. */
  interval: 7.5,
  /** Random +/- jitter applied to the interval. */
  intervalJitter: 2.5,
  radius: 18,
  /** Pickups drift down slower than enemies so they are catchable. */
  speed: 90,
  /** Fire-rate multiplier while RAPID is active (lower cooldown = faster). */
  rapidCooldownScale: 0.45,
  /** Enemy speed multiplier while SLOW is active. */
  slowFactor: 0.45,
  /** Hits absorbed by a single SHLD pickup. */
  shieldCharges: 2,
  healAmount: 1,
};

// ---------------------------------------------------------------- scoring

export const SCORE = {
  /** Kills needed per step of the combo multiplier. */
  killsPerComboStep: 5,
  maxComboMultiplier: 5,
};

// ------------------------------------------------------------------ juice

export const FX = {
  shakeOnHit: 14,
  shakeOnKill: 2.5,
  shakeDecay: 12,
  hitFlashTime: 0.08,
  particleLife: 0.55,
  particlesPerKill: 12,
};

export const COLORS = {
  bg: '#0d1117',
  laneA: '#151b26',
  laneB: '#111722',
  laneEdge: '#232c3d',
  goalLine: '#2f3d57',
  player: '#00e5ff',
  playerInvuln: '#7fffe8',
  projectile: '#e8faff',
  text: '#e6edf3',
  textDim: '#7d8590',
  health: '#ff4d6d',
  shield: '#4361ee',
};
