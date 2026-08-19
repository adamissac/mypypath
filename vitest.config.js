import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // Rules tests need a live Firestore emulator. Run them via `npm run test:rules`.
    exclude: ['node_modules/**', 'tests/rules/**'],
  },
});
