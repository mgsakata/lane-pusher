import { ABILITY_BUTTON, LANE_COUNT, PAUSE_BUTTON } from './config';

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
  /** Whether pause was toggled (Esc/P, or the pause button) since the last call. */
  consumePause(): boolean;
  /** Whether help was requested (H key) since the last call. */
  consumeHelp(): boolean;
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
  private pause = false;
  private help = false;
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
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.laneTarget = LANE_COUNT - 1;
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
        case 'Escape':
        case 'p':
        case 'P':
          this.pause = true;
          break;
        case 'h':
        case 'H':
          this.help = true;
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

      if (fx > PAUSE_BUTTON.xMin && fy < PAUSE_BUTTON.yMax) {
        this.pause = true;
        return;
      }
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

  consumePause(): boolean {
    const value = this.pause;
    this.pause = false;
    return value;
  }

  consumeHelp(): boolean {
    const value = this.help;
    this.help = false;
    return value;
  }

  dispose() {
    for (const off of this.disposers) off();
    this.disposers = [];
  }
}
