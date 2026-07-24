import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOSS, DASHER, PHANTOM, PLAYER, laneCenterX } from './config';
import { Emitter } from './events';
import { Game } from './game';
import { ScriptedInput } from './testing/sim';
import type { AbilityKind, Enemy, Pickup, PowerUpKind } from './types';

function abilityPickup(ability: AbilityKind, lane: number): Pickup {
  return {
    id: 997,
    content: { type: 'ability', ability },
    lane: lane as 0 | 1,
    x: laneCenterX(lane),
    y: PLAYER.y,
    radius: 18,
    color: '#000',
    label: ability,
    age: 0,
  };
}

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
    stripsAll: false,
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

  it('a dampener strips one whole upgrade, not the whole loadout', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // picks the first held candidate
    const game = new Game(new ScriptedInput());
    game.start();
    game.weapon = 'blaster';
    game.player.lane = 0;
    game.player.x = laneCenterX(0);
    game.player.shieldCharges = 0;
    game.effects.apply('rapid');
    game.effects.apply('rapid'); // RAPID level 2
    game.effects.apply('twin');
    game.effects.apply('slow');
    const kinds = () => game.effects.list().length;
    const before = kinds();

    game.enemies = [
      makeBoss({ kind: 'hazard', stripsPowerups: true, lane: 0, y: PLAYER.y, radius: 22 }),
    ];
    game.update(1 / 60);

    expect(kinds()).toBe(before - 1); // exactly one buff type removed
    expect(game.effects.level('rapid')).toBe(0); // the whole RAPID stack, not one level
  });

  it('a dampener never strips buffs of a weapon you are not holding', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.weapon = 'blaster';
    // Scatter/railgun buffs are held but inactive; blaster + universal are active.
    game.effects.apply('spread');
    game.effects.apply('spread'); // scatter, level 2
    game.effects.apply('overload'); // railgun
    game.effects.apply('rapid'); // blaster
    game.effects.apply('slow'); // universal

    // Take a dampener hit repeatedly — enough to strip every strippable buff.
    for (let i = 0; i < 12; i += 1) {
      game.player.lane = 0;
      game.player.x = laneCenterX(0);
      game.player.shieldCharges = 0;
      game.enemies = [
        makeBoss({ kind: 'hazard', stripsPowerups: true, lane: 0, y: PLAYER.y, radius: 22 }),
      ];
      game.update(1 / 60);
    }

    // Inactive weapons' buffs are untouched no matter how many hits land.
    expect(game.effects.level('spread')).toBe(2);
    expect(game.effects.level('overload')).toBe(1);
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

describe('dodge', () => {
  it('double-tapping your current lane grants brief i-frames', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.player.lane = 0;
    expect(game.player.dodgeTimer).toBe(0);

    input.triggerDodge(0); // double-tap the lane we already occupy
    game.update(1 / 60);
    expect(game.player.dodgeTimer).toBeGreaterThan(0);
  });

  it('a dodge does not trigger for the lane you are not in', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.player.lane = 0;
    input.triggerDodge(1); // that would just be a lane switch, not a dodge
    game.update(1 / 60);
    expect(game.player.dodgeTimer).toBe(0);
  });

  it('a dodging player takes no damage from a colliding enemy', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.player.lane = 0;
    game.player.x = laneCenterX(0);
    const hp0 = game.player.health;

    input.triggerDodge(0);
    game.enemies = [
      makeBoss({ kind: 'grunt', lane: 0, y: PLAYER.y, radius: 20, hp: 5, maxHp: 5, damage: 3 }),
    ];
    game.update(1 / 60);
    expect(game.player.health).toBe(hp0);
  });

  it('a dodging player slips past a dampener without losing a buff', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.player.lane = 0;
    game.player.x = laneCenterX(0);
    game.effects.apply('rapid');
    game.effects.apply('slow');
    const before = game.effects.list().length;

    input.triggerDodge(0);
    game.enemies = [
      makeBoss({ kind: 'hazard', stripsPowerups: true, lane: 0, y: PLAYER.y, radius: 22 }),
    ];
    game.update(1 / 60);
    expect(game.effects.list().length).toBe(before); // nothing stripped
  });

  it('respects its cooldown — no second dodge back-to-back', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.player.lane = 0;

    input.triggerDodge(0);
    game.update(1 / 60);
    // Let the active window lapse but stay inside the cooldown.
    for (let i = 0; i < 40; i += 1) game.update(1 / 60);
    expect(game.player.dodgeTimer).toBe(0);
    expect(game.player.dodgeCooldown).toBeGreaterThan(0);

    input.triggerDodge(0);
    game.update(1 / 60);
    expect(game.player.dodgeTimer).toBe(0); // still cooling down
  });
});

