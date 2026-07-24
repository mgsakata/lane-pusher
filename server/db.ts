import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Point LEADERBOARD_DB at a PERSISTENT path (e.g. a mounted volume like
// /data/leaderboard.db) so scores survive redeploys. Without it the file lives
// beside the code, which many hosts (Railway, etc.) wipe on every release.
export const dbPath =
  process.env.LEADERBOARD_DB ?? path.join(here, '..', 'leaderboard.db');

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
    created INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
`);

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
}
