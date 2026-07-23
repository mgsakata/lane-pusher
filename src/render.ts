import {
  COLORS,
  FIELD_MARGIN,
  GOAL_LINE_Y,
  HEIGHT,
  LANE_COUNT,
  LANE_WIDTH,
  PLAYER,
  WIDTH,
} from './config';
import type { Game } from './game';
import type { Enemy, Pickup } from './types';

export function render(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.save();

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (game.shake > 0) {
    const s = game.shake;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  drawField(ctx, game);
  for (const pickup of game.pickups) drawPickup(ctx, pickup);
  for (const enemy of game.enemies) drawEnemy(ctx, enemy);
  drawProjectiles(ctx, game);
  if (game.phase === 'playing') drawPlayer(ctx, game);
  drawParticles(ctx, game);
  drawFloaters(ctx, game);

  ctx.restore();

  drawHud(ctx, game);
  if (game.phase === 'title') drawTitle(ctx, game);
  if (game.phase === 'gameover') drawGameOver(ctx, game);
}

// ------------------------------------------------------------------- field

function drawField(ctx: CanvasRenderingContext2D, game: Game) {
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    ctx.fillStyle = lane % 2 === 0 ? COLORS.laneA : COLORS.laneB;
    ctx.fillRect(FIELD_MARGIN + lane * LANE_WIDTH, 0, LANE_WIDTH, HEIGHT);
  }

  // Scrolling rungs give the lanes a sense of downward motion.
  const offset = (game.elapsed * 90) % 60;
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 2;
  for (let y = -60 + offset; y < HEIGHT; y += 60) {
    ctx.beginPath();
    ctx.moveTo(FIELD_MARGIN, y);
    ctx.lineTo(WIDTH - FIELD_MARGIN, y);
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.laneEdge;
  ctx.lineWidth = 2;
  for (let lane = 0; lane <= LANE_COUNT; lane += 1) {
    const x = FIELD_MARGIN + lane * LANE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.goalLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(FIELD_MARGIN, GOAL_LINE_Y);
  ctx.lineTo(WIDTH - FIELD_MARGIN, GOAL_LINE_Y);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ------------------------------------------------------------------ actors

function drawPlayer(ctx: CanvasRenderingContext2D, game: Game) {
  const { x, invuln, shieldCharges } = game.player;
  const y = PLAYER.y;

  // Blink while invulnerable so the state is readable at a glance.
  if (invuln > 0 && Math.floor(invuln * 20) % 2 === 0) return;

  ctx.save();
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 18;
  ctx.fillStyle = invuln > 0 ? COLORS.playerInvuln : COLORS.player;

  ctx.beginPath();
  ctx.moveTo(x, y - PLAYER.radius);
  ctx.lineTo(x + PLAYER.radius * 0.85, y + PLAYER.radius * 0.8);
  ctx.lineTo(x, y + PLAYER.radius * 0.4);
  ctx.lineTo(x - PLAYER.radius * 0.85, y + PLAYER.radius * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < shieldCharges; i += 1) {
    ctx.strokeStyle = COLORS.shield;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER.radius + 8 + i * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  if (enemy.kind === 'hazard') {
    drawHazard(ctx, enemy);
    return;
  }

  const wobble = Math.sin(enemy.age * 6) * 2;
  const x = enemy.x + wobble;
  const { y, radius } = enemy;

  ctx.save();
  ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : enemy.color;
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = enemy.kind === 'boss' ? 26 : 10;

  ctx.beginPath();
  switch (enemy.kind) {
    case 'runner':
      ctx.moveTo(x, y + radius);
      ctx.lineTo(x + radius, y - radius);
      ctx.lineTo(x - radius, y - radius);
      break;
    case 'brute':
      ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
      break;
    case 'splitter':
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      break;
    default:
      ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();

  if (enemy.kind === 'boss') {
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius + 9, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  if (enemy.maxHp > 1) drawHealthBar(ctx, x, y - radius - 10, radius, enemy);
}

/** A hazard reads as a spinning warning ring with a cross — clearly "avoid". */
function drawHazard(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const { x, y, radius } = enemy;
  const pulse = 1 + Math.sin(enemy.age * 9) * 0.12;
  const r = radius * pulse;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(enemy.age * 2.2);
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = 20;
  ctx.strokeStyle = enemy.color;
  ctx.lineWidth = 3.5;

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Spokes make the rotation legible and reinforce the hazard read.
  const spoke = r * 0.62;
  for (let i = 0; i < 4; i += 1) {
    const a = (Math.PI / 2) * i + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * spoke * 0.4, Math.sin(a) * spoke * 0.4);
    ctx.lineTo(Math.cos(a) * spoke, Math.sin(a) * spoke);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  enemy: Enemy,
) {
  const width = radius * 2;
  const fraction = Math.max(0, enemy.hp / enemy.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - radius, y, width, 4);
  ctx.fillStyle = enemy.color;
  ctx.fillRect(x - radius, y, width * fraction, 4);
}

function drawPickup(ctx: CanvasRenderingContext2D, pickup: Pickup) {
  const pulse = 1 + Math.sin(pickup.age * 8) * 0.08;
  const r = pickup.radius * pulse;

  ctx.save();
  ctx.translate(pickup.x, pickup.y);
  ctx.rotate(Math.sin(pickup.age * 2) * 0.2);

  ctx.shadowColor = pickup.color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = pickup.color;
  ctx.fillStyle = 'rgba(13,17,23,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(-r, -r, r * 2, r * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = pickup.color;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pickup.label, pickup.x, pickup.y);
}

function drawProjectiles(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.save();
  ctx.fillStyle = COLORS.projectile;
  ctx.shadowColor = COLORS.projectile;
  ctx.shadowBlur = 12;
  for (const p of game.projectiles) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.radius * 0.7, p.radius * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, game: Game) {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of game.floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.maxLife));
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// --------------------------------------------------------------------- hud

function drawHud(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.textBaseline = 'top';

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(String(game.score), 16, 14);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(`BEST ${game.bestScore}`, 16, 46);

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 16px system-ui, sans-serif';
  const waveLabel = game.spawner.isBossWave
    ? `WAVE ${game.spawner.wave} · BOSS`
    : `WAVE ${game.spawner.wave}`;
  ctx.fillText(waveLabel, WIDTH - 16, 16);

  // Wave timer: filled while spawning, dimmed during the breather.
  const barWidth = 110;
  const barX = WIDTH - 16 - barWidth;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(barX, 40, barWidth, 5);
  ctx.fillStyle =
    game.spawner.phase === 'active' ? COLORS.player : COLORS.textDim;
  ctx.fillRect(barX, 40, barWidth * game.spawner.phaseProgress, 5);

  const multiplier = game.comboMultiplier;
  if (multiplier > 1 && game.phase === 'playing') {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.player;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`x${multiplier}`, WIDTH / 2, 16);
  }

  drawHealth(ctx, game);
  drawEffectBar(ctx, game);
}

function drawHealth(ctx: CanvasRenderingContext2D, game: Game) {
  const size = 14;
  const gap = 6;
  const y = HEIGHT - 34;
  for (let i = 0; i < PLAYER.maxHealth; i += 1) {
    const x = 16 + i * (size + gap);
    ctx.fillStyle =
      i < game.player.health ? COLORS.health : 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (game.player.shieldCharges > 0) {
    ctx.fillStyle = COLORS.shield;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const x = 16 + PLAYER.maxHealth * (size + gap) + 6;
    ctx.fillText(`+${game.player.shieldCharges}`, x, y + size / 2);
  }
}

function drawEffectBar(ctx: CanvasRenderingContext2D, game: Game) {
  const buffs = game.effects.list();
  if (buffs.length === 0) return;

  // Held buffs read as a stack of chips; they persist until a hazard strips them.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 12px system-ui, sans-serif';

  const padX = 8;
  const chipH = 20;
  const gap = 6;
  let y = HEIGHT - 30;

  for (const def of buffs) {
    const w = ctx.measureText(def.label).width + padX * 2;
    const x = WIDTH - 16 - w;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y - chipH / 2, w, chipH);
    ctx.fillStyle = def.color;
    ctx.fillRect(x, y - chipH / 2, 3, chipH);
    ctx.fillStyle = def.color;
    ctx.fillText(def.label, WIDTH - 16 - padX, y);
    y -= chipH + gap;
  }
}

// ---------------------------------------------------------------- overlays

function drawTitle(ctx: CanvasRenderingContext2D, game: Game) {
  dimScreen(ctx);
  centered(ctx, 'LANE PUSHER', HEIGHT / 2 - 90, 'bold 44px', COLORS.player);
  centered(
    ctx,
    'Tap a lane, or use  ←  →  /  A  D',
    HEIGHT / 2 - 20,
    '16px',
    COLORS.text,
  );
  centered(
    ctx,
    'You fire automatically. Nothing gets past the line.',
    HEIGHT / 2 + 8,
    '14px',
    COLORS.textDim,
  );
  centered(
    ctx,
    'Power-ups are permanent — dodge the pink dampeners.',
    HEIGHT / 2 + 32,
    '14px',
    '#ff5cf0',
  );
  centered(ctx, 'PRESS SPACE OR TAP TO START', HEIGHT / 2 + 78, 'bold 16px', COLORS.text);
  if (game.bestScore > 0) {
    centered(ctx, `BEST ${game.bestScore}`, HEIGHT / 2 + 112, '14px', COLORS.textDim);
  }
}

function drawGameOver(ctx: CanvasRenderingContext2D, game: Game) {
  dimScreen(ctx);
  centered(ctx, 'RUN OVER', HEIGHT / 2 - 110, 'bold 40px', COLORS.health);
  centered(ctx, `SCORE  ${game.score}`, HEIGHT / 2 - 46, 'bold 26px', COLORS.text);
  centered(
    ctx,
    `WAVE ${game.spawner.wave}  ·  ${game.kills} KILLS`,
    HEIGHT / 2 - 8,
    '16px',
    COLORS.textDim,
  );
  const isBest = game.score >= game.bestScore && game.score > 0;
  centered(
    ctx,
    isBest ? 'NEW BEST!' : `BEST  ${game.bestScore}`,
    HEIGHT / 2 + 26,
    'bold 16px',
    isBest ? COLORS.player : COLORS.textDim,
  );
  centered(ctx, 'PRESS SPACE OR TAP TO RETRY', HEIGHT / 2 + 90, 'bold 16px', COLORS.text);
}

function dimScreen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(6,9,14,0.78)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function centered(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  font: string,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.font = `${font} system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, WIDTH / 2, y);
}
