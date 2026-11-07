import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'node',
    include: ['test/node/**/*.test.ts'],
    environment: 'node',
  },
});
