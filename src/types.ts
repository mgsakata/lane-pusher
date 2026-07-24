export type LaneIndex = 0 | 1;

export type EnemyKind =
  | 'grunt'
  | 'runner'
  | 'brute'
  | 'splitter'
  | 'boss'
  | 'hazard'
  | 'superdampener'
  | 'weaver'
  | 'armored'
  | 'shooter'
  | 'dasher'
  | 'phantom';

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
  /**
   * A hazard: it cannot be shot (projectiles pass through) and deals no HP
   * damage. Instead, reaching the player strips all active buffs. Dodge it by
   * being in the other lane.
   */
  stripsPowerups?: boolean;
  /**
   * A super-dampener: on top of `stripsPowerups`, contact wipes EVERY held buff
   * (all weapons + universals) instead of a single random stack.
   */
  stripsAll?: boolean;
  /** Front-shield hits that must be broken before HP can be damaged. */
  armor?: number;
  /** Seconds between lane switches. Present on weavers only. */
  weaveInterval?: number;
  /** Seconds between downward shots. Present on shooters only. */
  shootInterval?: number;
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
  /** Copied from the def: a hazard strips buffs instead of dealing damage. */
  stripsPowerups: boolean;
  /** Copied from the def: a super-dampener wipes every held buff on contact. */
  stripsAll: boolean;
  /** Remaining front-shield hits; while positive, HP cannot be reduced. */
  armor: number;
  /** Starting armor, for rendering the shield arc. */
  maxArmor: number;
  /** Seconds until the next lane switch; <= 0 for non-weavers. */
  weaveTimer: number;
  /** How often this weaver switches lanes. */
  weaveInterval: number;
  /** Seconds until the next shot; <= 0 for non-shooters. */
  shootTimer: number;
  /** How often this shooter fires. */
  shootInterval: number;
  /** Seconds left on the white hit-flash overlay. */
  hitFlash: number;
  /** Seconds since spawn, used for idle wobble. */
  age: number;
}

/** A projectile fired downward by a shooter enemy; damages the player. */
export interface EnemyShot {
  id: number;
  lane: LaneIndex;
  x: number;
  y: number;
  radius: number;
  damage: number;
}

export type WeaponKind = 'blaster' | 'scatter' | 'railgun';

export type AbilityKind = 'pulse' | 'overdrive' | 'barrier';

/** Static definition of an active ability, switched by ability pickups. */
export interface AbilityDef {
  kind: AbilityKind;
  name: string;
  desc: string;
  color: string;
  /** Kills needed to fully charge. */
  maxCharge: number;
  /** PULSE: damage dealt to every enemy on use. */
  damage?: number;
  /** PULSE/BARRIER: seconds of invulnerability granted. */
  invuln?: number;
  /** OVERDRIVE: seconds the fire boost lasts. */
  duration?: number;
  /** Relative spawn weight of the pickup that switches to this ability. */
  switchWeight: number;
}

/** Static definition of a weapon and how it fires. */
export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  /** One-line explanation for the help legend. */
  desc: string;
  color: string;
  /** Seconds between shots at base fire rate. */
  baseCooldown: number;
  /** Damage per projectile at base. */
  baseDamage: number;
  projectileSpeed: number;
  projectileRadius: number;
  /** Whether shots pass through enemies. */
  pierce: boolean;
  /** Buff kinds that upgrade this weapon (and only this weapon). */
  buffs: PowerUpKind[];
  /** Relative spawn weight of the pickup that switches to this weapon. */
  switchWeight: number;
}

export type PowerUpKind =
  // Blaster buffs
  | 'rapid'
  | 'twin'
  | 'power'
  // Scatter buffs
  | 'spread'
  | 'punch'
  | 'pump'
  // Railgun buffs
  | 'charge'
  | 'overload'
  | 'fork'
  // Universal persistent buffs
  | 'slow'
  | 'vamp'
  | 'greed'
  // Universal timed bursts
  | 'frenzy'
  | 'freeze'
  // Universal instants
  | 'shield'
  | 'heal'
  | 'bomb'
  | 'vit';

export interface PowerUpDef {
  kind: PowerUpKind;
  label: string;
  /** One-line explanation for the help legend. */
  desc: string;
  /**
   * 'buff' effects persist until a hazard strips them; 'instant' effects
   * (heal, shield) apply the moment collected; 'timed' effects run for
   * `duration` seconds then expire.
   */
  type: 'buff' | 'instant' | 'timed';
  color: string;
  weight: number;
  /**
   * Highest level a buff can reach by re-collecting it. Defaults to 1 (a plain
   * on/off buff). Leveled buffs scale their effect with level.
   */
  maxLevel?: number;
  /** Seconds a 'timed' effect lasts. */
  duration?: number;
}

/** A pickup grants a power-up, or switches the active weapon or ability. */
export type PickupContent =
  | { type: 'power'; power: PowerUpKind }
  | { type: 'weapon'; weapon: WeaponKind }
  | { type: 'ability'; ability: AbilityKind };

export interface Pickup {
  id: number;
  content: PickupContent;
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
  color: string;
  /** Upward pixels per second. */
  speed: number;
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
