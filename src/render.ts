import {
  ABILITY_DEFS,
  BOSS,
  bossFireLanes,
  COLORS,
  DASHER,
  DODGE,
  FIELD_MARGIN,
  GOAL_LINE_Y,
  HEIGHT,
  LANE_COUNT,
  LANE_WIDTH,
  PLAYER,
  POWERUP_DEFS,
  WEAPON_DEFS,
  WIDTH,
  laneCenterX,
  phantomCloaked,
} from './config';
import type { Game } from './game';
import { leaderboard } from './leaderboard';
import type { Enemy, Pickup } from './types';
import { clamp } from './util';

/**
 * A fixed parallax starfield, generated once. Stars scroll down at a rate set
 * by their depth `z`, wrapping around the field.
 */
const STARS = Array.from({ length: 80 }, () => ({
  x: Math.random() * WIDTH,
  y: Math.random() * HEIGHT,
  z: Math.random() * 0.7 + 0.3,
  r: Math.random() * 1.4 + 0.4,
}));

export function render(
  ctx: CanvasRenderingContext2D,
  game: Game,
  muted = false,
  time = 0,
) {
  drawBackground(ctx, time);

  ctx.save();
  if (game.shake > 0) {
    const s = game.shake;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  drawField(ctx, game);
  for (const pickup of game.pickups) drawPickup(ctx, pickup);
  for (const enemy of game.enemies) drawEnemy(ctx, enemy);
  drawProjectiles(ctx, game);
  drawEnemyShots(ctx, game);
  if (game.phase === 'playing' || game.paused) drawPlayer(ctx, game);
  drawParticles(ctx, game);
  drawFloaters(ctx, game);

  ctx.restore();

  drawVignette(ctx);
  if (game.effects.timedActive('freeze')) {
    ctx.fillStyle = 'rgba(127,227,255,0.1)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  drawFlash(ctx, game);

  drawHud(ctx, game);
  drawMuteButton(ctx, muted);
  drawBossBar(ctx, game);
  if (game.phase === 'title' && !game.showLegend) drawTitle(ctx, game, time);
  if (game.phase === 'gameover' && !game.showLegend) drawGameOver(ctx, game);
  if (game.paused || game.showLegend) drawLegend(ctx, game.paused);
}

// -------------------------------------------------------------- atmosphere

function drawBackground(ctx: CanvasRenderingContext2D, time: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, '#0b1120');
  grad.addColorStop(1, '#05070d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Stars drift on a real-time clock so the menus feel alive too.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of STARS) {
    const y = (s.y + time * 22 * s.z) % HEIGHT;
    const twinkle = 0.4 + Math.sin(time * 2 + s.x) * 0.15;
    ctx.fillStyle = `rgba(130,180,255,${s.z * twinkle})`;
    ctx.beginPath();
    ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT / 2,
    HEIGHT * 0.34,
    WIDTH / 2,
    HEIGHT / 2,
    HEIGHT * 0.78,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawFlash(ctx: CanvasRenderingContext2D, game: Game) {
  if (game.flashAmount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(0.7, game.flashAmount);
  ctx.fillStyle = game.flashColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
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

  ctx.save();
  ctx.strokeStyle = COLORS.goalLine;
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(FIELD_MARGIN, GOAL_LINE_Y);
  ctx.lineTo(WIDTH - FIELD_MARGIN, GOAL_LINE_Y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ------------------------------------------------------------------ actors

function drawPlayer(ctx: CanvasRenderingContext2D, game: Game) {
  const { x, lane, invuln, shieldCharges, dodgeTimer } = game.player;
  const y = PLAYER.y;
  const r = PLAYER.radius;

  // Dodge: an expanding cyan ring pulse marks the intangible window.
  if (dodgeTimer > 0) {
    const t = dodgeTimer / DODGE.duration; // 1 → 0
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(0,229,255,${0.55 * t})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r + 4 + (1 - t) * 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Long invulnerability (a PULSE/BARRIER shield) shows as a bubble instead of
  // blinking; only the brief post-hit i-frames blink.
  const shielded = invuln > 1.2;
  if (invuln > 0 && !shielded && Math.floor(invuln * 20) % 2 === 0) return;

  // OVERDRIVE aura.
  if (game.overdriveTimer > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + Math.sin(game.elapsed * 20) * 0.5;
    ctx.fillStyle = `rgba(255,107,53,${0.25 + pulse * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, r + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Bank toward the lane the ship is sliding into.
  const bank = clamp((laneCenterX(lane) - x) / 60, -0.5, 0.5);
  const color = invuln > 0 ? COLORS.playerInvuln : COLORS.player;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(bank);

  // Thruster flame flickers below the ship (additive glow).
  const flame = r * (0.9 + Math.sin(game.elapsed * 40) * 0.25);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fg = ctx.createLinearGradient(0, r * 0.4, 0, r * 0.4 + flame);
  fg.addColorStop(0, 'rgba(120,230,255,0.9)');
  fg.addColorStop(1, 'rgba(120,230,255,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-r * 0.34, r * 0.5);
  ctx.lineTo(0, r * 0.5 + flame);
  ctx.lineTo(r * 0.34, r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Hull.
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.85, r * 0.8);
  ctx.lineTo(0, r * 0.4);
  ctx.lineTo(-r * 0.85, r * 0.8);
  ctx.closePath();
  ctx.fill();

  // Cockpit highlight.
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(0, -r * 0.1, r * 0.16, 0, Math.PI * 2);
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

  // Ability-shield bubble (PULSE / BARRIER).
  if (shielded) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.6 + Math.sin(game.elapsed * 10) * 0.2;
    ctx.strokeStyle = `rgba(120,220,255,${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(120,220,255,0.08)';
    ctx.fill();
    ctx.restore();
  }
}

function drawEnemyShots(ctx: CanvasRenderingContext2D, game: Game) {
  if (game.enemyShots.length === 0) return;
  ctx.save();
  ctx.fillStyle = '#ffb703';
  ctx.shadowColor = '#ffb703';
  ctx.shadowBlur = 12;
  for (const shot of game.enemyShots) {
    ctx.beginPath();
    ctx.ellipse(shot.x, shot.y, shot.radius * 0.75, shot.radius * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const PI2 = Math.PI * 2;

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  if (enemy.kind === 'hazard') return drawHazard(ctx, enemy);
  if (enemy.kind === 'superdampener') return drawSuperHazard(ctx, enemy);
  if (enemy.kind === 'boss') return drawBoss(ctx, enemy);

  const body = enemy.hitFlash > 0 ? '#ffffff' : enemy.color;

  ctx.save();
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = body;

  switch (enemy.kind) {
    case 'runner':
      drawRunner(ctx, enemy, body);
      break;
    case 'brute':
      drawBrute(ctx, enemy, body);
      break;
    case 'splitter':
      drawSplitter(ctx, enemy, body);
      break;
    case 'weaver':
      drawWeaver(ctx, enemy, body);
      break;
    case 'armored':
      drawArmored(ctx, enemy, body);
      break;
    case 'shooter':
      drawShooter(ctx, enemy, body);
      break;
    case 'dasher':
      drawDasher(ctx, enemy, body);
      break;
    case 'phantom':
      drawPhantom(ctx, enemy, body);
      break;
    case 'warden':
      drawWarden(ctx, enemy, body);
      break;
    default:
      drawGrunt(ctx, enemy, body);
  }
  ctx.restore();

  // A gold shield ring marks enemies a living warden is protecting.
  if (enemy.warded) drawWardedRing(ctx, enemy);

  if (enemy.maxHp > 1) {
    drawHealthBar(ctx, enemy.x, enemy.y - enemy.radius - 12, enemy.radius, enemy);
  }
}

/** The WARDEN elite: a gold core inside a rotating shield of orbiting nodes. */
function drawWarden(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const { x, y, radius: r } = e;

  // Rotating shield ring with nodes.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(e.age * 1.2);
  ctx.strokeStyle = 'rgba(255,215,0,0.7)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r + 6, 0, PI2);
  ctx.stroke();
  ctx.fillStyle = '#ffd700';
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * PI2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6), 2.6, 0, PI2);
    ctx.fill();
  }
  ctx.restore();

  // Hexagonal core.
  ctx.fillStyle = body;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const px = x + Math.cos(a) * r * 0.8;
    const py = y + Math.sin(a) * r * 0.8;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(10,12,18,0.75)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.3, 0, PI2);
  ctx.fill();
}

/** A faint gold bubble over an enemy currently shielded by a warden. */
function drawWardedRing(ctx: CanvasRenderingContext2D, e: Enemy) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.4 + Math.sin(e.age * 8) * 0.15;
  ctx.strokeStyle = `rgba(255,215,0,${pulse})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius + 5, 0, PI2);
  ctx.stroke();
  ctx.restore();
}

/** An arrow that winds up near the trigger line, then streaks when dashing. */
function drawDasher(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const { x, y, radius: r } = e;
  const dashing = y > DASHER.triggerY;
  const winding = !dashing && y > DASHER.triggerY - DASHER.telegraph;

  if (dashing) {
    // Speed streak behind it.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(x, y - r, x, y - r * 4);
    grad.addColorStop(0, e.color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r * 0.4, y - r * 4, r * 0.8, r * 3);
    ctx.restore();
  } else if (winding) {
    // Wind-up glow just before it launches.
    const pulse = 0.5 + Math.sin(e.age * 30) * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,71,126,${0.4 * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, PI2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 1.1);
  ctx.lineTo(x + r * 0.85, y - r * 0.7);
  ctx.lineTo(x, y - r * 0.3);
  ctx.lineTo(x - r * 0.85, y - r * 0.7);
  ctx.closePath();
  ctx.fill();
}

/** A wraith that fades to intangible during its cloak windows. */
function drawPhantom(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const { x, y, radius: r } = e;
  const cloaked = phantomCloaked(e.age);
  ctx.globalAlpha = cloaked ? 0.22 : 1;

  // Ghost body: a rounded top with a wavy hem.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.1, r, Math.PI, 0);
  const hem = 4;
  for (let i = 0; i <= hem; i += 1) {
    const px = x + r - (i / hem) * r * 2;
    const py = y + r * 0.8 + (i % 2 === 0 ? 0 : r * 0.35);
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Hollow eyes.
  ctx.globalAlpha = cloaked ? 0.3 : 1;
  ctx.fillStyle = 'rgba(10,12,18,0.85)';
  ctx.beginPath();
  ctx.arc(x - r * 0.34, y - r * 0.1, r * 0.16, 0, PI2);
  ctx.arc(x + r * 0.34, y - r * 0.1, r * 0.16, 0, PI2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Round menace with two dark eyes; bobs gently. */
function drawGrunt(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const x = e.x;
  const y = e.y + Math.sin(e.age * 6) * 2;
  const r = e.radius;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, PI2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(10,12,18,0.85)';
  ctx.beginPath();
  ctx.arc(x - r * 0.34, y - r * 0.1, r * 0.17, 0, PI2);
  ctx.arc(x + r * 0.34, y - r * 0.1, r * 0.17, 0, PI2);
  ctx.fill();
}

/** A sharp dart with an upward speed streak. */
function drawRunner(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const { x, y, radius: r } = e;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(x, y - r, x, y - r * 3.2);
  grad.addColorStop(0, e.color);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - r * 0.35, y - r * 3.2, r * 0.7, r * 2.4);
  ctx.restore();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.lineTo(x + r * 0.9, y - r * 0.6);
  ctx.lineTo(x, y - r * 0.05);
  ctx.lineTo(x - r * 0.9, y - r * 0.6);
  ctx.closePath();
  ctx.fill();
}

/** A heavy plated block with bolts; wobbles slowly. */
function drawBrute(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const r = e.radius;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(Math.sin(e.age * 3) * 0.05);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.28);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.roundRect(-r * 0.58, -r * 0.58, r * 1.16, r * 1.16, r * 0.16);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const [bx, by] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.arc(bx * r * 0.72, by * r * 0.72, r * 0.1, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
}

/** A diamond that pulses apart — a visual promise that it splits. */
function drawSplitter(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const { x, y, radius: r } = e;
  const gap = (Math.sin(e.age * 7) * 0.5 + 0.5) * r * 0.28;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x, y - r - gap);
  ctx.lineTo(x + r, y - gap);
  ctx.lineTo(x - r, y - gap);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y + r + gap);
  ctx.lineTo(x + r, y + gap);
  ctx.lineTo(x - r, y + gap);
  ctx.closePath();
  ctx.fill();
}

/** A spinning hexagon with a bright core. */
function drawWeaver(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const r = e.radius;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.age * 3);
  ctx.fillStyle = body;
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, PI2);
  ctx.fill();
  ctx.restore();
}

/** A core disc fronted by segmented armor plates that break one by one. */
function drawArmored(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const { x, y, radius: r } = e;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, PI2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, PI2);
  ctx.stroke();

  if (e.maxArmor > 0) {
    const start = -Math.PI * 0.9;
    const span = Math.PI * 0.8;
    const seg = span / e.maxArmor;
    for (let i = 0; i < e.maxArmor; i += 1) {
      ctx.strokeStyle = i < e.armor ? '#e8edf3' : 'rgba(232,237,243,0.18)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, r + 6, start + i * seg + 0.06, start + (i + 1) * seg - 0.06);
      ctx.stroke();
    }
  }
}

/** A turret with a barrel and a core eye that charges before it fires. */
function drawShooter(ctx: CanvasRenderingContext2D, e: Enemy, body: string) {
  const { x, y, radius: r } = e;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, PI2);
  ctx.fill();
  // Barrel.
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.roundRect(x - r * 0.18, y + r * 0.5, r * 0.36, r * 0.8, r * 0.1);
  ctx.fill();

  const charge = telegraphCharge(e.shootTimer);
  if (charge > 0) {
    drawLaneWarning(ctx, e.lane, y, charge);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 18 * charge;
    ctx.fillStyle = `rgba(255,220,120,${charge})`;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.2 + charge * 0.3), 0, PI2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(10,12,18,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.28, 0, PI2);
    ctx.fill();
  }
}

/** 0..1 wind-up strength in the moment before a shot; else 0. */
function telegraphCharge(shootTimer: number, window = 0.4): number {
  if (shootTimer <= 0 || shootTimer >= window) return 0;
  return 1 - shootTimer / window;
}

/** A glowing warning column down a lane, from y to the goal line. */
function drawLaneWarning(
  ctx: CanvasRenderingContext2D,
  lane: number,
  fromY: number,
  strength: number,
) {
  const lx = laneCenterX(lane);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(lx, fromY, lx, GOAL_LINE_Y);
  grad.addColorStop(0, `rgba(255,90,120,${0.32 * strength})`);
  grad.addColorStop(1, 'rgba(255,90,120,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(lx - 13, fromY, 26, GOAL_LINE_Y - fromY);
  ctx.restore();
}

/** A menacing rotating core with spikes; reddens and pulses when enraged. */
function drawBoss(ctx: CanvasRenderingContext2D, e: Enemy) {
  const { x, y, radius: r } = e;
  const enraged = e.hp <= e.maxHp * BOSS.enrageAt;
  const col = e.hitFlash > 0 ? '#ffffff' : enraged ? '#ff2e63' : e.color;
  const rr = r * (1 + Math.sin(e.age * (enraged ? 9 : 4)) * 0.05);

  // Telegraph: warn the lane(s) it is about to fire down.
  const charge = telegraphCharge(e.shootTimer, 0.35);
  if (charge > 0 && e.y >= BOSS.holdY - 1) {
    for (const lane of bossFireLanes(e.shotsFired, e.lane, enraged)) {
      drawLaneWarning(ctx, lane, y, charge);
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = enraged ? '#ff2e63' : e.color;
  ctx.shadowBlur = 26;

  ctx.save();
  ctx.rotate(e.age * (enraged ? 1.6 : 0.8));
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, rr + 10, 0, PI2);
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * PI2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (rr + 6), Math.sin(a) * (rr + 6));
    ctx.lineTo(Math.cos(a) * (rr + 17), Math.sin(a) * (rr + 17));
    ctx.stroke();
  }
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, PI2);
  ctx.fill();
  ctx.fillStyle = 'rgba(8,8,14,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, rr * 0.52, 0, PI2);
  ctx.fill();
  ctx.fillStyle = charge > 0 ? '#ffffff' : col;
  ctx.shadowBlur = charge > 0 ? 24 : 12;
  ctx.beginPath();
  ctx.arc(0, 0, rr * (0.26 + charge * 0.12), 0, PI2);
  ctx.fill();
  ctx.restore();
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

/**
 * A super-dampener: like a hazard but nastier — twin counter-rotating rings, a
 * bold X, and a hot-violet glow that pulses to read as "this wipes everything".
 */
function drawSuperHazard(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const { x, y, radius } = enemy;
  const pulse = 1 + Math.sin(enemy.age * 10) * 0.16;
  const r = radius * pulse;

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = 26;
  ctx.strokeStyle = enemy.color;

  // Outer ring spins one way, inner ring the other.
  ctx.save();
  ctx.rotate(enemy.age * 2.4);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.rotate(-enemy.age * 3.1);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  // A bold X — the "strip it all" mark.
  const d = r * 0.5;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-d, -d);
  ctx.lineTo(d, d);
  ctx.moveTo(d, -d);
  ctx.lineTo(-d, d);
  ctx.stroke();
  ctx.restore();

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
  // Weapons are round badges, abilities are hexagons, buffs/instants rotating squares.
  const kind = pickup.content.type;
  const pulse = 1 + Math.sin(pickup.age * 8) * 0.08;
  const r = pickup.radius * pulse;

  ctx.save();
  ctx.translate(pickup.x, pickup.y);
  if (kind === 'power') ctx.rotate(Math.sin(pickup.age * 2) * 0.2);
  if (kind === 'ability') ctx.rotate(pickup.age * 1.5);

  ctx.shadowColor = pickup.color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = pickup.color;
  ctx.fillStyle = 'rgba(13,17,23,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (kind === 'weapon') {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (kind === 'ability') {
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.rect(-r, -r, r * 2, r * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Shrink the label until it fits inside the badge.
  const maxWidth = pickup.radius * 2 - 4;
  let fontSize = 11;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  while (ctx.measureText(pickup.label).width > maxWidth && fontSize > 6) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  }
  ctx.fillStyle = pickup.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pickup.label, pickup.x, pickup.y);
}

function drawProjectiles(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowBlur = 12;
  for (const p of game.projectiles) {
    // A fading trail behind each shot; a piercing rail slug streaks longer.
    const trail = (p.pierce ? 46 : 22) + p.radius;
    const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + trail);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(p.x - p.radius * 0.5, p.y, p.radius, trail);

    // Bright head.
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.radius * 0.75, p.radius * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFloaters(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 16px system-ui, sans-serif';
  for (const f of game.floaters) {
    const t = f.life / f.maxLife; // 1 → 0
    // Quick pop-in, then a gentle grow as it rises and fades near the end.
    const pop = Math.min(1, (f.maxLife - f.life) / 0.09);
    const scale = 0.5 + pop * 0.5 + (1 - t) * 0.2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, t * 1.4));
    ctx.translate(f.x, f.y);
    ctx.scale(scale, scale);
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// --------------------------------------------------------------------- hud

function drawHud(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.textBaseline = 'top';

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(String(game.score), 42, 14);

  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(`BEST ${game.bestScore}`, 42, 46);

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 16px system-ui, sans-serif';
  const waveLabel = game.spawner.isBossWave
    ? `WAVE ${game.spawner.wave} · BOSS`
    : `WAVE ${game.spawner.wave}`;
  ctx.fillText(waveLabel, WIDTH - 44, 16);

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
    const pulse = 1 + Math.sin(game.elapsed * 10) * 0.08;
    ctx.save();
    ctx.translate(WIDTH / 2, 24);
    ctx.scale(pulse, pulse);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 10;
    ctx.fillStyle = COLORS.player;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`x${multiplier}`, 0, 0);
    ctx.restore();
  }

  // Active weapon, top-centre in its own colour.
  const weapon = WEAPON_DEFS[game.weapon];
  ctx.textAlign = 'center';
  ctx.fillStyle = weapon.color;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(weapon.name, WIDTH / 2, 44);

  drawHealth(ctx, game);
  drawEffectBar(ctx, game);
  if (game.phase === 'playing') drawAbility(ctx, game);
  drawMenuButton(ctx, game);
}

/** Top-left speaker button reflecting the mute state. */
function drawMuteButton(ctx: CanvasRenderingContext2D, muted: boolean) {
  const cx = 20;
  const cy = 22;
  const r = 13;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.textDim;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Speaker cone.
  const color = muted ? COLORS.textDim : COLORS.text;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 3);
  ctx.lineTo(cx - 2, cy - 3);
  ctx.lineTo(cx + 2, cy - 6);
  ctx.lineTo(cx + 2, cy + 6);
  ctx.lineTo(cx - 2, cy + 3);
  ctx.lineTo(cx - 6, cy + 3);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  if (muted) {
    // A slash for muted.
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy - 5);
    ctx.lineTo(cx + 9, cy + 5);
    ctx.stroke();
  } else {
    // Sound waves.
    ctx.beginPath();
    ctx.arc(cx + 3, cy, 4, -0.8, 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 3, cy, 7, -0.7, 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

/** Top-right button: pause bars during play, a "?" on the menus. */
function drawMenuButton(ctx: CanvasRenderingContext2D, game: Game) {
  const cx = WIDTH - 22;
  const cy = 22;
  const r = 13;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.textDim;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (game.phase === 'playing' && !game.paused) {
    ctx.fillStyle = COLORS.text;
    ctx.fillRect(cx - 4, cy - 5, 3, 10);
    ctx.fillRect(cx + 1, cy - 5, 3, 10);
  } else {
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy + 0.5);
  }
  ctx.restore();
}

function drawBossBar(ctx: CanvasRenderingContext2D, game: Game) {
  const boss = game.enemies.find((e) => e.kind === 'boss');
  if (!boss) return;

  const frac = Math.max(0, boss.hp / boss.maxHp);
  const enraged = boss.hp <= boss.maxHp * BOSS.enrageAt;
  const w = WIDTH - 120;
  const x = 60;
  const y = 66;
  const h = 10;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = enraged ? '#ff2e63' : boss.color;
  ctx.fillRect(x, y, w * frac, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = enraged ? '#ff2e63' : COLORS.text;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(enraged ? 'BOSS · ENRAGED' : 'BOSS', WIDTH / 2, y - 3);
}

function drawAbility(ctx: CanvasRenderingContext2D, game: Game) {
  const def = game.abilityDef;
  const r = 30;
  const cx = WIDTH - r - 14;
  const cy = HEIGHT - r - 12;
  const frac = Math.min(1, game.abilityCharge / def.maxCharge);
  const ready = game.abilityReady;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();
  // A subtle rim so the tap target reads clearly on a busy field.
  ctx.strokeStyle = ready ? def.color : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 5;
  if (ready) {
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 16;
  }
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = ready ? def.color : COLORS.textDim;
  // Short tag so long names (OVERDRIVE) stay inside the badge.
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.name.slice(0, 5), cx, cy);
}

function drawHealth(ctx: CanvasRenderingContext2D, game: Game) {
  const size = 14;
  const gap = 6;
  const y = HEIGHT - 34;
  const maxHealth = game.player.maxHealth;
  for (let i = 0; i < maxHealth; i += 1) {
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
    const x = 16 + maxHealth * (size + gap) + 6;
    ctx.fillText(`+${game.player.shieldCharges}`, x, y + size / 2);
  }
}

function drawEffectBar(ctx: CanvasRenderingContext2D, game: Game) {
  // Show only the active weapon's buffs plus universal ones; other weapons'
  // upgrades are still held, just hidden until you switch back.
  const allWeaponBuffs = new Set(
    Object.values(WEAPON_DEFS).flatMap((w) => w.buffs),
  );
  const currentWeaponBuffs = new Set(WEAPON_DEFS[game.weapon].buffs);
  const buffs = game.effects
    .list()
    .filter(
      ({ def }) =>
        currentWeaponBuffs.has(def.kind) || !allWeaponBuffs.has(def.kind),
    );
  const timed = game.effects.timedList();
  if (buffs.length === 0 && timed.length === 0) return;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 12px system-ui, sans-serif';

  const padX = 8;
  const chipH = 18;
  const gapX = 6;
  const gapY = 5;
  // Keep the strip clear of the bottom-right ability button (drawn on top).
  const rightEdge = WIDTH - 86;
  const leftLimit = 16;

  // Timed bursts (with a countdown) then persistent buffs, as chips in the HUD
  // strip below the goal line so they never overlap the lanes. They flow
  // right-to-left and wrap upward only if a row overflows.
  const timedChips = timed.map(({ def, remaining }) => {
    const label = `${def.label} ${remaining.toFixed(1)}`;
    return { def, label, w: ctx.measureText(label).width + padX * 2 };
  });
  const buffChips = buffs.map(({ def, level }) => {
    const maxLevel = def.maxLevel ?? 1;
    const suffix = level >= maxLevel ? 'MAX' : `${level}`;
    const label = maxLevel > 1 ? `${def.label} ${suffix}` : def.label;
    return { def, label, w: ctx.measureText(label).width + padX * 2 };
  });
  const chips = [...timedChips, ...buffChips];

  let x = rightEdge;
  let y = HEIGHT - 64;
  for (const chip of chips) {
    if (x - chip.w < leftLimit) {
      x = rightEdge;
      y -= chipH + gapY;
    }
    const cx = x - chip.w;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(cx, y - chipH / 2, chip.w, chipH);
    ctx.fillStyle = chip.def.color;
    ctx.fillRect(cx, y - chipH / 2, 3, chipH);
    ctx.fillText(chip.label, cx + padX, y);
    x = cx - gapX;
  }
}

// ---------------------------------------------------------------- overlays

function drawTitle(ctx: CanvasRenderingContext2D, game: Game, time: number) {
  dimScreen(ctx);

  // Neon title: pulsing glow and a gentle breathing scale.
  ctx.save();
  ctx.translate(WIDTH / 2, HEIGHT / 2 - 90);
  ctx.scale(1 + Math.sin(time * 2.2) * 0.02, 1 + Math.sin(time * 2.2) * 0.02);
  ctx.shadowColor = COLORS.player;
  ctx.shadowBlur = 18 + (Math.sin(time * 3) * 0.5 + 0.5) * 16;
  ctx.fillStyle = COLORS.player;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LANE PUSHER', 0, 0);
  ctx.restore();

  if (game.dayId > 0) {
    centered(ctx, `DAILY RUN · ${formatDay(game.dayId)}`, HEIGHT / 2 - 52, 'bold 12px', COLORS.player);
  }

  centered(
    ctx,
    'Tap a lane, or  ←  →  /  A  D',
    HEIGHT / 2 - 20,
    '16px',
    COLORS.text,
  );
  centered(
    ctx,
    'Double-tap your lane to DODGE',
    HEIGHT / 2 + 6,
    '14px',
    COLORS.playerInvuln,
  );
  centered(
    ctx,
    'You fire automatically. Nothing gets past the line.',
    HEIGHT / 2 + 30,
    '14px',
    COLORS.textDim,
  );
  centered(
    ctx,
    'Power-ups are permanent — dodge the pink dampeners.',
    HEIGHT / 2 + 52,
    '14px',
    '#ff5cf0',
  );
  ctx.save();
  ctx.globalAlpha = 0.6 + (Math.sin(time * 3.2) * 0.5 + 0.5) * 0.4;
  centered(ctx, 'PRESS SPACE OR TAP TO START', HEIGHT / 2 + 78, 'bold 16px', COLORS.text);
  ctx.restore();
  centered(
    ctx,
    'Tap ? (top-right) or press H for the guide',
    HEIGHT / 2 + 106,
    '13px',
    COLORS.textDim,
  );
  if (game.bestScore > 0) {
    centered(ctx, `BEST ${game.bestScore}`, HEIGHT / 2 + 136, '14px', COLORS.textDim);
  }
  drawLeaderboard(ctx, HEIGHT / 2 + 172, 5);
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
  drawLeaderboard(ctx, HEIGHT / 2 + 132, 5);
}

function drawLegend(ctx: CanvasRenderingContext2D, resuming: boolean) {
  dimScreen(ctx);

  let y = 60;
  centered(ctx, resuming ? 'PAUSED' : 'GUIDE', y, 'bold 26px', COLORS.player);
  y += 38;

  const section = (title: string) => {
    ctx.fillStyle = COLORS.textDim;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 40, y);
    y += 20;
  };
  const row = (color: string, label: string, desc: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(52, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, y);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(desc, 142, y);
    y += 22;
  };

  section('WEAPONS  (switch by pickup)');
  for (const kind of ['blaster', 'scatter', 'railgun'] as const) {
    const w = WEAPON_DEFS[kind];
    row(w.color, w.name, w.desc);
  }
  section('UPGRADES  (permanent, stackable)');
  for (const d of POWERUP_DEFS.filter((d) => d.type === 'buff')) {
    row(d.color, d.label, d.desc);
  }
  section('BURSTS  (timed)');
  for (const d of POWERUP_DEFS.filter((d) => d.type === 'timed')) {
    row(d.color, d.label, d.desc);
  }
  section('PICKUPS  (instant)');
  for (const d of POWERUP_DEFS.filter((d) => d.type === 'instant')) {
    row(d.color, d.label, d.desc);
  }
  section('ABILITIES  (switch by pickup · SPACE to fire)');
  for (const a of Object.values(ABILITY_DEFS)) row(a.color, a.name, a.desc);

  y += 10;
  centered(ctx, 'Pink DAMPENERS strip one upgrade · violet SUPER DAMPENERS strip ALL', y, '11px', '#ff5cf0');
  y += 20;
  centered(ctx, 'Double-tap your lane to DODGE — slip through enemies & dampeners', y, '11px', COLORS.playerInvuln);
  y += 22;
  centered(ctx, '← →  move   ·   double-tap = dodge   ·   SPACE = ability   ·   ESC / P = pause', y, '11px', COLORS.textDim);
  y += 30;
  centered(
    ctx,
    resuming ? 'TAP or ESC to resume' : 'TAP or H to close',
    y,
    'bold 14px',
    COLORS.text,
  );
}

/**
 * Two compact global boards side by side for the title/game-over screens:
 * TODAY's daily "run of the day" on the left, the ALL-TIME board on the right.
 */
function drawLeaderboard(ctx: CanvasRenderingContext2D, topY: number, maxRows: number) {
  if (leaderboard.status === 'off') return;
  const loading = leaderboard.status !== 'ready';
  drawBoardColumn(ctx, 'TODAY', leaderboard.daily, 40, WIDTH / 2 - 8, topY, maxRows, loading);
  drawBoardColumn(ctx, 'ALL-TIME', leaderboard.scores, WIDTH / 2 + 8, WIDTH - 40, topY, maxRows, loading);
}

function drawBoardColumn(
  ctx: CanvasRenderingContext2D,
  title: string,
  rows: { name: string; score: number }[],
  xLeft: number,
  xRight: number,
  topY: number,
  maxRows: number,
  loading: boolean,
) {
  const mid = (xLeft + xRight) / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.textDim;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(`— ${title} —`, mid, topY);

  const shown = rows.slice(0, maxRows);
  if (shown.length === 0) {
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(loading ? '…' : 'Be the first!', mid, topY + 20);
    return;
  }

  let y = topY + 22;
  shown.forEach((r, i) => {
    ctx.fillStyle = i === 0 ? COLORS.player : COLORS.text;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    // Trim long names so the rank/name never collide with the score.
    const name = r.name.length > 8 ? `${r.name.slice(0, 8)}…` : r.name;
    ctx.fillText(`${i + 1}.${name}`, xLeft, y);
    ctx.textAlign = 'right';
    ctx.fillText(String(r.score), xRight, y);
    y += 18;
  });
}

/** YYYYMMDD → "YYYY-MM-DD" for the daily-run label. */
function formatDay(dayId: number): string {
  const y = Math.floor(dayId / 10000);
  const m = Math.floor((dayId % 10000) / 100);
  const d = dayId % 100;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
