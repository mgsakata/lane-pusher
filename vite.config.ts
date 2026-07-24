import { defineConfig } from 'vite';

// In dev, the game is served by Vite and API calls to /api are proxied to the
// leaderboard server. In production a single Node server serves both.
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
