import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  env: {
    SERVER_URL: process.env.SERVER_URL || '',
  },
});
