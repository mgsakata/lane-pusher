import { ABILITY_BUTTON, LANE_COUNT } from './config';

/**
 * What the game polls each frame for player intent. The DOM `Input` implements
 * this, and headless drivers (tests, autopilots) can provide their own.
 */
export interface InputSource {
  /** A pending lane index, returned once then cleared. */
  consumeLaneTarget(): number | null;
  /** Whether start/restart/confirm was pressed since the last call. */
  consumeConfirm(): boolean;
  /** Whether the active ability was triggered since the last call. */
  consumeAbility(): boolean;
  /** A -1/+1 selection nudge (arrow keys) for menus, or 0. */
  consumeSelectDelta(): number;
  /** Horizontal tap position (0..1) since the last call, for picking options. */
  consumePointerFraction(): number | null;
}

/**
 * Collects lane-change, confirm, ability and menu-selection intents from
 * keyboard, mouse and touch. The game polls the consume* methods once per frame
 * so a single press never fires twice.
 */
export class Input implements InputSource {
  private laneTarget: number | null = null;
  private confirm = false;
  private ability = false;
  private selectDelta = 0;
  private pointerFraction: number | null = null;
  private disposers: Array<() => void> = [];
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bind();
  }

  private bind() {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          this.laneTarget = 0;
          this.selectDelta = -1;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.laneTarget = LANE_COUNT - 1;
          this.selectDelta = 1;
          break;
        case ' ':
          // Space starts a run on menus and fires the ability during play.
          this.confirm = true;
          this.ability = true;
          e.preventDefault();
          break;
        case 'Enter':
          this.confirm = true;
          e.preventDefault();
          break;
        default:
          return;
      }
    };

    // A tap or click picks the lane under the pointer, which reads naturally on
    // both desktop and touch without needing a swipe gesture. The bottom-right
    // corner is reserved for the ability.
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      this.pointerFraction = fx;

      if (fx > ABILITY_BUTTON.xMin && fy > ABILITY_BUTTON.yMin) {
        this.ability = true;
        return;
      }
      this.laneTarget = fx < 0.5 ? 0 : LANE_COUNT - 1;
      this.confirm = true;
    };

    window.addEventListener('keydown', onKeyDown);
    this.canvas.addEventListener('pointerdown', onPointerDown);

    this.disposers.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => this.canvas.removeEventListener('pointerdown', onPointerDown),
    );
  }

  consumeLaneTarget(): number | null {
    const target = this.laneTarget;
    this.laneTarget = null;
    return target;
  }

  consumeConfirm(): boolean {
    const value = this.confirm;
    this.confirm = false;
    return value;
  }

  consumeAbility(): boolean {
    const value = this.ability;
    this.ability = false;
    return value;
  }

  consumeSelectDelta(): number {
    const value = this.selectDelta;
    this.selectDelta = 0;
    return value;
  }

  consumePointerFraction(): number | null {
    const value = this.pointerFraction;
    this.pointerFraction = null;
    return value;
  }

  dispose() {
    for (const off of this.disposers) off();
    this.disposers = [];
  }
}
