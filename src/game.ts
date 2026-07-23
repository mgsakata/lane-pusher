import {
  ABILITY,
  BOSS,
  COLORS,
  ENEMY_DEFS,
  ENEMY_SHOT,
  FX,
  GOAL_LINE_Y,
  LANE_COUNT,
  PLAYER,
  POWERUP,
  SCATTER_PELLET_SPACING,
  SCORE,
  SPAWN_Y,
  STARTING_WEAPON,
  UNIVERSAL_DROPS,
  WAVE,
  WEAPON_DEFS,
  WEAVE,
  laneCenterX,
} from './config';
import {
  enemySpeedFactor,
  fireCooldown,
  lanesFired,
  pelletsPerLane,
  projectileDamage,
} from './balance';
import { Emitter } from './events';
import type { InputSource } from './input';
import { Effects, defFor } from './powerups';
import { Spawner, type EnemySpawn } from './spawner';
import type {
  Enemy,
  EnemyShot,
  FloatingText,
  LaneIndex,
  Particle,
  Phase,
  Pickup,
  PickupContent,
  Projectile,
  WeaponKind,
} from './types';
import { clamp, randRange, randInt, pickWeighted } from './util';

const BEST_SCORE_KEY = 'lane-pusher.bestScore';

export interface Player {
  lane: LaneIndex;
  /** Rendered x, which slides toward the target lane center. */
  x: number;
  health: number;
  maxHealth: number;
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
  /** Gameplay event bus for sound and visual feedback to subscribe to. */
  events = new Emitter();

  /** The active weapon; switched by weapon pickups. */
  weapon: WeaponKind = STARTING_WEAPON;

