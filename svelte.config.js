import mdsvexConfig from "./mdsvex.config.js";
import { mdsvex } from "mdsvex";

// On Railway (or any container) build with adapter-node; everywhere else keep
// adapter-auto so local dev and other hosts are unchanged. Gate on an explicit
// ADAPTER=node (set by the Dockerfile/template) and Railway's auto-injected
// RAILWAY_ENVIRONMENT as a fallback.
const onRailway =
  process.env.ADAPTER === 'node' || !!process.env.RAILWAY_ENVIRONMENT;

const adapter = onRailway
  ? (await import('@sveltejs/adapter-node')).default
  : (await import('@sveltejs/adapter-auto')).default;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    csrf: {
      checkOrigin: false
    }
  },
  extensions: [".svelte", ".md"],
  preprocess: [mdsvex(mdsvexConfig)]
};

export default config;
