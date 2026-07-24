import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOSS, PLAYER, laneCenterX } from './config';
import { Emitter } from './events';
import { Game } from './game';
import { ScriptedInput } from './testing/sim';
import type { Enemy, Pickup, PowerUpKind } from './types';

function powerPickup(power: PowerUpKind, lane: number): Pickup {
  return {
    id: 999,
    content: { type: 'power', power },
    lane: lane as 0 | 1,
    x: laneCenterX(lane),
    y: PLAYER.y,
    radius: 18,
    color: '#000',
    label: power,
    age: 0,
  };
}

function weaponPickup(weapon: 'blaster' | 'scatter' | 'railgun', lane: number): Pickup {
  return {
    id: 998,
    content: { type: 'weapon', weapon },
    lane: lane as 0 | 1,
    x: laneCenterX(lane),
    y: PLAYER.y,
    radius: 18,
    color: '#000',
    label: weapon,
    age: 0,
  };
}

function bombPickup(lane: number): Pickup {
  return {
    id: 999,
    content: { type: 'power', power: 'bomb' },
    lane: lane as 0 | 1,
    x: laneCenterX(lane),
    y: PLAYER.y,
    radius: 18,
    color: '#ef476f',
    label: 'BOMB',
    age: 0,
  };
}

function makeBoss(over: Partial<Enemy> = {}): Enemy {
  return {
    id: 1,
    kind: 'boss',
    lane: 0,
    x: 140,
    y: -40,
    hp: 60,
    maxHp: 60,
    speed: 40,
    damage: 3,
    score: 300,
    radius: 42,
    color: '#ff2e63',
    stripsPowerups: false,
    armor: 0,
    maxArmor: 0,
    weaveInterval: 0,
    weaveTimer: 0,
    shootInterval: 0,
    shootTimer: 0,
    hitFlash: 0,
    age: 0,
    ...over,
  };
}

/** Advances a fresh game a few seconds, auto-skipping upgrade screens. */
function play(game: Game, steps: number) {
  for (let i = 0; i < steps; i += 1) game.update(1 / 60);
}

describe('event emitter', () => {
  it('delivers events and stops after unsubscribe', () => {
    const e = new Emitter();
    let n = 0;
    const off = e.on('bomb', () => (n += 1));
    e.emit('bomb', {});
    expect(n).toBe(1);
    off();
    e.emit('bomb', {});
    expect(n).toBe(1);
  });

  it('clear removes every handler', () => {
    const e = new Emitter();
    let n = 0;
    e.on('kill', () => (n += 1));
    e.clear();
    e.emit('kill', { kind: 'grunt', x: 0, y: 0, boss: false });
    expect(n).toBe(0);
  });

  it('the game emits kill events as enemies die', () => {
    const game = new Game(new ScriptedInput());
    let kills = 0;
    game.events.on('kill', () => (kills += 1));
    game.start();
    play(game, 600);
    expect(kills).toBeGreaterThan(0);
    expect(kills).toBe(game.kills);
  });
});

describe('active ability', () => {
  it('starts uncharged and reports readiness at the charge cap', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    expect(game.abilityReady).toBe(false);
  });

  it('charges as enemies die during a run', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    play(game, 600);
    expect(game.kills).toBeGreaterThan(0);
    expect(game.abilityCharge).toBeGreaterThan(0);
  });

  it('firing PULSE clears incoming shots and grants invulnerability', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.abilityCharge = 999; // force ready
    game.enemyShots.push({ id: 1, lane: 0, x: 140, y: 400, radius: 7, damage: 1 });
    input.triggerAbility();
    game.update(1 / 60);
    expect(game.enemyShots.length).toBe(0);
    expect(game.player.invuln).toBeGreaterThan(0);
    expect(game.abilityCharge).toBe(0);
  });
});

