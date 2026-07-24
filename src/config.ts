import type {
  EnemyDef,
  PowerUpDef,
  PowerUpKind,
  WeaponDef,
  WeaponKind,
} from './types';

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

// ------------------------------------------------------------------ weapons

export const STARTING_WEAPON: WeaponKind = 'blaster';

/**
 * The player carries one active weapon at a time, switched by weapon pickups.
 * Each weapon fires differently and is upgraded only by its own `buffs`.
 */
export const WEAPON_DEFS: Record<WeaponKind, WeaponDef> = {
  blaster: {
    kind: 'blaster',
    name: 'BLASTER',
    desc: 'Fast single shots up your lane',
    color: '#8fe9ff',
    baseCooldown: 0.28,
    baseDamage: 1,
    projectileSpeed: 900,
    projectileRadius: 6,
    pierce: false,
    buffs: ['rapid', 'twin'],
    switchWeight: 2,
  },
  scatter: {
    kind: 'scatter',
    name: 'SCATTER',
    desc: 'Pellet spread covering both lanes',
    color: '#ffd166',
    baseCooldown: 0.46,
    baseDamage: 1,
    projectileSpeed: 820,
    projectileRadius: 5,
    pierce: false,
    buffs: ['spread', 'punch'],
    switchWeight: 2,
  },
  railgun: {
    kind: 'railgun',
    name: 'RAILGUN',
    desc: 'Slow, piercing, heavy hits',
    color: '#c77dff',
    baseCooldown: 0.72,
    baseDamage: 3,
    projectileSpeed: 1300,
    projectileRadius: 8,
    pierce: true,
    buffs: ['charge', 'overload'],
    switchWeight: 2,
  },
};

/** Per-level scaling for weapon buffs. Index by level; index 0 is "not held". */
export const BUFF_SCALING = {
  /** Blaster fire-cooldown multiplier. */
  rapid: [1, 0.62, 0.44, 0.3],
  /** Railgun fire-cooldown multiplier. */
  charge: [1, 0.72, 0.56, 0.42],
  /** Scatter pellets fired per lane (level 0 = 1 pellet). */
  spread: [1, 2, 3, 4],
  /** Scatter bonus damage per pellet. */
  punch: [0, 1, 2, 3],
  /** Railgun bonus damage. */
  overload: [0, 2, 4, 6],
  /** Universal enemy speed multiplier while SLOW is held. */
  slow: [1, 0.6, 0.45, 0.33],
};

/** Spacing between scatter pellets within a lane. */
export const SCATTER_PELLET_SPACING = 16;

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
  {
    kind: 'weaver',
    hp: 3,
    speed: 120,
    damage: 1,
    score: 25,
    radius: 18,
    color: '#06d6a0',
    minWave: 3,
    weight: 6,
    weaveInterval: 0.9,
  },
  {
    kind: 'armored',
    hp: 4,
    speed: 70,
    damage: 2,
    score: 55,
    radius: 26,
    color: '#8d99ae',
    minWave: 4,
    weight: 5,
    armor: 4,
  },
  {
    kind: 'shooter',
    hp: 3,
    speed: 55,
    damage: 1,
    score: 45,
    radius: 22,
    color: '#e07a5f',
    minWave: 4,
    weight: 5,
    shootInterval: 1.6,
  },
];

/** Downward shots fired by shooter enemies. */
export const ENEMY_SHOT = {
  speed: 300,
  damage: 1,
  radius: 7,
  color: '#ffb703',
};

export const WEAVE = {
  /** Pixels per second the weaver slides toward its new lane center. */
  slideSpeed: 520,
};

/**
 * Boss behavior. A boss descends to `holdY`, then holds there and attacks
 * instead of crossing the goal: it switches lanes and fires shot bursts. Below
 * `enrageAt` health it speeds up and fires both lanes. The boss wave does not
 * end until the boss is destroyed.
 */
export const BOSS = {
  holdY: 200,
  descendSpeed: 95,
  fireInterval: 1.5,
  fireIntervalEnraged: 0.75,
  weaveInterval: 2.6,
  weaveIntervalEnraged: 1.4,
  enrageAt: 0.5,
  shotRadius: 9,
  shotDamage: 1,
};

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
  // Blaster
  { kind: 'rapid', label: 'RAPID', desc: 'Blaster: faster fire rate', type: 'buff', color: '#8fe9ff', weight: 10, maxLevel: 3 },
  { kind: 'twin', label: 'TWIN', desc: 'Blaster: fire both lanes', type: 'buff', color: '#8fe9ff', weight: 8 },
  // Scatter
  { kind: 'spread', label: 'SPREAD', desc: 'Scatter: more pellets', type: 'buff', color: '#ffd166', weight: 10, maxLevel: 3 },
  { kind: 'punch', label: 'PUNCH', desc: 'Scatter: more damage', type: 'buff', color: '#ffd166', weight: 8, maxLevel: 3 },
  // Railgun
  { kind: 'charge', label: 'CHARGE', desc: 'Railgun: faster fire rate', type: 'buff', color: '#c77dff', weight: 10, maxLevel: 3 },
  { kind: 'overload', label: 'OVERLD', desc: 'Railgun: more damage', type: 'buff', color: '#c77dff', weight: 8, maxLevel: 3 },
  // Universal
  { kind: 'slow', label: 'SLOW', desc: 'Enemies move slower', type: 'buff', color: '#b8c0ff', weight: 5, maxLevel: 3 },
  { kind: 'shield', label: 'SHLD', desc: 'Blocks the next 2 hits', type: 'instant', color: '#4361ee', weight: 6 },
  { kind: 'heal', label: 'HEAL', desc: 'Restore 1 health', type: 'instant', color: '#3ddc97', weight: 5 },
  { kind: 'bomb', label: 'BOMB', desc: 'Vaporize all enemies', type: 'instant', color: '#ef476f', weight: 4 },
];

/** Buffs/instants that can drop regardless of the active weapon. */
export const UNIVERSAL_DROPS: PowerUpKind[] = ['slow', 'shield', 'heal', 'bomb'];

export const POWERUP = {
  /** Seconds between pickup spawns. */
  interval: 7.5,
  /** Random +/- jitter applied to the interval. */
  intervalJitter: 2.5,
  radius: 18,
  /** Pickups drift down slower than enemies so they are catchable. */
  speed: 90,
  /** Hits absorbed by a single SHLD pickup. */
  shieldCharges: 2,
  healAmount: 1,
};

// --------------------------------------------------------------- ability

/** The chargeable active ability (PULSE): a defensive screen-clear + i-frames. */
export const ABILITY = {
  name: 'PULSE',
  desc: 'Clear shots + brief shield. Charges from kills.',
  /** Kills needed to fully charge. */
  maxCharge: 22,
  /** Damage dealt to every regular enemy on activation. */
  damage: 5,
  /** Seconds of invulnerability granted. */
  invuln: 2.6,
  color: '#ffd60a',
};

/**
 * Tap region (as viewport fractions) that fires the ability instead of
 * switching lanes — the bottom-right corner. Keyboard: Space.
 */
export const ABILITY_BUTTON = { xMin: 0.78, yMin: 0.9 };

/**
 * Top-right tap region that pauses (during play) or opens the guide (on the
 * menus). Keyboard: Escape / P to pause, H for help.
 */
export const PAUSE_BUTTON = { xMin: 0.88, yMax: 0.06 };

/** Top-left tap region that toggles mute. */
export const MUTE_BUTTON = { xMax: 0.1, yMax: 0.06 };

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
