# Dependency Modernization (mini-epic)

Tracked here rather than as a GitHub issue, deliberately. Three batches, ordered by risk. Each batch is its own branch off `development`, verified by the targeted unit suite plus `npm run smoketest:check` after deploy — same cycle as any other change.

## Batch 1 — build/test toolchain (dev-only, lowest risk)

Major-bump vite, svelte, @sveltejs/kit, vitest, and their satellites (esbuild, postcss) to current. These never run in production; breakage shows up loudly at build/test time.

- Svelte 4 → 5 is the big one. The app uses Svelte 4 idioms throughout, and Svelte 5 runs them in compatibility mode — expect this bump to be mostly config churn, but budget time for the web-components build (`vite.config.components.js`), which compiles custom elements and is the most likely casualty.
- If Svelte 5 turns into a slog, split it out: vite/vitest/kit can move first on Svelte 4.
- Verify: full `npx vitest run`, `npm run build`, rebuild web components, smoketest.

## Batch 2 — runtime deps (small, targeted)

Minor/patch bumps: nodemailer (direct, admin email), plus whatever `npm update` pulls transitively (undici, ws come in under the node adapter). No API changes expected.

- Verify: registration flow sends admin email (manual or existing test), smoketest.

## Batch 3 — retire `jsonld-rdfa-parser` (the real work)

This package is unmaintained and anchors a fossilized transitive chain (jsdom 13, `request`, xmldom 0.1.x). It should be removed, not upgraded.

- First: find its actual call sites and determine what the RDFa path still does that the harmonizer system doesn't.
- Likely outcome: the JSON-LD/graph-model work in epic 270 supersedes it — if so, removal rides on 270 and this batch is just "delete after 270 lands."
- If something still depends on RDFa extraction, port that one behavior to the HTML handler (CSS-selector extraction) and then delete.
- Verify: grep for imports, run indexing over a devdemo page that exercised the RDFa path, smoketest.

## Done means

`npm audit` reports nothing above moderate; `package-lock.json` no longer contains jsdom 13 / `request` / xmldom 0.1.x; smoketest golden unchanged (or diffs explained) after each batch.
