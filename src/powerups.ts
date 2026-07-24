import { POWERUP, POWERUP_DEFS } from './config';
import type { PowerUpDef, PowerUpKind } from './types';

/** What an instantly-consumed pickup asks the game to do. */
export interface InstantEffect {
  heal: number;
  shieldCharges: number;
  /** Extra max health (VIT). */
  maxHealth: number;
  /** Detonate: clear regular enemies on screen. */
  bomb: boolean;
}

/** A held buff and the level it has reached, for the HUD. */
export interface ActiveBuff {
  def: PowerUpDef;
  level: number;
}

/** A running timed effect with seconds remaining, for the HUD. */
export interface ActiveTimed {
  def: PowerUpDef;
  remaining: number;
}

const NO_INSTANT: InstantEffect = {
  heal: 0,
  shieldCharges: 0,
  maxHealth: 0,
  bomb: false,
};

/**
 * Tracks held buffs (persistent, leveled, stripped by hazards) and timed
 * effects (burst power-ups that count down and expire). Instant power-ups
 * (HEAL/SHLD/VIT/BOMB) are reported back to the game rather than stored, since
 * they change player state.
 */
export class Effects {
  private levels = new Map<PowerUpKind, number>();
  private timed = new Map<PowerUpKind, number>();

  /** Applies a pickup, routing by its type. */
  apply(kind: PowerUpKind): InstantEffect {
    const def = defFor(kind);

    if (def.type === 'buff') {
      const max = def.maxLevel ?? 1;
      const next = Math.min((this.levels.get(kind) ?? 0) + 1, max);
      this.levels.set(kind, next);
      return NO_INSTANT;
    }

    if (def.type === 'timed') {
      this.timed.set(kind, def.duration ?? 0);
      return NO_INSTANT;
    }

    return {
      heal: kind === 'heal' ? POWERUP.healAmount : 0,
      shieldCharges: kind === 'shield' ? POWERUP.shieldCharges : 0,
      maxHealth: kind === 'vit' ? POWERUP.vitalityBonus : 0,
      bomb: kind === 'bomb',
    };
  }

  /** Counts down timed effects. */
  tick(dt: number) {
    for (const [kind, remaining] of this.timed) {
      const next = remaining - dt;
      if (next <= 0) this.timed.delete(kind);
      else this.timed.set(kind, next);
    }
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

  /** Whether a timed effect is currently running. */
  timedActive(kind: PowerUpKind): boolean {
    return (this.timed.get(kind) ?? 0) > 0;
  }

  /** Active buffs in a stable order, for the HUD. */
  list(): ActiveBuff[] {
    return POWERUP_DEFS.filter((d) => this.levels.has(d.kind)).map((def) => ({
      def,
      level: this.levels.get(def.kind) ?? 0,
    }));
  }

  /** Running timed effects, longest-remaining first, for the HUD. */
  timedList(): ActiveTimed[] {
    return [...this.timed.entries()]
      .map(([kind, remaining]) => ({ def: defFor(kind), remaining }))
      .sort((a, b) => b.remaining - a.remaining);
  }

  /** Clears every held buff (timed bursts survive) and returns how many were lost. */
  stripAll(): number {
    const lost = this.levels.size;
    this.levels.clear();
    return lost;
  }

  /**
   * Removes the entire stack of one random buff drawn from `candidates` (that
   * is actually held) — all its levels at once. Returns the kind stripped, or
   * null if none applied.
   */
  stripOne(candidates: PowerUpKind[]): PowerUpKind | null {
    const held = candidates.filter((k) => (this.levels.get(k) ?? 0) > 0);
    if (held.length === 0) return null;
    const kind = held[Math.floor(Math.random() * held.length)];
    this.levels.delete(kind);
    return kind;
  }

  reset() {
    this.levels.clear();
    this.timed.clear();
  }
}

export function defFor(kind: PowerUpKind): PowerUpDef {
  const def = POWERUP_DEFS.find((d) => d.kind === kind);
  if (!def) throw new Error(`Unknown power-up: ${kind}`);
  return def;
}
