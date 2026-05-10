import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html',
      precompress: false,
      strict: true
    }),
    paths: {
      base: ''
    },
    // the layout registers the worker itself
    serviceWorker: {
      register: false
    },
    // an open tab notices a new deploy and loads it on the next navigation
    version: {
      pollInterval: 60000
    }
  }
};

export default config;
