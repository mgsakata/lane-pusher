# Lane Pusher

A fast, neon-arcade lane-defense game for the browser. Enemies and power-ups
stream down two lanes toward you; switch lanes, auto-fire, build a permanent
loadout, and survive escalating waves and boss fights.

Everything — art and sound — is generated in code. No image or audio files,
so it's tiny, crisp at any resolution, and works offline.

## Play

```bash
npm install
npm run dev
```

`npm run dev` runs both the game (Vite, <http://localhost:5173>) and the
leaderboard API (<http://localhost:8787>, proxied at `/api`). Open the game URL
and tap once to start. (Browsers require a gesture before audio can begin.)

The game runs fully without the API — the leaderboard just hides itself if the
server is unreachable.

## Controls

- **Move lanes** — tap a lane, or `←` `→` / `A` `D`
- **Dodge** — double-tap the lane you're already in: flick briefly intangible
  and slip through enemies, shots, and dampeners, then a short cooldown
- **PULSE ability** — `Space` (kill-charged screen-clear + brief shield)
- **Pause / guide** — `Esc` or `P` (also the `?` button, top-right)
- **Help** — `H`, or the `?` button
- **Mute** — the speaker button, top-left

You fire automatically. Nothing gets past the line.

## Gameplay

- **Weapons** — Blaster (fast single shots), Scatter (both-lane pellets),
  Railgun (slow, piercing, heavy). Switch by picking one up; each is upgraded
  only by its own buffs.
- **Power-ups are permanent** — they build up until a pink **dampener** strips
  one, or a rare violet **super dampener** wipes them all. Switch lanes or dodge
  to avoid them.
- **Enemies** — grunts, runners, brutes, splitters, weavers, armored, shooters,
  dashers, and phantoms, each distinct by shape and motion. Shooters and bosses
  telegraph their attacks before firing.
- **Elites** — a gold **warden** shields every enemy in its lane from a killing
  blow until you take the warden down first.
- **Boss fights** — every fifth wave; bosses hold and attack in patterns —
  aiming down a lane, then slamming both at once on a telegraphed beat — and
  enrage below half health.

## Global leaderboard

A small **Express + SQLite** service (in `server/`) backs an online scoreboard.

- Each run requests a single-use, server-issued session key.
- The final score + name is **AES-GCM encrypted** with that key (browser Web
  Crypto ↔ Node crypto) and never sent as plain JSON; the server checks the
  session is valid, unused, and time-plausible, and rate-limits submissions.
- This deters casual tampering, not a determined cheater — the client holds the
  key. A stronger option is server-side replay validation using the game's
  deterministic simulation (submit seed + inputs, replay to confirm the score).

In production, one Node server serves both the built game and the API:

```bash
npm start        # builds the game, then serves game + API on :8787
```

### Deploying with a persistent leaderboard

The scoreboard is a single SQLite file. By default it's written next to the
code (`leaderboard.db`), which is fine locally but gets **wiped on every deploy**
on hosts with an ephemeral filesystem (Railway, Render, Fly, most containers) —
each release starts from a fresh disk.

To keep scores across releases, put the DB on persistent storage and point the
server at it with the `LEADERBOARD_DB` env var (its `-wal`/`-shm` siblings follow
automatically). The server creates the directory on boot and logs the path it
uses.

On **Railway** specifically:

1. In the service, **Add a Volume** and set its mount path to `/data`.
2. Add a variable **`LEADERBOARD_DB=/data/leaderboard.db`**.
3. Redeploy. From now on the DB lives on the volume and survives releases.

The mount path and env var must agree (`/data` → `/data/leaderboard.db`). The
same pattern works on any host: mount a persistent disk, set `LEADERBOARD_DB` to
a file on it. Existing scores from the old ephemeral file don't carry over — the
first deploy on the volume starts fresh, then persists from there on.

## Tech

- Vanilla **TypeScript** + **HTML5 Canvas**, bundled with **Vite** — no game
  engine.
- Procedural visuals (glow, trails, particles, parallax starfield) and fully
  synthesized audio via the **Web Audio API**.
- A decoupled game core with a typed event bus; tested with **Vitest**,
  including a headless full-game simulation.

```bash
npm test               # unit + balance + simulation tests
npm run build          # production build of the game
npm run typecheck:server
```

## Credits

Lane Pusher is original work with no copied code or assets (all art and audio
are generated procedurally). See [CREDITS.md](CREDITS.md) for genre inspiration,
the named techniques it builds on, and the open-source tools used — each with a
link to its source.
