import {
  ABILITY,
  BOSS,
  COLORS,
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
} from './config';
import type { Game } from './game';
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
) {
  drawBackground(ctx, game);

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
  drawFlash(ctx, game);

  drawHud(ctx, game);
  drawMuteButton(ctx, muted);
  drawBossBar(ctx, game);
  if (game.phase === 'title' && !game.showLegend) drawTitle(ctx, game);
  if (game.phase === 'gameover' && !game.showLegend) drawGameOver(ctx, game);
  if (game.paused || game.showLegend) drawLegend(ctx, game.paused);
}

// -------------------------------------------------------------- atmosphere

function drawBackground(ctx: CanvasRenderingContext2D, game: Game) {
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, '#0b1120');
  grad.addColorStop(1, '#05070d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of STARS) {
    const y = (s.y + game.elapsed * 34 * s.z) % HEIGHT;
    ctx.fillStyle = `rgba(130,180,255,${s.z * 0.5})`;
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
  const { x, lane, invuln, shieldCharges } = game.player;
  const y = PLAYER.y;
  const r = PLAYER.radius;

  // Blink while invulnerable so the state is readable at a glance.
  if (invuln > 0 && Math.floor(invuln * 20) % 2 === 0) return;

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
    case 'weaver':
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const px = x + Math.cos(a) * radius;
        const py = y + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
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

  // A shooter's barrel points down the lane it fires along.
  if (enemy.kind === 'shooter') {
    ctx.fillStyle = enemy.color;
    ctx.fillRect(x - 4, y + radius - 4, 8, 12);
  }

  // Armor reads as a plated arc across the top that shrinks as it breaks.
  if (enemy.armor > 0) {
    const frac = enemy.armor / enemy.maxArmor;
    const start = -Math.PI * 0.85;
    const end = -Math.PI * 0.15;
    ctx.strokeStyle = '#e8edf3';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, radius + 6, start, start + (end - start) * frac);
    ctx.stroke();
    ctx.globalAlpha = 1;
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
  // Weapon pickups are round badges; buff/instant pickups are rotating squares.
  const isWeapon = pickup.content.type === 'weapon';
  const pulse = 1 + Math.sin(pickup.age * 8) * 0.08;
  const r = pickup.radius * pulse;

  ctx.save();
  ctx.translate(pickup.x, pickup.y);
  if (!isWeapon) ctx.rotate(Math.sin(pickup.age * 2) * 0.2);

  ctx.shadowColor = pickup.color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = pickup.color;
  ctx.fillStyle = 'rgba(13,17,23,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (isWeapon) ctx.arc(0, 0, r, 0, Math.PI * 2);
  else ctx.rect(-r, -r, r * 2, r * 2);
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
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.player;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`x${multiplier}`, WIDTH / 2, 16);
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
  const cx = WIDTH - 34;
  const cy = HEIGHT - 28;
  const r = 20;
  const frac = Math.min(1, game.abilityCharge / ABILITY.maxCharge);
  const ready = game.abilityReady;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.strokeStyle = ABILITY.color;
  ctx.lineWidth = 4;
  if (ready) {
    ctx.shadowColor = ABILITY.color;
    ctx.shadowBlur = 14;
  }
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = ready ? ABILITY.color : COLORS.textDim;
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ABILITY.name, cx, cy);
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
  const buffs = game.effects.list();
  if (buffs.length === 0) return;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 12px system-ui, sans-serif';

  const padX = 8;
  const chipH = 18;
  const gapX = 6;
  const gapY = 5;
  const rightEdge = WIDTH - 16;
  const leftLimit = 16;

  // Held buffs read as chips laid out in the HUD strip below the goal line, so
  // they never overlap the lanes where enemies and the player actually are.
  // They flow right-to-left and wrap upward only if a row overflows.
  const chips = buffs.map(({ def, level }) => {
    const maxLevel = def.maxLevel ?? 1;
    const suffix = level >= maxLevel ? 'MAX' : `${level}`;
    const label = maxLevel > 1 ? `${def.label} ${suffix}` : def.label;
    return { def, label, w: ctx.measureText(label).width + padX * 2 };
  });

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
  section('PICKUPS  (instant)');
  for (const d of POWERUP_DEFS.filter((d) => d.type === 'instant')) {
    row(d.color, d.label, d.desc);
  }
  section('ABILITY');
  row(ABILITY.color, ABILITY.name, ABILITY.desc);

  y += 10;
  centered(ctx, 'Dodge pink DAMPENERS — they strip your upgrades', y, '11px', '#ff5cf0');
  y += 22;
  centered(ctx, '← →  move   ·   SPACE = PULSE   ·   ESC / P = pause', y, '11px', COLORS.textDim);
  y += 30;
  centered(
    ctx,
    resuming ? 'TAP or ESC to resume' : 'TAP or H to close',
    y,
    'bold 14px',
    COLORS.text,
  );
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
