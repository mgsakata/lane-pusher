import { POWERUP, POWERUP_DEFS } from './config';
import type { PowerUpDef, PowerUpKind } from './types';
import { pickWeighted } from './util';

/** What an instantly-consumed pickup asks the game to do. */
export interface InstantEffect {
  heal: number;
  shieldCharges: number;
}

/**
 * Tracks which timed power-ups are running and how long they have left.
 * Instant power-ups (HEAL, SHLD) are reported back to the game instead of
 * being stored here, since they change player state rather than weapon state.
 */
export class Effects {
  private remainingByKind = new Map<PowerUpKind, number>();

  update(dt: number) {
    for (const [kind, remaining] of this.remainingByKind) {
      const next = remaining - dt;
      if (next <= 0) this.remainingByKind.delete(kind);
      else this.remainingByKind.set(kind, next);
    }
  }

  /** Applies a pickup. Re-collecting a timed power-up refreshes its duration. */
  apply(kind: PowerUpKind): InstantEffect {
    const def = defFor(kind);
    if (def.duration > 0) {
      this.remainingByKind.set(kind, def.duration);
      return { heal: 0, shieldCharges: 0 };
    }
    return {
      heal: kind === 'heal' ? POWERUP.healAmount : 0,
      shieldCharges: kind === 'shield' ? POWERUP.shieldCharges : 0,
    };
  }

  isActive(kind: PowerUpKind): boolean {
    return this.remainingByKind.has(kind);
  }

  remaining(kind: PowerUpKind): number {
    return this.remainingByKind.get(kind) ?? 0;
  }

  /** Active timed effects, longest-remaining first, for the HUD. */
  active(): Array<{ def: PowerUpDef; remaining: number }> {
    return [...this.remainingByKind.entries()]
      .map(([kind, remaining]) => ({ def: defFor(kind), remaining }))
      .sort((a, b) => b.remaining - a.remaining);
  }

  reset() {
    this.remainingByKind.clear();
  }
}

export function defFor(kind: PowerUpKind): PowerUpDef {
  const def = POWERUP_DEFS.find((d) => d.kind === kind);
  if (!def) throw new Error(`Unknown power-up: ${kind}`);
  return def;
}

export function randomPowerUpDef(): PowerUpDef {
  const def = pickWeighted(POWERUP_DEFS, (d) => d.weight);
  if (!def) throw new Error('No power-ups are configured with a weight');
  return def;
}
