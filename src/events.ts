import type {
  EnemyKind,
  LaneIndex,
  PickupContent,
  PowerUpKind,
  WeaponKind,
} from './types';

/**
 * The set of gameplay events and their payloads. Sound and visual feedback
 * subscribe to these instead of reaching into game internals, so the art/sound
 * layer can be wired in without touching game logic.
 */
export interface GameEventMap {
  gameStart: Record<string, never>;
  fire: { weapon: WeaponKind };
  kill: { kind: EnemyKind; x: number; y: number; boss: boolean };
  playerHit: { amount: number };
  shieldBlock: Record<string, never>;
  dampened: { lost: number };
  pickup: { content: PickupContent };
  weaponSwitch: { weapon: WeaponKind };
  buffUp: { kind: PowerUpKind; level: number };
  bomb: Record<string, never>;
  ability: Record<string, never>;
  enemyFire: { lane: LaneIndex };
  waveStart: { wave: number; boss: boolean };
  waveClear: { wave: number };
  gameOver: { score: number; wave: number };
}

export type GameEventType = keyof GameEventMap;
type Handler<K extends GameEventType> = (payload: GameEventMap[K]) => void;
type AnyHandler = (payload: unknown) => void;

/** A minimal typed pub/sub. The public API stays typed per event. */
export class Emitter {
  private handlers = new Map<GameEventType, AnyHandler[]>();

  on<K extends GameEventType>(type: K, handler: Handler<K>): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as AnyHandler);
    this.handlers.set(type, list);
    return () => {
      const current = this.handlers.get(type);
      if (!current) return;
      const i = current.indexOf(handler as AnyHandler);
      if (i >= 0) current.splice(i, 1);
    };
  }

  emit<K extends GameEventType>(type: K, payload: GameEventMap[K]): void {
    const list = this.handlers.get(type);
    if (!list) return;
    for (const handler of list.slice()) handler(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
