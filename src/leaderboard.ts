export interface ScoreRow {
  name: string;
  score: number;
  wave: number;
  created: number;
}

interface Session {
  sessionId: string;
  keyBytes: Uint8Array;
}

const API = '/api';

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(str: string): Uint8Array {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Talks to the leaderboard API. All submissions are AES-GCM encrypted with a
 * single-use, server-issued session key and never sent as plain JSON. If the
 * server is unreachable the game plays on normally with no leaderboard.
 */
class Leaderboard {
  scores: ScoreRow[] = [];
  /** 'off' means the server is unavailable — the game just hides the board. */
  status: 'idle' | 'loading' | 'ready' | 'off' = 'idle';

  private session: Session | null = null;
  private readonly boardSize = 10;

  async refresh(): Promise<void> {
    if (this.status === 'idle') this.status = 'loading';
    try {
      const res = await fetch(`${API}/scores?limit=${this.boardSize}`);
      if (!res.ok) throw new Error('bad status');
      const data = (await res.json()) as { scores: ScoreRow[] };
      this.scores = data.scores ?? [];
      this.status = 'ready';
    } catch {
      this.status = 'off';
    }
  }

  /** Requests a fresh session key at the start of each run. */
  async startSession(): Promise<void> {
    this.session = null;
    try {
      const res = await fetch(`${API}/session`, { method: 'POST' });
      if (!res.ok) throw new Error('bad status');
      const { sessionId, key } = (await res.json()) as {
        sessionId: string;
        key: string;
      };
      this.session = { sessionId, keyBytes: fromBase64(key) };
    } catch {
      this.session = null;
    }
  }

  /** Whether `score` would land on the visible board. */
  qualifies(score: number): boolean {
    if (this.status === 'off' || score <= 0) return false;
    if (this.scores.length < this.boardSize) return true;
    return score > this.scores[this.scores.length - 1].score;
  }

  async submit(name: string, score: number, wave: number): Promise<boolean> {
    if (!this.session) return false;
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        this.session.keyBytes as BufferSource,
        'AES-GCM',
        false,
        ['encrypt'],
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = new TextEncoder().encode(JSON.stringify({ name, score, wave }));
      const cipher = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
      );

      const res = await fetch(`${API}/scores`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.session.sessionId,
          iv: toBase64(iv),
          data: toBase64(cipher),
        }),
      });
      this.session = null; // single use, win or lose
      if (!res.ok) return false;
      await this.refresh();
      return true;
    } catch {
      this.session = null;
      return false;
    }
  }
}

export const leaderboard = new Leaderboard();
