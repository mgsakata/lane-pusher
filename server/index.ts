import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, type ScoreRow, type SessionRow } from './db';
import { decryptPayload, makeSessionKey } from './crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, '..', 'dist');

const PORT = Number(process.env.PORT ?? 8787);
const SESSION_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours
const MAX_SCORE = 50_000_000;
/**
 * Loose ceiling used only for an implausibility check (score earned too fast).
 * Kept generous so a genuine hot streak — GREED x2.5 stacked with a high combo
 * on a bomb clear — is never rejected; the average over a real run stays far
 * below this.
 */
const MAX_POINTS_PER_SECOND = 6000;
const MAX_NAME_LENGTH = 12;
const BOARD_LIMIT = 50;

const app = express();
app.use(express.json({ limit: '8kb' }));

// ------------------------------------------------------------ rate limiting

const hits = new Map<string, number[]>();

function rateLimit(bucket: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(bucket, recent);
  return recent.length <= max;
}

function clientIp(req: express.Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// ------------------------------------------------------------------- routes

/** Start a game session: mint a single-use key the client encrypts its score with. */
app.post('/api/session', (req, res) => {
  if (!rateLimit(`session:${clientIp(req)}`, 40, 60_000)) {
    return res.status(429).json({ error: 'slow down' });
  }
  db.prepare('DELETE FROM sessions WHERE issued < ?').run(
    Date.now() - SESSION_MAX_AGE_MS,
  );

  const sessionId = crypto.randomUUID();
  const key = makeSessionKey();
  db.prepare('INSERT INTO sessions (id, key, issued, used) VALUES (?, ?, ?, 0)').run(
    sessionId,
    key,
    Date.now(),
  );
  res.json({ sessionId, key: key.toString('base64') });
});

/** Top scores, highest first. */
app.get('/api/scores', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), BOARD_LIMIT);
  const scores = db
    .prepare(
      'SELECT name, score, wave, created FROM scores ORDER BY score DESC, created ASC LIMIT ?',
    )
    .all(limit) as ScoreRow[];
  res.json({ scores });
});

/** Submit an encrypted score bound to a session. */
app.post('/api/scores', (req, res) => {
  if (!rateLimit(`submit:${clientIp(req)}`, 15, 60_000)) {
    return res.status(429).json({ error: 'slow down' });
  }

  const { sessionId, iv, data } = req.body ?? {};
  if (
    typeof sessionId !== 'string' ||
    typeof iv !== 'string' ||
    typeof data !== 'string'
  ) {
    return res.status(400).json({ error: 'bad request' });
  }

  const session = db
    .prepare('SELECT key, issued, used FROM sessions WHERE id = ?')
    .get(sessionId) as SessionRow | undefined;
  if (!session) return res.status(400).json({ error: 'invalid session' });
  if (session.used) return res.status(409).json({ error: 'session already used' });

  let payload: unknown;
  try {
    payload = decryptPayload(session.key, iv, data);
  } catch {
    return res.status(400).json({ error: 'decrypt failed' });
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const score = Math.floor(Number(body.score));
  const wave = Math.max(0, Math.floor(Number(body.wave) || 0));
  const name =
    String(body.name ?? '')
      .replace(/[^\x20-\x7E]/g, '')
      .trim()
      .slice(0, MAX_NAME_LENGTH) || 'ANON';

  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return res.status(400).json({ error: 'bad score' });
  }

  const age = Date.now() - session.issued;
  if (age > SESSION_MAX_AGE_MS) return res.status(400).json({ error: 'session expired' });
  if (age < (score / MAX_POINTS_PER_SECOND) * 1000) {
    return res.status(400).json({ error: 'implausible score' });
  }

  // Consume the session (single use), then record the score.
  db.prepare('UPDATE sessions SET used = 1 WHERE id = ?').run(sessionId);
  db.prepare(
    'INSERT INTO scores (name, score, wave, created) VALUES (?, ?, ?, ?)',
  ).run(name, score, wave, Date.now());

  const ranked = db
    .prepare('SELECT COUNT(*) AS n FROM scores WHERE score > ?')
    .get(score) as { n: number };
  res.json({ ok: true, rank: ranked.n + 1 });
});

// ------------------------------------------------ static game (production)

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not found' });
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) res.status(404).end();
    });
  });
}

app.listen(PORT, () => {
  console.log(`lane-pusher leaderboard API on http://localhost:${PORT}`);
});
