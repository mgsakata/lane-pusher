import { describe, expect, it } from 'vitest';
import { Emitter } from './events';
import { Game } from './game';
import { ScriptedInput } from './testing/sim';

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
