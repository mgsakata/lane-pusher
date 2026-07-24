import {
  pickupInterval,
  spawnInterval,
  waveHpMultiplier,
  waveSpeedMultiplier,
} from './balance';
import { ENEMY_DEFS, LANE_COUNT, POWERUP, WAVE } from './config';
import type { EnemyDef, LaneIndex } from './types';
import { mulberry32, pickWeighted, randInt, randRange, type Rng } from './util';

export interface EnemySpawn {
  def: EnemyDef;
  lane: LaneIndex;
  hpMultiplier: number;
  speedMultiplier: number;
}

export interface SpawnTick {
  enemies: EnemySpawn[];
  /** Lanes in which to drop a pickup; the game chooses each pickup's content. */
  pickupLanes: LaneIndex[];
  /** Set on the frame a wave's active phase ends. */
  waveCleared: number | null;
  /** Set on the frame a new wave's active phase begins. */
  waveStarted: number | null;
}

type WavePhase = 'active' | 'breather';

/**
 * Drives progression: which enemies exist, how often they arrive, how tough
 * they are, and when boss waves happen. Owns no entities — it only describes
 * what should be created, and the game builds it.
 */
export class Spawner {
  wave = 1;
  phase: WavePhase = 'active';
  /** Seconds elapsed in the current phase, used for the HUD wave bar. */
  phaseElapsed = 0;

  /** True while a boss is alive; a boss wave cannot end until it is cleared. */
  bossPending = false;

  /** Set by the game each frame; blocks a second WARDEN while one is alive. */
  wardenAlive = false;

  private enemyTimer = 0;
  private pickupTimer = POWERUP.interval * 0.6;

  /**
   * The source of spawn randomness. Seeded per day (see `seed`) so every player
   * faces the same enemy sequence in a daily run; falls back to Math.random for
   * an unseeded run. Only spawn decisions draw from it — player-driven and
   * cosmetic randomness stay on Math.random — so the shared sequence never
   * desyncs on how well someone plays.
   */
  private rng: Rng = Math.random;

  reset() {
    this.wave = 1;
    this.phase = 'active';
    this.phaseElapsed = 0;
    this.bossPending = false;
    this.wardenAlive = false;
    this.enemyTimer = 0;
    this.pickupTimer = POWERUP.interval * 0.6;
  }

  /** Seeds the spawn sequence; pass null to use nondeterministic Math.random. */
  seed(seed: number | null) {
    this.rng = seed === null ? Math.random : mulberry32(seed);
  }

  /** Fraction of the current phase completed, 0..1. */
  get phaseProgress(): number {
    const total = this.phase === 'active' ? WAVE.duration : WAVE.breather;
    return Math.min(1, this.phaseElapsed / total);
  }

  get isBossWave(): boolean {
    return this.wave % WAVE.bossEvery === 0;
  }

  get hpMultiplier(): number {
    return waveHpMultiplier(this.wave);
  }

  get speedMultiplier(): number {
    return waveSpeedMultiplier(this.wave);
  }

  private get spawnInterval(): number {
    return spawnInterval(this.wave);
  }

  /** Called once at the start of each wave's active phase. */
  private openWave(out: SpawnTick) {
    out.waveStarted = this.wave;
    this.enemyTimer = this.spawnInterval * 0.5;

    if (this.isBossWave) {
      const boss = ENEMY_DEFS.find((d) => d.kind === 'boss');
      if (boss) {
        this.bossPending = true;
        out.enemies.push({
          def: boss,
          lane: randInt(0, LANE_COUNT, this.rng) as LaneIndex,
          hpMultiplier: this.hpMultiplier,
          speedMultiplier: this.speedMultiplier,
        });
      }
    }
  }

  update(dt: number): SpawnTick {
    const out: SpawnTick = {
      enemies: [],
      pickupLanes: [],
      waveCleared: null,
      waveStarted: null,
    };

    this.phaseElapsed += dt;

    if (this.phase === 'active') {
      // Boss waves lean on the boss itself, so trickle fewer regulars.
      const intervalScale = this.isBossWave ? 1.6 : 1;
      this.enemyTimer -= dt;
      if (this.enemyTimer <= 0) {
        this.enemyTimer += this.spawnInterval * intervalScale;
        const def = this.rollEnemy();
        if (def) {
          out.enemies.push({
            def,
            lane: randInt(0, LANE_COUNT, this.rng) as LaneIndex,
            hpMultiplier: this.hpMultiplier,
            speedMultiplier: this.speedMultiplier,
          });
        }
      }

      // A boss wave stays active until its boss is destroyed.
      if (this.phaseElapsed >= WAVE.duration && !this.bossPending) {
        out.waveCleared = this.wave;
        this.phase = 'breather';
        this.phaseElapsed = 0;
      }
    } else if (this.phaseElapsed >= WAVE.breather) {
      this.wave += 1;
      this.phase = 'active';
      this.phaseElapsed = 0;
      this.openWave(out);
    }

    // Pickups arrive on their own clock so breathers stay useful.
    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0) {
      this.pickupTimer =
        pickupInterval(this.wave) +
        randRange(-POWERUP.intervalJitter, POWERUP.intervalJitter, this.rng);
      out.pickupLanes.push(randInt(0, LANE_COUNT, this.rng) as LaneIndex);
    }

    return out;
  }

  /** Picks an archetype unlocked by the current wave, weighted by rarity. */
  private rollEnemy(): EnemyDef | undefined {
    return pickWeighted(
      ENEMY_DEFS,
      (def) => {
        if (this.wave < def.minWave) return 0;
        // Only ever one warden on the field at a time.
        if (def.kind === 'warden' && this.wardenAlive) return 0;
        return def.weight;
      },
      this.rng,
    );
  }
}
