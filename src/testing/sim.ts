import { GOAL_LINE_Y, WEAPON_DEFS } from '../config';
import { Game } from '../game';
import type { InputSource } from '../input';
import type { WeaponKind } from '../types';
import { mulberry32 } from '../util';

/**
 * Headless simulation harness: drives the real `Game` loop with a scripted
 * autopilot and seeded randomness, so tests can assert on how the integrated
 * game actually plays out (not just its balance formulas).
 */

// mulberry32 lives in util now; re-export so existing test imports still resolve.
export { mulberry32 };

/** An InputSource the harness (and tests) set programmatically each frame. */
export class ScriptedInput implements InputSource {
  private laneTarget: number | null = null;
  private confirm = false;
  private ability = false;
  private pause = false;
  private help = false;
  private dodge: number | null = null;

  setLane(lane: number) {
    this.laneTarget = lane;
  }

  triggerDodge(lane: number) {
    this.dodge = lane;
  }

  press() {
    this.confirm = true;
  }

  triggerAbility() {
    this.ability = true;
  }

  triggerPause() {
    this.pause = true;
  }

  triggerHelp() {
    this.help = true;
  }

  consumeLaneTarget(): number | null {
    const t = this.laneTarget;
    this.laneTarget = null;
    return t;
  }

  consumeConfirm(): boolean {
    const c = this.confirm;
    this.confirm = false;
    return c;
  }

  consumeAbility(): boolean {
    const a = this.ability;
    this.ability = false;
    return a;
  }

  consumePause(): boolean {
    const p = this.pause;
    this.pause = false;
    return p;
  }

  consumeHelp(): boolean {
    const h = this.help;
    this.help = false;
    return h;
  }

  consumeDodge(): number | null {
    const d = this.dodge;
    this.dodge = null;
    return d;
  }
}

/**
 * Greedy survival autopilot: since the ship only fires its own lane, sit in the
 * lane whose damaging threat is nearest the goal line and shoot it down.
 * Hazards cost no HP, so they are ignored for lane choice.
 */
export function chooseLane(game: Game): number {
  const urgency = [-Infinity, -Infinity];
  for (const e of game.enemies) {
    if (e.stripsPowerups) continue;
    if (e.y > urgency[e.lane]) urgency[e.lane] = e.y;
  }
  for (const s of game.enemyShots) {
    if (s.y > urgency[s.lane]) urgency[s.lane] = s.y;
  }
  if (urgency[0] === urgency[1]) return game.player.lane;
  return urgency[0] > urgency[1] ? 0 : 1;
}

/**
 * A "realistic" player: defends the lane with the most imminent threat, but
 * when nothing is about to breach, ducks over to grab the nearest pickup — so
 * buffs (and weapon/ability switches) accumulate organically over a run. This
 * is the autopilot that actually feels pickup frequency.
 */
export function chooseLaneRealistic(game: Game): number {
  const threat = [-Infinity, -Infinity];
  for (const e of game.enemies) {
    if (e.stripsPowerups) continue; // dampeners cost no HP; don't chase them
    if (e.y > threat[e.lane]) threat[e.lane] = e.y;
  }
  for (const s of game.enemyShots) {
    if (s.y > threat[s.lane]) threat[s.lane] = s.y;
  }
  // Something close to the goal line takes priority — defend it.
  if (Math.max(threat[0], threat[1]) > GOAL_LINE_Y - 240) {
    return threat[0] >= threat[1] ? 0 : 1;
  }
  // Otherwise collect the nearest (lowest) pickup.
  let bestLane = -1;
  let bestY = -Infinity;
  for (const p of game.pickups) {
    if (p.y > bestY) {
      bestY = p.y;
      bestLane = p.lane;
    }
  }
  if (bestLane >= 0) return bestLane;
  return threat[0] >= threat[1] ? 0 : 1;
}

export interface SimOptions {
  seed: number;
  /** When true, the ship carries a maxed loadout maintained every frame. */
  buffed: boolean;
  /**
   * "Realistic" mode: don't force the loadout or strip pickups — let the ship
   * collect drops and build up buffs organically, using the pickup-seeking
   * autopilot. Overrides `buffed`. This is the mode that feels drop frequency.
   */
  collect?: boolean;
  /** Weapon to max out for the buffed run (default scatter — covers both lanes). */
  weapon?: WeaponKind;
  /** Wall-clock seconds to simulate before giving up (a survival cap). */
  maxSeconds: number;
}

export interface SimResult {
  wave: number;
  elapsed: number;
  died: boolean;
  kills: number;
  score: number;
  /** Distinct buff kinds held at the end (0 unless in collect mode). */
  buffs: number;
}

/**
 * Equips a weapon and maxes its buffs every frame, so a hazard strip cannot
 * erase the loadout mid-run and the comparison stays a clean maxed-vs-none.
 */
function maintainLoadout(game: Game, weapon: WeaponKind) {
  game.weapon = weapon;
  game.effects.reset();
  for (const buff of WEAPON_DEFS[weapon].buffs) {
    for (let level = 0; level < 3; level += 1) game.effects.apply(buff);
  }
}

export function simulate(opts: SimOptions): SimResult {
  const originalRandom = Math.random;
  Math.random = mulberry32(opts.seed);
  try {
    const input = new ScriptedInput();
    const game = new Game(input);
    game.start();

    const dt = 1 / 60;
    const steps = Math.ceil(opts.maxSeconds / dt);

    for (let i = 0; i < steps; i += 1) {
      input.setLane(opts.collect ? chooseLaneRealistic(game) : chooseLane(game));
      // A realistic player fires the ability whenever it's charged.
      if (opts.collect && game.abilityReady) input.triggerAbility();
      game.update(dt);

      if (opts.collect) {
        // Realistic: let drops reach the ship and buffs build up naturally.
      } else {
        // Isolate weapon-vs-pressure: no pickups reach the ship, and the buffed
        // run's loadout is controlled rather than looted.
        if (opts.buffed) maintainLoadout(game, opts.weapon ?? 'scatter');
        else game.effects.reset();
        game.pickups.length = 0;
      }

      if (game.phase === 'gameover') break;
    }

    return {
      wave: game.spawner.wave,
      elapsed: game.elapsed,
      died: game.phase === 'gameover',
      kills: game.kills,
      score: game.score,
      buffs: game.effects.list().length,
    };
  } finally {
    Math.random = originalRandom;
  }
}
