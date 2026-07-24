import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Where the SQLite file lives, in order of preference:
//   1. LEADERBOARD_DB, if set explicitly.
//   2. A Railway volume: Railway injects RAILWAY_VOLUME_MOUNT_PATH whenever a
//      volume is attached, so once you add one the DB lands on it automatically
//      — no extra env var needed.
//   3. Beside the code (ephemeral: wiped on every redeploy). Local-dev default.
export const volumeDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
export const dbPath =
  process.env.LEADERBOARD_DB ||
  (volumeDir
    ? path.join(volumeDir, 'leaderboard.db')
    : path.join(here, '..', 'leaderboard.db'));

// Ensure the directory exists (a fresh volume mount may be empty).
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
console.log(`leaderboard db: ${dbPath}`);

/** The lightweight file-backed store: one SQLite file. */
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id     TEXT PRIMARY KEY,
    key    BLOB NOT NULL,
    issued INTEGER NOT NULL,
    used   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS scores (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL,
    score   INTEGER NOT NULL,
    wave    INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL,
    day     INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
`);

// Migrate older databases created before the daily board existed: add the
// `day` column and backfill it from each row's created timestamp (UTC).
const scoreCols = db.prepare('PRAGMA table_info(scores)').all() as { name: string }[];
if (!scoreCols.some((c) => c.name === 'day')) {
  db.exec('ALTER TABLE scores ADD COLUMN day INTEGER NOT NULL DEFAULT 0');
  const rows = db.prepare('SELECT id, created FROM scores').all() as {
    id: number;
    created: number;
  }[];
  const setDay = db.prepare('UPDATE scores SET day = ? WHERE id = ?');
  const backfill = db.transaction((items: typeof rows) => {
    for (const r of items) {
      const d = new Date(r.created);
      const dayId =
        d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
      setDay.run(dayId, r.id);
    }
  });
  backfill(rows);
}

db.exec('CREATE INDEX IF NOT EXISTS idx_scores_day ON scores(day, score DESC)');

export interface SessionRow {
  key: Buffer;
  issued: number;
  used: number;
}

export interface ScoreRow {
  name: string;
  score: number;
  wave: number;
  created: number;
  day: number;
}
