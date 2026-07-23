import { POWERUP, POWERUP_DEFS } from './config';
import type { PowerUpDef, PowerUpKind } from './types';

/** What an instantly-consumed pickup asks the game to do. */
export interface InstantEffect {
  heal: number;
  shieldCharges: number;
  /** Detonate: clear regular enemies on screen. */
  bomb: boolean;
}

/** A held buff and the level it has reached, for the HUD. */
export interface ActiveBuff {
  def: PowerUpDef;
  level: number;
}

/**
 * Tracks held buffs and their levels. Buffs persist indefinitely once
 * collected and are only lost when a hazard strips them; re-collecting a
 * leveled buff raises its level up to the def's maxLevel. Instant power-ups
 * (HEAL, SHLD, BOMB) are reported back to the game instead of being stored
 * here, since they change player state rather than weapon state.
 */
export class Effects {
  private levels = new Map<PowerUpKind, number>();

  /** Applies a pickup. Re-collecting a buff raises its level up to maxLevel. */
  apply(kind: PowerUpKind): InstantEffect {
    const def = defFor(kind);
    if (def.type === 'buff') {
      const max = def.maxLevel ?? 1;
      const next = Math.min((this.levels.get(kind) ?? 0) + 1, max);
      this.levels.set(kind, next);
      return { heal: 0, shieldCharges: 0, bomb: false };
    }
    return {
      heal: kind === 'heal' ? POWERUP.healAmount : 0,
      shieldCharges: kind === 'shield' ? POWERUP.shieldCharges : 0,
      bomb: kind === 'bomb',
    };
  }

  /** Current level of a buff, or 0 if it is not held. */
  level(kind: PowerUpKind): number {
    return this.levels.get(kind) ?? 0;
  }

  /** A plain object of held buff levels, for the balance math. */
  levelMap(): Partial<Record<PowerUpKind, number>> {
    const out: Partial<Record<PowerUpKind, number>> = {};
    for (const [kind, level] of this.levels) out[kind] = level;
    return out;
  }

  isActive(kind: PowerUpKind): boolean {
    return (this.levels.get(kind) ?? 0) > 0;
  }

  /** Active buffs in a stable order, for the HUD. */
  list(): ActiveBuff[] {
    return POWERUP_DEFS.filter((d) => this.levels.has(d.kind)).map((def) => ({
      def,
      level: this.levels.get(def.kind) ?? 0,
    }));
  }

  /** Clears every held buff and returns how many were lost. */
  stripAll(): number {
    const lost = this.levels.size;
    this.levels.clear();
    return lost;
  }

  reset() {
    this.levels.clear();
  }
}

export function defFor(kind: PowerUpKind): PowerUpDef {
  const def = POWERUP_DEFS.find((d) => d.kind === kind);
  if (!def) throw new Error(`Unknown power-up: ${kind}`);
  return def;
}
