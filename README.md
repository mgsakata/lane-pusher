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

Then open the printed local URL (default <http://localhost:5173>) and tap once
to start. (Browsers require a gesture before audio can begin.)

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

## Tech

- Vanilla **TypeScript** + **HTML5 Canvas**, bundled with **Vite** — no game
  engine.
- Procedural visuals (glow, trails, particles, parallax starfield) and fully
  synthesized audio via the **Web Audio API**.
- A decoupled game core with a typed event bus; tested with **Vitest**,
  including a headless full-game simulation.

```bash
npm test         # unit + balance + simulation tests
npm run build    # production build
```
