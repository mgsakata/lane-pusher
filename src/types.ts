export type LaneIndex = 0 | 1;

export type EnemyKind = 'grunt' | 'runner' | 'brute' | 'splitter' | 'boss';

/** Static definition of an enemy archetype. Instances are scaled by wave. */
export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  /** Downward pixels per second, before slow-mo and wave scaling. */
  speed: number;
  /** Damage dealt to the player on contact or on breaching the goal line. */
  damage: number;
  score: number;
  radius: number;
  color: string;
  /** First wave on which this archetype can spawn. */
  minWave: number;
  /** Relative spawn weight once unlocked. */
  weight: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  lane: LaneIndex;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  score: number;
  radius: number;
  color: string;
  /** Seconds left on the white hit-flash overlay. */
  hitFlash: number;
  /** Seconds since spawn, used for idle wobble. */
  age: number;
}

export type PowerUpKind =
  | 'rapid'
  | 'double'
  | 'shield'
  | 'heal'
  | 'pierce'
  | 'slow';

export interface PowerUpDef {
  kind: PowerUpKind;
  label: string;
  /** Seconds the effect lasts. Zero means it applies instantly. */
  duration: number;
  color: string;
  weight: number;
}

export interface Pickup {
  id: number;
  kind: PowerUpKind;
  lane: LaneIndex;
  x: number;
  y: number;
  radius: number;
  color: string;
  label: string;
  age: number;
}

export interface Projectile {
  id: number;
  lane: LaneIndex;
  x: number;
  y: number;
  radius: number;
  damage: number;
  /** Passes through enemies instead of being consumed. */
  pierce: boolean;
  /** Enemy ids already damaged, so a piercing shot hits each target once. */
  hitIds: Set<number>;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
}

export type Phase = 'title' | 'playing' | 'gameover';
