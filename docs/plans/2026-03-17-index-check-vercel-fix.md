# Fix: debug/index-check 500s on Vercel

**Status:** Not urgent
**Route:** `src/routes/debug/index-check/+server.js`

## Problem

The endpoint uses `readFileSync` with a path derived from `import.meta.url` to load `test-urls.yaml` at runtime. This works locally but 500s on Vercel because the YAML file isn't included in the serverless function bundle and/or `import.meta.url` resolves to a different path in that environment.

## Fix options

1. **Inline the config** -- import the YAML content as a static string or convert to a `.js` export
2. **Use Vite's `?raw` import** -- `import configRaw from './test-urls.yaml?raw'` to bundle the file contents at build time
3. **Convert to JSON** and use a standard import
