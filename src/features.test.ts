import { describe, expect, it } from 'vitest';
import { BOSS } from './config';
import { Emitter } from './events';
import { Game } from './game';
import { ScriptedInput } from './testing/sim';
import type { Enemy } from './types';

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
  for (let i = 0; i < steps; i += 1) {
    game.update(1 / 60);
    if (game.phase === 'choosing') {
      game.offers = [];
      game.phase = 'playing';
    }
  }
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

describe('roguelite upgrade choice', () => {
  it('offers a distinct choice of upgrades after a wave clears', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.spawner.phaseElapsed = 999; // force the active phase to end
    game.update(1 / 60);

    expect(game.phase).toBe('choosing');
    expect(game.offers.length).toBeGreaterThan(0);
    expect(game.offers.length).toBeLessThanOrEqual(3);
    const keys = new Set(game.offers.map((o) => o.key));
    expect(keys.size).toBe(game.offers.length);
  });

  it('picking an offer applies it and resumes play', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.spawner.phaseElapsed = 999;
    game.update(1 / 60);
    expect(game.phase).toBe('choosing');

    input.setPointer(0.5); // tap the middle card
    game.update(1 / 60);
    expect(game.phase).toBe('playing');
    expect(game.offers.length).toBe(0);
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
    expect(game.phase).not.toBe('choosing');
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
