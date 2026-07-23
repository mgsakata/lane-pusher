import {
  COLORS,
  ENEMY_DEFS,
  ENEMY_SHOT,
  FX,
  GOAL_LINE_Y,
  LANE_COUNT,
  PLAYER,
  POWERUP,
  SCORE,
  SPAWN_Y,
  WAVE,
  WEAPON,
  WEAVE,
  laneCenterX,
} from './config';
import {
  droneShots,
  enemySpeedFactor,
  weaponCooldown,
  weaponDamage,
} from './balance';
import type { InputSource } from './input';
import { Effects } from './powerups';
import { Spawner, type EnemySpawn, type PickupSpawn } from './spawner';
import type {
  Enemy,
  EnemyShot,
  FloatingText,
  LaneIndex,
  Particle,
  Phase,
  Pickup,
  Projectile,
} from './types';
import { clamp, randRange, randInt } from './util';

const BEST_SCORE_KEY = 'lane-pusher.bestScore';

export interface Player {
  lane: LaneIndex;
  /** Rendered x, which slides toward the target lane center. */
  x: number;
  health: number;
  shieldCharges: number;
  /** Seconds of remaining post-hit invulnerability. */
  invuln: number;
  fireCooldown: number;
}

export class Game {
  phase: Phase = 'title';

