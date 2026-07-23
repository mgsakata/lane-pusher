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
  WEAPON_DEFS,
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
  drawEnemyShots(ctx, game);
  if (game.phase === 'playing' || game.phase === 'choosing') {
    drawPlayer(ctx, game);
  }
  drawParticles(ctx, game);
  drawFloaters(ctx, game);

  ctx.restore();

  drawHud(ctx, game);
  drawBossBar(ctx, game);
  if (game.phase === 'title') drawTitle(ctx, game);
  if (game.phase === 'gameover') drawGameOver(ctx, game);
  if (game.phase === 'choosing') drawChoice(ctx, game);
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
  ctx.shadowBlur = 12;
  for (const p of game.projectiles) {
    // Each weapon tints its shots; a piercing rail slug draws as a long streak.
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    const stretch = p.pierce ? 3 : 1.8;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.radius * 0.7, p.radius * stretch, 0, 0, Math.PI * 2);
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

  // Active weapon, top-centre in its own colour.
  const weapon = WEAPON_DEFS[game.weapon];
  ctx.textAlign = 'center';
  ctx.fillStyle = weapon.color;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(weapon.name, WIDTH / 2, 44);

  drawHealth(ctx, game);
  drawEffectBar(ctx, game);
  if (game.phase === 'playing' || game.phase === 'choosing') {
    drawAbility(ctx, game);
  }
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

function drawChoice(ctx: CanvasRenderingContext2D, game: Game) {
  dimScreen(ctx);
  centered(ctx, 'CHOOSE AN UPGRADE', HEIGHT * 0.28, 'bold 24px', COLORS.text);

  const n = game.offers.length;
  const cardW = 132;
  const cardH = 156;
  const gap = 12;
  const totalW = n * cardW + (n - 1) * gap;
  let x = (WIDTH - totalW) / 2;
  const y = HEIGHT / 2 - cardH / 2;

  game.offers.forEach((offer, i) => {
    const selected = i === game.offerIndex;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 12);
    ctx.fillStyle = 'rgba(20,26,38,0.96)';
    ctx.fill();
    ctx.strokeStyle = offer.color;
    ctx.lineWidth = selected ? 4 : 2;
    if (selected) {
      ctx.shadowColor = offer.color;
      ctx.shadowBlur = 18;
    }
    ctx.stroke();
    ctx.restore();

    // Color swatch, label, and description stacked in the card.
    ctx.fillStyle = offer.color;
    ctx.beginPath();
    ctx.arc(x + cardW / 2, y + 40, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = offer.color;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(offer.label, x + cardW / 2, y + cardH * 0.6);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(offer.desc, x + cardW / 2, y + cardH * 0.78);

    x += cardW + gap;
  });

  centered(
    ctx,
    'TAP A CARD   ·   ←  →  then SPACE',
    HEIGHT * 0.72,
    '13px',
    COLORS.textDim,
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
