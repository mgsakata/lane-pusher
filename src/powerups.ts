import { POWERUP, POWERUP_DEFS } from './config';
import type { PowerUpDef, PowerUpKind } from './types';
import { pickWeighted } from './util';

/** What an instantly-consumed pickup asks the game to do. */
export interface InstantEffect {
  heal: number;
  shieldCharges: number;
  /** Detonate: clear regular enemies on screen. */
  bomb: boolean;
}

/**
 * Tracks which buffs are currently held. Buffs persist indefinitely once
 * collected and are only lost when a hazard strips them. Instant power-ups
 * (HEAL, SHLD) are reported back to the game instead of being stored here,
 * since they change player state rather than weapon state.
 */
export class Effects {
  private held = new Set<PowerUpKind>();

  /** Applies a pickup. Collecting a buff you already hold is a no-op. */
  apply(kind: PowerUpKind): InstantEffect {
    const def = defFor(kind);
    if (def.type === 'buff') {
      this.held.add(kind);
      return { heal: 0, shieldCharges: 0, bomb: false };
    }
    return {
      heal: kind === 'heal' ? POWERUP.healAmount : 0,
      shieldCharges: kind === 'shield' ? POWERUP.shieldCharges : 0,
      bomb: kind === 'bomb',
    };
  }

  isActive(kind: PowerUpKind): boolean {
    return this.held.has(kind);
  }

  /** Active buffs in a stable order, for the HUD. */
  list(): PowerUpDef[] {
    return POWERUP_DEFS.filter((d) => this.held.has(d.kind));
  }

  /** Clears every held buff and returns how many were lost. */
  stripAll(): number {
    const lost = this.held.size;
    this.held.clear();
    return lost;
  }

  reset() {
    this.held.clear();
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
