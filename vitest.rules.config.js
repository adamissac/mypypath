import { defineConfig } from 'vitest/config';

// Firestore rules suite. Needs a live emulator, so it is excluded from the
// default run in vitest.config.js and gets its own config here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.js'],
    exclude: ['node_modules/**'],
    testTimeout: 20000,
  },
});