describe('super dampener', () => {
  it('wipes every held buff on contact, not just one', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.weapon = 'blaster';
    game.player.lane = 0;
    game.player.x = laneCenterX(0);
    game.player.shieldCharges = 0;
    game.effects.apply('rapid');
    game.effects.apply('twin');
    game.effects.apply('slow');
    game.effects.apply('greed');
    expect(game.effects.list().length).toBe(4);

    game.enemies = [
      makeBoss({
        kind: 'superdampener',
        stripsPowerups: true,
        stripsAll: true,
        lane: 0,
        y: PLAYER.y,
        radius: 26,
      }),
    ];
    game.update(1 / 60);
    expect(game.effects.list().length).toBe(0); // everything gone
  });

  it('is blocked entirely by a shield charge', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    game.player.lane = 0;
    game.player.x = laneCenterX(0);
    game.player.shieldCharges = 1;
    game.effects.apply('rapid');
    game.effects.apply('slow');

    game.enemies = [
      makeBoss({
        kind: 'superdampener',
        stripsPowerups: true,
        stripsAll: true,
        lane: 0,
        y: PLAYER.y,
        radius: 26,
      }),
    ];
    game.update(1 / 60);
    expect(game.player.shieldCharges).toBe(0); // shield spent
    expect(game.effects.list().length).toBe(2); // buffs preserved
  });
});

describe('active abilities', () => {
  it('an ability pickup switches the active ability', () => {
    const game = new Game(new ScriptedInput());
    game.start();
    expect(game.ability).toBe('pulse');
    game.player.lane = 0;
    game.player.x = laneCenterX(0);
    game.pickups = [abilityPickup('overdrive', 0)];
    game.update(1 / 60);
    expect(game.ability).toBe('overdrive');
  });

  it('OVERDRIVE boosts the fire rate for its duration', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.ability = 'overdrive';
    game.abilityCharge = 999;
    input.triggerAbility();
    game.update(1 / 60);
    expect(game.overdriveTimer).toBeGreaterThan(0);

    game.player.fireCooldown = 0;
    game.update(1 / 60);

    const base = new Game(new ScriptedInput());
    base.start();
    base.player.fireCooldown = 0;
    base.update(1 / 60);

    expect(game.player.fireCooldown).toBeLessThan(base.player.fireCooldown);
  });

  it('BARRIER grants a long invulnerability', () => {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();
    game.ability = 'barrier';
    game.abilityCharge = 999;
    input.triggerAbility();
    game.update(1 / 60);
    expect(game.player.invuln).toBeGreaterThan(2);
  });
});

describe('new enemies', () => {
  it('a phantom is untargetable while cloaked but hittable when solid', () => {
    const shootAtAge = (age: number) => {
      const game = new Game(new ScriptedInput());
      game.start();
      const ph = makeBoss({ kind: 'phantom', hp: 1, maxHp: 1, y: 400, radius: 20, lane: 0, age });
      game.enemies = [ph];
      game.projectiles = [
        { id: 1, lane: 0, x: ph.x, y: ph.y, radius: 6, damage: 5, color: '#fff', speed: 900, pierce: false, hitIds: new Set() },
      ];
      game.update(1 / 60);
      return game.enemies.some((e) => e.id === ph.id); // survived?
    };
    expect(shootAtAge(0.1)).toBe(false); // solid → destroyed
    expect(shootAtAge(PHANTOM.solidTime + 0.1)).toBe(true); // cloaked → intangible
  });

  it('a dasher accelerates once it passes the trigger line', () => {
    const moved = (startY: number) => {
      const game = new Game(new ScriptedInput());
      game.start();
      const d = makeBoss({ kind: 'dasher', hp: 99, maxHp: 99, y: startY, speed: 60, radius: 19, lane: 1 });
      game.enemies = [d];
      game.player.lane = 0; // don't shoot it
      const y0 = d.y;
      game.update(1 / 60);
      return game.enemies[0].y - y0;
    };
    const slow = moved(DASHER.triggerY - 60);
    const fast = moved(DASHER.triggerY + 60);
    expect(fast).toBeGreaterThan(slow * 2);
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
