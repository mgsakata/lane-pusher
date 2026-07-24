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
  them. Dodge dampeners by switching lanes.
- **Enemies** — grunts, runners, brutes, splitters, weavers, armored, and
  shooters, each distinct by shape and motion. Shooters and bosses telegraph
  their attacks before firing.
- **Boss fights** — every fifth wave; bosses hold, attack in patterns, and
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
