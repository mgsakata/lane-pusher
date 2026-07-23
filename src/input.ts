import { LANE_COUNT } from './config';

/**
 * Collects lane-change and confirm intents from keyboard, mouse and touch.
 * The game polls `consumeLaneTarget()` / `consumeConfirm()` once per frame so
 * input never fires twice for a single press.
 */
export class Input {
  private laneTarget: number | null = null;
  private confirm = false;
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
        case 'Enter':
          this.confirm = true;
          e.preventDefault();
          break;
        default:
          return;
      }
    };

    // A tap or click picks the lane under the pointer, which reads naturally on
    // both desktop and touch without needing a swipe gesture.
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      this.laneTarget = fraction < 0.5 ? 0 : LANE_COUNT - 1;
      this.confirm = true;
    };

    window.addEventListener('keydown', onKeyDown);
    this.canvas.addEventListener('pointerdown', onPointerDown);

    this.disposers.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => this.canvas.removeEventListener('pointerdown', onPointerDown),
    );
  }

  /** Returns a pending lane index once, then clears it. */
  consumeLaneTarget(): number | null {
    const target = this.laneTarget;
    this.laneTarget = null;
    return target;
  }

  /** Returns whether start/restart was pressed since the last call. */
  consumeConfirm(): boolean {
    const value = this.confirm;
    this.confirm = false;
    return value;
  }

  dispose() {
    for (const off of this.disposers) off();
    this.disposers = [];
  }
}
