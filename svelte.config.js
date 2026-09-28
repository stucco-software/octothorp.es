import mdsvexConfig from "./mdsvex.config.js";
import { mdsvex } from "mdsvex";

// On Railway (or any container) build with adapter-node; everywhere else use
// adapter-vercel. Gate on an explicit ADAPTER=node (set by the
// Dockerfile/template) and Railway's auto-injected RAILWAY_ENVIRONMENT as a
// fallback.
//
// adapter-vercel is depended on directly rather than reached through
// adapter-auto. adapter-auto resolves the real adapter at build time and pins
// it to a major of its own choosing (it pinned adapter-vercel 4, which refuses
// to build on Node > 20), so the deployed runtime was decided during the build
// instead of in the lockfile. Naming it here keeps that choice reviewable.
const onRailway =
  process.env.ADAPTER === 'node' || !!process.env.RAILWAY_ENVIRONMENT;

const adapter = onRailway
  ? (await import('@sveltejs/adapter-node')).default
  : (await import('@sveltejs/adapter-vercel')).default;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Pin the serverless runtime explicitly. Left unset, adapter-vercel derives
    // it from whatever Node the build happens to run on, which is how a Vercel
    // Node upgrade broke the deploy without any change on our side.
    adapter: onRailway ? adapter() : adapter({ runtime: 'nodejs24.x' }),
    csrf: {
      checkOrigin: false
    }
  },
  extensions: [".svelte", ".md"],
  preprocess: [mdsvex(mdsvexConfig)]
};

export default config;
