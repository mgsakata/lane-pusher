import { describe, expect, it } from 'vitest';
import { SoundEngine } from './audio';
import { Game } from './game';
import { ScriptedInput } from './testing/sim';

// There is no AudioContext in the test environment, so this only verifies the
// engine wires up and voicing events is a safe no-op until audio is unlocked.
describe('SoundEngine', () => {
  it('constructs and attaches without an AudioContext', () => {
    const engine = new SoundEngine();
    const game = new Game(new ScriptedInput());
    expect(() => engine.attach(game)).not.toThrow();
  });

  it('emitting gameplay events does not throw before audio is unlocked', () => {
    const engine = new SoundEngine();
    const game = new Game(new ScriptedInput());
    engine.attach(game);
    expect(() => {
      game.start();
      for (let i = 0; i < 300; i += 1) game.update(1 / 60);
    }).not.toThrow();
  });

  it('toggling mute flips the flag', () => {
    const engine = new SoundEngine();
    const before = engine.muted;
    engine.toggleMute();
    expect(engine.muted).toBe(!before);
  });
});