  /** Active-ability charge, filled by kills; ready at ABILITY.maxCharge. */
  abilityCharge = 0;

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
    this.weapon = STARTING_WEAPON;
    this.abilityCharge = 0;
    this.score = 0;
    this.kills = 0;
    this.killStreak = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.phase = 'playing';
    this.events.emit('gameStart', {});
  }

  get abilityReady(): boolean {
    return this.abilityCharge >= ABILITY.maxCharge;
  }

  update(dt: number) {
    // Drain every input each frame; route by phase below.
    const laneTarget = this.input.consumeLaneTarget();
    const confirm = this.input.consumeConfirm();
    const ability = this.input.consumeAbility();

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
    if (ability) this.useAbility();

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

  private get levels() {
    return this.effects.levelMap();
  }

  private fireWeapon(dt: number) {
    this.player.fireCooldown -= dt;
    if (this.player.fireCooldown > 0) return;

    const def = WEAPON_DEFS[this.weapon];
    const levels = this.levels;
    this.player.fireCooldown += fireCooldown(this.weapon, levels);
    this.events.emit('fire', { weapon: this.weapon });

    const damage = projectileDamage(this.weapon, levels);
    const pellets = pelletsPerLane(this.weapon, levels);

    // Which lanes this shot covers. The player's lane is always first; scatter
    // (and TWIN blaster) also cover the other lane.
    const other = (this.player.lane === 0 ? 1 : 0) as LaneIndex;
    const lanes: LaneIndex[] =
      lanesFired(this.weapon, levels) === 2
        ? [this.player.lane, other]
        : [this.player.lane];

    for (const lane of lanes) {
      const centerX = lane === this.player.lane ? this.player.x : laneCenterX(lane);
      // Fan multiple pellets around the lane center; a single shot sits dead center.
      const start = -((pellets - 1) / 2);
      for (let i = 0; i < pellets; i += 1) {
        const offset = (start + i) * SCATTER_PELLET_SPACING;
        this.spawnProjectile(lane, centerX + offset, damage, def);
      }
    }
  }

  private spawnProjectile(
    lane: LaneIndex,
    x: number,
    damage: number,
    def: (typeof WEAPON_DEFS)[WeaponKind],
  ) {
    this.projectiles.push({
      id: this.nextId++,
      lane,
      x,
      y: PLAYER.y - PLAYER.radius,
      radius: def.projectileRadius,
      damage,
      color: def.color,
      speed: def.projectileSpeed,
      pierce: def.pierce,
      hitIds: new Set(),
    });
  }

  // ------------------------------------------------------------ spawning

  private runSpawner(dt: number) {
    const tick = this.spawner.update(dt);

    for (const spawn of tick.enemies) this.addEnemy(spawn);
    for (const lane of tick.pickupLanes) {
      this.addPickup(this.choosePickupContent(), lane);
    }

    if (tick.waveCleared !== null) {
      const bonus = WAVE.clearBonus * tick.waveCleared;
      this.score += bonus;
      this.addFloater(
        laneCenterX(0.5),
        GOAL_LINE_Y - 260,
        `WAVE ${tick.waveCleared} CLEAR  +${bonus}`,
        COLORS.player,
      );
      this.events.emit('waveClear', { wave: tick.waveCleared });
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
      this.events.emit('waveStart', {
        wave: tick.waveStarted,
        boss: this.spawner.isBossWave,
      });
    }
  }

  // ------------------------------------------------------------- ability

  private chargeAbility() {
    this.abilityCharge = Math.min(ABILITY.maxCharge, this.abilityCharge + 1);
  }

  /** PULSE: clear incoming shots, damage every enemy, and grant i-frames. */
  private useAbility() {
    if (!this.abilityReady) return;
    this.abilityCharge = 0;
    this.player.invuln = Math.max(this.player.invuln, ABILITY.invuln);
    this.shake = FX.shakeOnHit * 1.5;
    this.enemyShots = [];

    const multiplier = this.comboMultiplier;
    for (const enemy of this.enemies) {
      if (enemy.stripsPowerups) continue;
      enemy.armor = 0;
      enemy.hp -= ABILITY.damage;
      this.burst(enemy.x, enemy.y, ABILITY.color, 6, 220);
      if (enemy.hp <= 0) {
        this.kills += 1;
        this.killStreak += 1;
        this.score += enemy.score * multiplier;
        this.burst(enemy.x, enemy.y, enemy.color, FX.particlesPerKill, 300);
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0 || e.stripsPowerups);
    this.addFloater(this.player.x, PLAYER.y - 40, `${ABILITY.name}!`, ABILITY.color);
    this.events.emit('ability', {});
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

  private addPickup(content: PickupContent, lane: LaneIndex) {
    const { color, label } = pickupDisplay(content);
    this.pickups.push({
      id: this.nextId++,
      content,
      lane,
      x: laneCenterX(lane),
      y: SPAWN_Y,
      radius: POWERUP.radius,
      color,
      label,
      age: 0,
    });
  }

  /**
   * Chooses what a pickup grants: a buff for the current weapon, a universal
   * buff/instant, or a switch to one of the other weapons.
   */
  private choosePickupContent(): PickupContent {
    const entries: Array<{ content: PickupContent; weight: number }> = [];

    for (const kind of WEAPON_DEFS[this.weapon].buffs) {
      entries.push({ content: { type: 'power', power: kind }, weight: defFor(kind).weight });
    }
    for (const kind of UNIVERSAL_DROPS) {
      entries.push({ content: { type: 'power', power: kind }, weight: defFor(kind).weight });
    }
    for (const def of Object.values(WEAPON_DEFS)) {
      if (def.kind === this.weapon) continue;
      entries.push({ content: { type: 'weapon', weapon: def.kind }, weight: def.switchWeight });
    }

    const chosen = pickWeighted(entries, (e) => e.weight);
    return chosen ? chosen.content : { type: 'power', power: 'slow' };
  }

  // -------------------------------------------------------------- motion

  private moveEntities(dt: number) {
    const enemyScale = enemySpeedFactor(this.effects.level('slow'));

    for (const enemy of this.enemies) {
      enemy.age += dt;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

      if (enemy.kind === 'boss') {
        this.updateBoss(enemy, dt, enemyScale);
        continue;
      }

      enemy.y += enemy.speed * enemyScale * dt;
      if (enemy.kind === 'weaver') this.updateWeaver(enemy, dt, enemyScale);
      if (enemy.kind === 'shooter') this.updateShooter(enemy, dt, enemyScale);
    }

    for (const projectile of this.projectiles) {
      projectile.y -= projectile.speed * dt;
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
    this.events.emit('enemyFire', { lane: enemy.lane });
  }

  /**
   * A boss descends to its hold line, then attacks instead of crossing the
   * goal: it switches lanes and fires shot bursts, enraging below half health.
   */
  private updateBoss(boss: Enemy, dt: number, scale: number) {
    if (boss.y < BOSS.holdY) {
      boss.y += BOSS.descendSpeed * scale * dt;
      return;
    }
    boss.y = BOSS.holdY;

    const enraged = boss.hp <= boss.maxHp * BOSS.enrageAt;

    boss.weaveTimer -= dt * scale;
    if (boss.weaveTimer <= 0) {
      boss.weaveTimer += enraged ? BOSS.weaveIntervalEnraged : BOSS.weaveInterval;
      boss.lane = (boss.lane === 0 ? 1 : 0) as LaneIndex;
    }
    const target = laneCenterX(boss.lane);
    const step = WEAVE.slideSpeed * dt;
    const delta = target - boss.x;
    boss.x = Math.abs(delta) <= step ? target : boss.x + Math.sign(delta) * step;

    boss.shootTimer -= dt * scale;
    if (boss.shootTimer <= 0) {
      boss.shootTimer += enraged ? BOSS.fireIntervalEnraged : BOSS.fireInterval;
      // Enraged, the boss fires down both lanes at once.
      const lanes: LaneIndex[] = enraged ? [0, 1] : [boss.lane];
      for (const lane of lanes) {
        this.enemyShots.push({
          id: this.nextId++,
          lane,
          x: laneCenterX(lane),
          y: boss.y + boss.radius,
          radius: BOSS.shotRadius,
          damage: BOSS.shotDamage,
        });
        this.events.emit('enemyFire', { lane });
      }
    }
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
    this.chargeAbility();

    const multiplier = this.comboMultiplier;
    const points = enemy.score * multiplier;
    this.score += points;

    this.burst(enemy.x, enemy.y, enemy.color, FX.particlesPerKill, 260);
    this.shake = Math.min(FX.shakeOnHit, this.shake + FX.shakeOnKill);

    if (multiplier > 1) {
      this.addFloater(enemy.x, enemy.y, `${points}  x${multiplier}`, COLORS.text);
    }

    this.events.emit('kill', {
      kind: enemy.kind,
      x: enemy.x,
      y: enemy.y,
      boss: enemy.kind === 'boss',
    });

    if (enemy.kind === 'splitter') this.splitEnemy(enemy);
    if (enemy.kind === 'boss') this.defeatBoss(enemy);
  }

  /** Clearing the boss ends the boss wave, drops its shots, and rewards a heal. */
  private defeatBoss(boss: Enemy) {
    this.spawner.bossPending = false;
    this.enemyShots = [];
    this.shake = FX.shakeOnHit * 1.6;
    this.burst(boss.x, boss.y, boss.color, 40, 360);
    this.player.health = Math.min(this.player.maxHealth, this.player.health + 1);
    this.addFloater(laneCenterX(0.5), BOSS.holdY, 'BOSS DOWN', boss.color);
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

    for (const pickup of this.pickups) {
      if (pickup.lane !== this.player.lane) continue;
      const dy = Math.abs(pickup.y - PLAYER.y);
      const dx = Math.abs(pickup.x - this.player.x);
      if (dy > pickup.radius + PLAYER.radius) continue;
      if (dx > pickup.radius + PLAYER.radius) continue;

      collected.push(pickup.id);
      this.collectPickup(pickup);
      this.burst(pickup.x, pickup.y, pickup.color, 10, 200);
      this.addFloater(pickup.x, pickup.y - 20, pickup.label, pickup.color);
    }

    if (collected.length > 0) {
      const taken = new Set(collected);
      this.pickups = this.pickups.filter((p) => !taken.has(p.id));
    }
  }

  private collectPickup(pickup: Pickup) {
    const { content } = pickup;
    this.events.emit('pickup', { content });
    if (content.type === 'weapon') {
      this.weapon = content.weapon;
      this.events.emit('weaponSwitch', { weapon: content.weapon });
      return;
    }

    const instant = this.effects.apply(content.power);
    if (defFor(content.power).type === 'buff') {
      this.events.emit('buffUp', {
        kind: content.power,
        level: this.effects.level(content.power),
      });
    }
    if (instant.heal > 0) {
      this.player.health = Math.min(
        this.player.maxHealth,
        this.player.health + instant.heal,
      );
    }
    if (instant.shieldCharges > 0) {
      this.player.shieldCharges += instant.shieldCharges;
    }
    if (instant.bomb) this.detonateBomb();
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
    this.events.emit('bomb', {});
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
      this.events.emit('shieldBlock', {});
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
    this.events.emit('dampened', { lost });
  }

  private damagePlayer(amount: number) {
    if (this.player.invuln > 0) return;

    this.player.invuln = PLAYER.invulnTime;
    this.shake = FX.shakeOnHit;
    this.killStreak = 0;

    if (this.player.shieldCharges > 0) {
      this.player.shieldCharges -= 1;
      this.addFloater(this.player.x, PLAYER.y - 34, 'BLOCKED', COLORS.shield);
      this.events.emit('shieldBlock', {});
      return;
    }

    this.player.health -= amount;
    this.addFloater(this.player.x, PLAYER.y - 34, `-${amount}`, COLORS.health);
    this.events.emit('playerHit', { amount });

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
    this.events.emit('gameOver', { score: this.score, wave: this.spawner.wave });
  }

  // ------------------------------------------------------------------ fx

  private decayFx(dt: number) {
    this.shake = Math.max(0, this.shake - FX.shakeDecay * dt);
    if (this.phase === 'gameover') {
      // Keep explosions and text alive on the game-over screen only; the
      // upgrade-choice screen stays fully frozen in the background.
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

/** The label and color a pickup shows, derived from what it grants. */
function pickupDisplay(content: PickupContent): { color: string; label: string } {
  if (content.type === 'weapon') {
    const def = WEAPON_DEFS[content.weapon];
    return { color: def.color, label: def.name };
  }
  const def = defFor(content.power);
  return { color: def.color, label: def.label };
}

function createPlayer(): Player {
  return {
    lane: 0,
    x: laneCenterX(0),
    health: PLAYER.maxHealth,
    maxHealth: PLAYER.maxHealth,
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
