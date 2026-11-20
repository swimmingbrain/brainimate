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
    // github pages serves a project site under /<repository>, the deploy workflow hands that in.
    // empty for a site of its own domain and for dev, tests and previews
    paths: {
      base: process.env.BASE_PATH ?? ''
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
