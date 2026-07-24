import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath =
  process.env.LEADERBOARD_DB ?? path.join(here, '..', 'leaderboard.db');

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