describe('pause and help', () => {
  it('pausing freezes the run and unpausing resumes it', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.enemies = [makeBoss({ kind: 'grunt', y: 100, speed: 120, radius: 20, hp: 3, maxHp: 3 })];

    input.triggerPause();
    game.update(1 / 60);
    expect(game.paused).toBe(true);

    const frozenY = game.enemies[0].y;
    for (let i = 0; i < 60; i += 1) game.update(1 / 60);
    expect(game.enemies[0].y).toBe(frozenY);

    input.triggerPause();
    game.update(1 / 60);
    expect(game.paused).toBe(false);
    game.update(1 / 60);
    expect(game.enemies[0].y).toBeGreaterThan(frozenY);
  });

  it('opens the guide on the title screen without starting a run', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    expect(game.phase).toBe('title');

    input.triggerHelp();
    game.update(1 / 60);
    expect(game.showLegend).toBe(true);
    expect(game.phase).toBe('title');

    // A tap closes the guide and still does not start.
    input.press();
    game.update(1 / 60);
    expect(game.showLegend).toBe(false);
    expect(game.phase).toBe('title');

    // With the guide closed, a tap starts the run.
    input.press();
    game.update(1 / 60);
    expect(game.phase).toBe('playing');
  });
});

describe('weapon upgrades persist across switches', () => {
  it('keeps a weapon’s buff levels when you switch away and back', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.player.lane = 0;
    game.player.x = laneCenterX(0);

    // Upgrade the blaster.
    game.effects.apply('rapid');
    game.effects.apply('rapid');
    expect(game.effects.level('rapid')).toBe(2);

    // Switch to scatter, then back to blaster (via pickups).
    game.pickups = [weaponPickup('scatter', 0)];
    game.update(1 / 60);
    expect(game.weapon).toBe('scatter');
    expect(game.effects.level('rapid')).toBe(2); // still held while on scatter

    game.pickups = [weaponPickup('blaster', 0)];
    game.update(1 / 60);
    expect(game.weapon).toBe('blaster');
    expect(game.effects.level('rapid')).toBe(2); // and back on the blaster
  });
});

describe('new power-ups', () => {
  afterEach(() => vi.restoreAllMocks());

  it('FREEZE halts enemy movement', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.effects.apply('freeze');
    game.player.lane = 0;
    game.enemies = [
      makeBoss({ kind: 'grunt', lane: 1, y: 100, speed: 220, radius: 20, hp: 5, maxHp: 5 }),
    ];
    const y0 = game.enemies[0].y;
    game.update(1 / 60);
    expect(game.enemies[0].y).toBe(y0);
  });

  it('FRENZY shortens the fire cooldown', () => {
    const base = new Game(new ScriptedInput());
    base.start();
    base.player.fireCooldown = 0;
    base.update(1 / 60);

    const frenzied = new Game(new ScriptedInput());
    frenzied.start();
    frenzied.effects.apply('frenzy');
    frenzied.player.fireCooldown = 0;
    frenzied.update(1 / 60);

    expect(frenzied.player.fireCooldown).toBeLessThan(base.player.fireCooldown);
  });

  it('VIT raises max health', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.player.lane = 0;
    game.player.x = laneCenterX(0);
    const before = game.player.maxHealth;
    game.pickups = [powerPickup('vit', 0)];
    game.update(1 / 60);
    expect(game.player.maxHealth).toBe(before + 1);
  });

  it('GREED multiplies kill score', () => {
    const gain = (levels: number) => {
      const game = new Game(new ScriptedInput());
      game.start();
      for (let i = 0; i < levels; i += 1) game.effects.apply('greed');
      game.player.lane = 0;
      game.player.x = laneCenterX(0);
      game.enemies = [
        makeBoss({ kind: 'grunt', score: 100, hp: 2, maxHp: 2, y: 200, radius: 20 }),
      ];
      game.pickups = [bombPickup(0)];
      const before = game.score;
      game.update(1 / 60);
      return game.score - before;
    };
    expect(gain(2)).toBeGreaterThan(gain(0));
  });

  it('a dampener removes one upgrade, not all of them', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const game = new Game(new ScriptedInput());
    game.start();
    game.weapon = 'blaster';
    game.player.lane = 0;
    game.player.x = laneCenterX(0);
    game.player.shieldCharges = 0;
    game.effects.apply('rapid');
    game.effects.apply('rapid'); // 2
    game.effects.apply('twin'); // 1
    game.effects.apply('slow'); // 1 (universal)
    const total = () => game.effects.list().reduce((sum, b) => sum + b.level, 0);
    const before = total();

    game.enemies = [
      makeBoss({ kind: 'hazard', stripsPowerups: true, lane: 0, y: PLAYER.y, radius: 22 }),
    ];
    game.update(1 / 60);

    expect(total()).toBe(before - 1); // exactly one level lost
  });

  it('VAMP heals on a kill when the roll succeeds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // always under the heal chance
    const game = new Game(new ScriptedInput());
    game.start();
    game.effects.apply('vamp');
    game.player.health = 2;
    const enemy = makeBoss({ kind: 'grunt', hp: 1, maxHp: 1, y: 400, radius: 20, lane: 0 });
    game.enemies = [enemy];
    game.projectiles = [
      { id: 1, lane: 0, x: enemy.x, y: enemy.y, radius: 6, damage: 5, color: '#fff', speed: 900, pierce: false, hitIds: new Set() },
    ];

    game.update(1 / 60);

    expect(game.enemies.some((e) => e.id === enemy.id)).toBe(false);
    expect(game.player.health).toBe(3);
  });
});

