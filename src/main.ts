import './style.css';
import { SoundEngine } from './audio';
import { HEIGHT, WIDTH } from './config';
import { Game } from './game';
import { Input } from './input';
import { leaderboard } from './leaderboard';
import { promptName } from './nameEntry';
import { render } from './render';

const canvasEl = document.querySelector<HTMLCanvasElement>('#game');
if (!canvasEl) throw new Error('Missing #game canvas');
const canvas: HTMLCanvasElement = canvasEl;

const context = canvas.getContext('2d');
if (!context) throw new Error('2D canvas context unavailable');
const ctx: CanvasRenderingContext2D = context;

const input = new Input(canvas);
const game = new Game(input);

const sound = new SoundEngine();
sound.attach(game);

// Leaderboard: fetch the board, get a session per run, and offer to submit a
// qualifying score. All decoupled through the game's event bus.
void leaderboard.refresh();
game.events.on('gameStart', () => {
  void leaderboard.startSession();
});
game.events.on('gameOver', ({ score, wave }) => {
  void handleGameOver(score, wave);
});

async function handleGameOver(score: number, wave: number) {
  await leaderboard.refresh();
  if (!leaderboard.qualifies(score)) return;
  const rank = leaderboard.scores.filter((s) => s.score > score).length + 1;
  const name = await promptName(rank);
  if (name) await leaderboard.submit(name, score, wave);
}

// Browsers require a user gesture before audio can start.
const unlockAudio = () => {
  sound.resume();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/**
 * The canvas keeps a fixed logical size (WIDTH x HEIGHT) and is letterboxed
 * into the viewport with CSS, so no gameplay code deals with screen pixels.
 */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;

  const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
  canvas.style.width = `${WIDTH * scale}px`;
  canvas.style.height = `${HEIGHT * scale}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resize();
window.addEventListener('resize', resize);

/** Largest step we simulate at once, so a backgrounded tab cannot teleport enemies. */
const MAX_STEP = 1 / 30;

let previous = performance.now();

function frame(now: number) {
  const dt = Math.min((now - previous) / 1000, MAX_STEP);
  previous = now;

  if (input.consumeMute()) sound.toggleMute();

  game.update(dt);
  render(ctx, game, sound.muted, now / 1000);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
