# Credits & Acknowledgments

**Lane Pusher is original work.** All of the code was written for this project,
and every graphic and sound is generated procedurally at runtime — there are no
sprites, images, audio files, or bundled fonts, and no code was copied from
other games or projects.

That said, the game stands on the shoulders of common genre conventions, a few
well-documented publicly-shared techniques, and open-source tools. This page
credits them.

## Design & genre inspiration

The core idea — two lanes of enemies and power-ups scrolling toward an
auto-firing character you steer between lanes — follows the "lane defense" /
endless-runner mobile genre. No specific game was cloned; these informed the
feel and vocabulary:

- **Zombie Tsunami** — <https://en.wikipedia.org/wiki/Zombie_Tsunami>
- **Archero** (auto-attack + collectible, stackable power-ups) —
  <https://en.wikipedia.org/wiki/Archero>
- Classic vertical **shoot-'em-ups** — bullet-dodging, telegraphed attacks, and
  boss "enrage" phases are long-standing conventions of the genre.
- The **Phantom** enemy's silhouette is an affectionate nod to the classic
  ghost shape from **Pac-Man** — <https://en.wikipedia.org/wiki/Pac-Man>

Everything else — the specific weapons, the permanent-loadout-stripped-by-
"dampener" mechanic, the two-tier drop system, the enemy roster, and the ability
set — was designed for this project.

## Techniques & algorithms

A handful of features implement named, publicly-documented techniques:

- **mulberry32** — the small, public-domain PRNG used to make the headless test
  simulations deterministic. From bryc's PRNG reference collection:
  <https://github.com/bryc/code/blob/master/jshash/PRNGs.md>
- **Web Audio "lookahead" scheduling** — the background-music scheduler follows
  the well-known lookahead pattern popularized by Chris Wilson's *A Tale of Two
  Clocks*. Reference: MDN, *Advanced techniques: Creating and sequencing audio*
  — <https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques>
- **iOS Safari audio unlock** — the resume-on-gesture + silent-buffer trick is a
  widely-shared community workaround for mobile Web Audio. Reference: MDN,
  *Autoplay guide for media and Web Audio APIs* —
  <https://developer.mozilla.org/en-US/docs/Web/Media/Autoplay_guide>
- **AES-256-GCM + HMAC** (leaderboard score submission) — standard cryptography
  via the platform APIs: MDN SubtleCrypto
  (<https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto>) in the
  browser and Node's `crypto` module on the server.

## Built with

Open-source tools and platform APIs:

- **Vite** — <https://vitejs.dev>
- **TypeScript** — <https://www.typescriptlang.org>
- **Vitest** — <https://vitest.dev>
- **Express** — <https://expressjs.com>
- **better-sqlite3** — <https://github.com/WiseLibs/better-sqlite3>
- **tsx** — <https://github.com/privatenumber/tsx>
- **concurrently** — <https://github.com/open-cli-tools/concurrently>
- Platform APIs: **HTML5 Canvas 2D**, the **Web Audio API**, and the
  **Web Crypto API** (all documented on
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API)).

## Assets

None. There are no third-party assets of any kind. All graphics are drawn with
the Canvas 2D API, all audio is synthesized with the Web Audio API, and text
uses the operating system's default UI font stack.

---

*If you believe something here is missing or mis-attributed, please open an
issue — accurate credit matters.*