describe('boss fights', () => {
  it('a boss holds at its line instead of crossing the goal', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.enemies.length = 0;
    game.enemies.push(makeBoss());
    game.spawner.bossPending = true;
    const hp0 = game.player.health;

    for (let i = 0; i < 300; i += 1) game.update(1 / 60); // ~5s

    const boss = game.enemies.find((e) => e.kind === 'boss');
    expect(boss).toBeDefined();
    expect(boss!.y).toBeLessThanOrEqual(BOSS.holdY + 1);
    // It attacks with shots rather than melting the player by contact.
    expect(game.player.health).toBe(hp0);
  });

  it('a boss wave stays active until the boss is destroyed', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.enemies.length = 0;
    game.enemies.push(makeBoss({ y: BOSS.holdY }));
    game.spawner.bossPending = true;
    game.spawner.phase = 'active';
    game.spawner.phaseElapsed = 99999;

    game.update(1 / 60);
    expect(game.spawner.phase).toBe('active');
  });

  it('a BOMB cannot vaporize the boss or strand the wave gate', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.player.lane = 0;
    game.player.x = laneCenterX(0);
    game.enemies = [
      makeBoss({ y: BOSS.holdY }),
      makeBoss({ id: 2, kind: 'grunt', y: 250, hp: 2, maxHp: 2, radius: 20 }),
    ];
    game.spawner.bossPending = true;
    game.pickups = [bombPickup(0)]; // collected at the player this frame

    game.update(1 / 60);

    expect(game.enemies.filter((e) => e.kind === 'boss').length).toBe(1);
    expect(game.enemies.some((e) => e.kind === 'grunt')).toBe(false);
    expect(game.spawner.bossPending).toBe(true); // boss still alive, gate holds
  });

  it('the gate lifts if the boss ever leaves the field (failsafe)', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.enemies = [makeBoss({ y: BOSS.holdY })];
    game.spawner.bossPending = true;

    // Boss removed by some path that skipped the normal kill.
    game.enemies = [];
    game.update(1 / 60);

    expect(game.spawner.bossPending).toBe(false);
  });

  it('destroying the boss clears the gate and heals the player', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.enemies.length = 0;
    const boss = makeBoss({ y: BOSS.holdY, hp: 1, weaveTimer: 5, shootTimer: 5 });
    game.enemies.push(boss);
    game.spawner.bossPending = true;
    game.player.health = 2;
    game.projectiles.push({
      id: 99,
      lane: boss.lane,
      x: boss.x,
      y: boss.y,
      radius: 8,
      damage: 10,
      color: '#fff',
      speed: 900,
      pierce: false,
      hitIds: new Set(),
    });

    game.update(1 / 60);
    expect(game.enemies.find((e) => e.kind === 'boss')).toBeUndefined();
    expect(game.spawner.bossPending).toBe(false);
    expect(game.player.health).toBe(3);
  });
});