  player: Player = createPlayer();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  enemyShots: EnemyShot[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  floaters: FloatingText[] = [];

  effects = new Effects();
  spawner = new Spawner();

  score = 0;
  bestScore = readBestScore();
  kills = 0;
  /** Kills since the last time the player took damage; drives the multiplier. */
  killStreak = 0;
  elapsed = 0;

  /** Current screen-shake magnitude in pixels. */
  shake = 0;

  private nextId = 1;
  private input: InputSource;

  constructor(input: InputSource) {
    this.input = input;
  }

  get comboMultiplier(): number {
    const step = Math.floor(this.killStreak / SCORE.killsPerComboStep);
    return Math.min(SCORE.maxComboMultiplier, 1 + step);
  }

  start() {
    this.player = createPlayer();
    this.enemies = [];
    this.projectiles = [];
    this.enemyShots = [];
    this.pickups = [];
    this.particles = [];
    this.floaters = [];
    this.effects.reset();
    this.spawner.reset();
    this.score = 0;
    this.kills = 0;
    this.killStreak = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.phase = 'playing';
  }

  update(dt: number) {
    const laneTarget = this.input.consumeLaneTarget();
    const confirm = this.input.consumeConfirm();

    if (this.phase !== 'playing') {
      // A tap sets a lane and confirms at once, so either signal starts a run.
      if (confirm || laneTarget !== null) this.start();
      this.decayFx(dt);
      return;
    }

    this.elapsed += dt;
    if (laneTarget !== null) {
      this.player.lane = clamp(laneTarget, 0, LANE_COUNT - 1) as LaneIndex;
    }

    this.updatePlayer(dt);
    this.fireWeapon(dt);
    this.runSpawner(dt);
    this.moveEntities(dt);
    this.resolveCollisions();
    this.decayFx(dt);
  }

  // ------------------------------------------------------------- player

  private updatePlayer(dt: number) {
    const target = laneCenterX(this.player.lane);
    const speed = (laneCenterX(1) - laneCenterX(0)) / PLAYER.switchTime;
    const delta = target - this.player.x;
    const step = speed * dt;
    this.player.x =
      Math.abs(delta) <= step ? target : this.player.x + Math.sign(delta) * step;

    this.player.invuln = Math.max(0, this.player.invuln - dt);
  }

  private fireWeapon(dt: number) {
    this.player.fireCooldown -= dt;
    if (this.player.fireCooldown > 0) return;

    this.player.fireCooldown += weaponCooldown(this.effects.level('rapid'));

    const pierce = this.effects.isActive('pierce');
    const damage = weaponDamage(this.effects.level('power'));

    this.spawnProjectile(this.player.lane, pierce, damage, this.player.x);

    if (this.effects.isActive('double')) {
      // DUAL covers the lane you are not standing in.
      const other = (this.player.lane === 0 ? 1 : 0) as LaneIndex;
      this.spawnProjectile(other, pierce, damage, laneCenterX(other));
    }

    // Each DRONE level adds a companion shot in your lane, fanned out to the
    // sides so higher levels visibly widen your fire.
    const drones = droneShots(this.effects.level('drone'));
    for (let i = 0; i < drones; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const rank = Math.floor(i / 2) + 1;
      this.spawnProjectile(
        this.player.lane,
        pierce,
        damage,
        this.player.x + side * POWERUP.droneOffsetX * rank,
      );
    }
  }

  private spawnProjectile(
    lane: LaneIndex,
    pierce: boolean,
    damage: number,
    x: number,
  ) {
    this.projectiles.push({
      id: this.nextId++,
      lane,
      x,
      y: PLAYER.y - PLAYER.radius,
      radius: WEAPON.projectileRadius,
      damage,
      pierce,
      hitIds: new Set(),
    });
  }

  // ------------------------------------------------------------ spawning

  private runSpawner(dt: number) {
    const tick = this.spawner.update(dt);

    for (const spawn of tick.enemies) this.addEnemy(spawn);
    for (const spawn of tick.pickups) this.addPickup(spawn);

    if (tick.waveCleared !== null) {
      const bonus = WAVE.clearBonus * tick.waveCleared;
      this.score += bonus;
      this.addFloater(
        laneCenterX(0.5),
        GOAL_LINE_Y - 260,
        `WAVE ${tick.waveCleared} CLEAR  +${bonus}`,
        COLORS.player,
      );
    }

    if (tick.waveStarted !== null) {
      const label = this.spawner.isBossWave
        ? `BOSS WAVE ${tick.waveStarted}`
        : `WAVE ${tick.waveStarted}`;
      this.addFloater(
        laneCenterX(0.5),
        GOAL_LINE_Y - 300,
        label,
        this.spawner.isBossWave ? '#ff2e63' : COLORS.text,
      );
    }
  }

  private addEnemy(spawn: EnemySpawn, atY = SPAWN_Y) {
    const { def, lane, hpMultiplier, speedMultiplier } = spawn;
    const hp = Math.max(1, Math.round(def.hp * hpMultiplier));
    this.enemies.push({
      id: this.nextId++,
      kind: def.kind,
      lane,
      x: laneCenterX(lane),
      y: atY,
      hp,
      maxHp: hp,
      speed: def.speed * speedMultiplier,
      damage: def.damage,
      score: def.score,
      radius: def.radius,
      color: def.color,
      stripsPowerups: def.stripsPowerups ?? false,
      armor: def.armor ?? 0,
      maxArmor: def.armor ?? 0,
      weaveInterval: def.weaveInterval ?? 0,
      weaveTimer: def.weaveInterval ?? 0,
      shootInterval: def.shootInterval ?? 0,
      shootTimer: def.shootInterval ?? 0,
      hitFlash: 0,
      age: 0,
    });
  }

  private addPickup(spawn: PickupSpawn) {
    this.pickups.push({
      id: this.nextId++,
      kind: spawn.def.kind,
      lane: spawn.lane,
      x: laneCenterX(spawn.lane),
      y: SPAWN_Y,
      radius: POWERUP.radius,
      color: spawn.def.color,
      label: spawn.def.label,
      age: 0,
    });
  }

  // -------------------------------------------------------------- motion

  private moveEntities(dt: number) {
    const enemyScale = enemySpeedFactor(this.effects.level('slow'));

    for (const enemy of this.enemies) {
      enemy.y += enemy.speed * enemyScale * dt;
      enemy.age += dt;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

      if (enemy.kind === 'weaver') this.updateWeaver(enemy, dt, enemyScale);
      if (enemy.kind === 'shooter') this.updateShooter(enemy, dt, enemyScale);
    }

    for (const projectile of this.projectiles) {
      projectile.y -= WEAPON.projectileSpeed * dt;
    }
    this.projectiles = this.projectiles.filter((p) => p.y + p.radius > 0);

    for (const shot of this.enemyShots) {
      shot.y += ENEMY_SHOT.speed * enemyScale * dt;
    }
    this.enemyShots = this.enemyShots.filter((s) => s.y - s.radius < GOAL_LINE_Y + 20);

    for (const pickup of this.pickups) {
      pickup.y += POWERUP.speed * dt;
      pickup.age += dt;
    }
    // Missed pickups simply leave the screen; they cost nothing but the chance.
    this.pickups = this.pickups.filter((p) => p.y - p.radius < GOAL_LINE_Y + 60);

    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 420 * dt;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const floater of this.floaters) {
      floater.y -= 34 * dt;
      floater.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  /** Weavers switch lanes on a timer and slide toward the new lane center. */
  private updateWeaver(enemy: Enemy, dt: number, scale: number) {
    enemy.weaveTimer -= dt * scale;
    if (enemy.weaveTimer <= 0) {
      enemy.weaveTimer += enemy.weaveInterval;
      enemy.lane = (enemy.lane === 0 ? 1 : 0) as LaneIndex;
    }

    const target = laneCenterX(enemy.lane);
    const step = WEAVE.slideSpeed * dt;
    const delta = target - enemy.x;
    enemy.x =
      Math.abs(delta) <= step ? target : enemy.x + Math.sign(delta) * step;
  }

  /** Shooters periodically fire a shot straight down their lane. */
  private updateShooter(enemy: Enemy, dt: number, scale: number) {
    if (enemy.y < 0) return;
    enemy.shootTimer -= dt * scale;
    if (enemy.shootTimer > 0) return;
    enemy.shootTimer += enemy.shootInterval;

    this.enemyShots.push({
      id: this.nextId++,
      lane: enemy.lane,
      x: enemy.x,
      y: enemy.y + enemy.radius,
      radius: ENEMY_SHOT.radius,
      damage: ENEMY_SHOT.damage,
    });
  }

  // ---------------------------------------------------------- collisions

  private resolveCollisions() {
    this.resolveProjectileHits();
    this.resolveEnemyShots();
    this.resolvePickups();
    this.resolveEnemyThreats();
  }

  private resolveProjectileHits() {
    const spent = new Set<number>();

    for (const projectile of this.projectiles) {
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0) continue;
        // Hazards cannot be shot; projectiles pass straight through them.
        if (enemy.stripsPowerups) continue;
        if (enemy.lane !== projectile.lane) continue;
        if (projectile.hitIds.has(enemy.id)) continue;
        if (Math.abs(enemy.y - projectile.y) > enemy.radius + projectile.radius) {
          continue;
        }

        enemy.hitFlash = FX.hitFlashTime;
        projectile.hitIds.add(enemy.id);

        if (enemy.armor > 0) {
          // Each hit chips one armor plate; HP is untouchable until it breaks.
          enemy.armor -= 1;
          this.burst(projectile.x, projectile.y, '#e8edf3', 5, 160);
        } else {
          enemy.hp -= projectile.damage;
          this.burst(projectile.x, projectile.y, enemy.color, 4, 140);
          if (enemy.hp <= 0) this.killEnemy(enemy);
        }

        if (!projectile.pierce) {
          spent.add(projectile.id);
          break;
        }
      }
    }

    if (spent.size > 0) {
      this.projectiles = this.projectiles.filter((p) => !spent.has(p.id));
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** Shooter shots hurt the player on contact; dodge them by switching lanes. */
  private resolveEnemyShots() {
    const spent = new Set<number>();

    for (const shot of this.enemyShots) {
      if (shot.lane !== this.player.lane) continue;
      if (Math.abs(shot.y - PLAYER.y) > shot.radius + PLAYER.radius) continue;

      this.damagePlayer(shot.damage);
      this.burst(shot.x, shot.y, ENEMY_SHOT.color, 8, 200);
      spent.add(shot.id);
    }

    if (spent.size > 0) {
      this.enemyShots = this.enemyShots.filter((s) => !spent.has(s.id));
    }
  }

  private killEnemy(enemy: Enemy) {
    this.kills += 1;
    this.killStreak += 1;

    const multiplier = this.comboMultiplier;
    const points = enemy.score * multiplier;
    this.score += points;

    this.burst(enemy.x, enemy.y, enemy.color, FX.particlesPerKill, 260);
    this.shake = Math.min(FX.shakeOnHit, this.shake + FX.shakeOnKill);

    if (multiplier > 1) {
      this.addFloater(enemy.x, enemy.y, `${points}  x${multiplier}`, COLORS.text);
    }

    if (enemy.kind === 'splitter') this.splitEnemy(enemy);
  }

  /** A dying splitter releases runners that continue from where it fell. */
  private splitEnemy(enemy: Enemy) {
    const runner = ENEMY_DEFS.find((d) => d.kind === 'runner');
    if (!runner) return;

    for (let i = 0; i < 2; i += 1) {
      const lane = (i === 0 ? enemy.lane : randInt(0, LANE_COUNT)) as LaneIndex;
      this.addEnemy(
        {
          def: runner,
          lane,
          hpMultiplier: this.spawner.hpMultiplier,
          speedMultiplier: this.spawner.speedMultiplier,
        },
        enemy.y,
      );
    }
  }

  private resolvePickups() {
    const collected: number[] = [];
    // MAG collects from either lane; otherwise you must be in the pickup's lane.
    const magnet = this.effects.isActive('magnet');

    for (const pickup of this.pickups) {
      const dy = Math.abs(pickup.y - PLAYER.y);
      if (dy > pickup.radius + PLAYER.radius) continue;

      if (!magnet) {
        if (pickup.lane !== this.player.lane) continue;
        const dx = Math.abs(pickup.x - this.player.x);
        if (dx > pickup.radius + PLAYER.radius) continue;
      }

      collected.push(pickup.id);
      const instant = this.effects.apply(pickup.kind);
      if (instant.heal > 0) {
        this.player.health = Math.min(
          PLAYER.maxHealth,
          this.player.health + instant.heal,
        );
      }
      if (instant.shieldCharges > 0) {
        this.player.shieldCharges += instant.shieldCharges;
      }
      if (instant.bomb) this.detonateBomb();

      this.burst(pickup.x, pickup.y, pickup.color, 10, 200);
      this.addFloater(pickup.x, pickup.y - 20, pickup.label, pickup.color);
    }

    if (collected.length > 0) {
      const taken = new Set(collected);
      this.pickups = this.pickups.filter((p) => !taken.has(p.id));
    }
  }

  /** BOMB vaporizes every regular enemy on screen; hazards are immune. */
  private detonateBomb() {
    this.shake = FX.shakeOnHit * 1.4;
    const multiplier = this.comboMultiplier;

    for (const enemy of this.enemies) {
      if (enemy.stripsPowerups) continue;
      this.kills += 1;
      this.killStreak += 1;
      this.score += enemy.score * multiplier;
      this.burst(enemy.x, enemy.y, enemy.color, FX.particlesPerKill, 300);
    }

    // Hazards survive; every regular enemy and all incoming shots are cleared.
    this.enemies = this.enemies.filter((e) => e.stripsPowerups);
    this.enemyShots = [];
  }

  /** Enemies that reach the player or cross the goal line cost health. */
  private resolveEnemyThreats() {
    const removed = new Set<number>();

    for (const enemy of this.enemies) {
      const hitsPlayer =
        enemy.lane === this.player.lane &&
        Math.abs(enemy.y - PLAYER.y) < enemy.radius + PLAYER.radius;
      const breachedGoal = enemy.y - enemy.radius > GOAL_LINE_Y;

      if (enemy.stripsPowerups) {
        // A hazard only matters on direct contact. Reaching the goal in the
        // other lane means you dodged it, so it simply leaves.
        if (hitsPlayer) {
          this.stripPlayer(enemy);
          removed.add(enemy.id);
        } else if (breachedGoal) {
          removed.add(enemy.id);
        }
        continue;
      }

      if (hitsPlayer || breachedGoal) {
        this.damagePlayer(enemy.damage);
        this.burst(enemy.x, enemy.y, enemy.color, 8, 200);
        removed.add(enemy.id);
      }
    }

    if (removed.size > 0) {
      this.enemies = this.enemies.filter((e) => !removed.has(e.id));
    }
  }

  /** A hazard reaching the player wipes their buffs, unless a shield absorbs it. */
  private stripPlayer(source: Enemy) {
    if (this.player.shieldCharges > 0) {
      this.player.shieldCharges -= 1;
      this.addFloater(this.player.x, PLAYER.y - 34, 'BLOCKED', COLORS.shield);
      this.burst(source.x, source.y, COLORS.shield, 12, 220);
      return;
    }

    const lost = this.effects.stripAll();
    this.shake = FX.shakeOnHit;
    this.burst(this.player.x, PLAYER.y, source.color, 18, 260);
    this.addFloater(
      this.player.x,
      PLAYER.y - 34,
      lost > 0 ? 'DAMPENED!' : 'DAMPENER',
      source.color,
    );
  }

  private damagePlayer(amount: number) {
    if (this.player.invuln > 0) return;

    this.player.invuln = PLAYER.invulnTime;
    this.shake = FX.shakeOnHit;
    this.killStreak = 0;

    if (this.player.shieldCharges > 0) {
      this.player.shieldCharges -= 1;
      this.addFloater(this.player.x, PLAYER.y - 34, 'BLOCKED', COLORS.shield);
      return;
    }

    this.player.health -= amount;
    this.addFloater(this.player.x, PLAYER.y - 34, `-${amount}`, COLORS.health);

    if (this.player.health <= 0) {
      this.player.health = 0;
      this.endRun();
    }
  }

  private endRun() {
    this.phase = 'gameover';
    this.burst(this.player.x, PLAYER.y, COLORS.player, 30, 320);
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      writeBestScore(this.bestScore);
    }
  }

  // ------------------------------------------------------------------ fx

  private decayFx(dt: number) {
    this.shake = Math.max(0, this.shake - FX.shakeDecay * dt);
    if (this.phase !== 'playing') {
      // Keep explosions and text alive on the game-over screen.
      this.moveEntities(dt);
    }
  }

  private burst(x: number, y: number, color: string, count: number, speed: number) {
    for (let i = 0; i < count; i += 1) {
      const angle = randRange(0, Math.PI * 2);
      const magnitude = randRange(speed * 0.3, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * magnitude,
        vy: Math.sin(angle) * magnitude,
        life: FX.particleLife,
        maxLife: FX.particleLife,
        radius: randRange(2, 4.5),
        color,
      });
    }
  }

  private addFloater(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x, y, text, life: 1.1, maxLife: 1.1, color });
  }
}

function createPlayer(): Player {
  return {
    lane: 0,
    x: laneCenterX(0),
    health: PLAYER.maxHealth,
    shieldCharges: 0,
    invuln: 0,
    fireCooldown: 0,
  };
}

function readBestScore(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBestScore(value: number) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(value));
  } catch {
    // Private browsing blocks storage; the score just will not persist.
  }
}
