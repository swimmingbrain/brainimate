/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  worker: {
    format: 'es'
  },
  build: {
    // the editor is one chunk of about 600 kB, paper, opentype.js and mediabunny load when first used
    chunkSizeWarningLimit: 650
  },
  // paper only loads on the first boolean and opentype.js with the first text, found that late
  // vite would reload the page in dev
  optimizeDeps: {
    include: ['paper/dist/paper-core', 'opentype.js']
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
