import { defineConfig } from 'vite';

// Relative base so the static bundle works under any host path
// (e.g. GitHub Pages project subpaths) without reconfiguration.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    // Playwright specs live in e2e/ and run via `npm run test:e2e`.
    include: ['src/**/*.test.ts'],
  },
});
