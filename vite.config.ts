/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  worker: {
    format: 'es'
  },
  // paper only loads on the first boolean, found that late vite would reload the page in dev
  optimizeDeps: {
    include: ['paper/dist/paper-core']
  },
  server: {
    watch: {
      // projects and exports kept next to the checkout must not trigger reloads
      ignored: ['**/*.brainimate', '**/*.gif', '**/*.mp4', '**/*.webm', '**/*.png']
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
