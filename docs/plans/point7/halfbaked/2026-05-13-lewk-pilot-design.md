# lewk Pilot — Style Foundation Swap

**Date:** 2026-05-13
**Status:** Approved, ready for implementation

## Goal

Adopt **lewk** (local checkout at `~/dev/lewk/`) as the OP site's CSS foundation while preserving OP's current visual identity. Lewk's token system, layout primitives, and component classes become available throughout the codebase. The visible "frame" of the site (Header, Nav, Footer, layout shell) gets refactored to use lewk primitives properly. The rest of the codebase keeps working unchanged via a small token-compatibility shim.

This is a **foundation swap, not a visual redesign**. Per-component styling for ResultCard, MultiPassEncoder, Loading, etc. stays as-is for now and inherits the new tokens via the shim.

## Scope

### In scope

1. Drop `lewk.css` into `static/`, wire it into `src/app.html`.
2. Replace `static/var.css` with an OP theme + compatibility shim (~30 lines).
3. Set `data-theme="op"` on the `<html>` element in `src/app.html`.
4. Refactor shell components to use lewk primitives:
   - `Header.svelte`
   - `Nav.svelte`
   - `Footer.svelte`
   - `LayoutSidebar.svelte`
   - `+layout.svelte`
5. Verify nothing visually breaks across the major routes (`/`, `/~`, `/explore`, `/domains`, `/webrings`, `/register`).

### Out of scope (deferred — see Deferred Work below)

- Refactoring non-shell components.
- Refactoring per-route style blocks.
- Live theme/font switching (`themer.js`).
- Defining additional themes beyond `op`.
- Touching the docs site or prismjs theming.

## Architecture

### Stylesheet load order

In `src/app.html`, change from:
```
reset.css → var.css → fonts.css → global.css
```
To:
```
reset.css → lewk.css → fonts.css → op-theme.css → global.css
```

- `reset.css` stays (piccalilli reset; lewk doesn't ship its own and the existing reset is fine).
- `lewk.css` ships its defaults and base tokens.
- `fonts.css` stays (loads Instrument Serif, Inter, OCRA, DOS).
- `op-theme.css` (new file, replaces `var.css`) defines `[data-theme="op"]` and the token shim. Loaded *after* lewk so it overrides.
- `global.css` stays. Continues to consume the OP token names, which now resolve to lewk values via the shim.

### `op-theme.css` contents

```css
/* OP theme — overrides lewk's base pair + fonts */
[data-theme="op"] {
  --fg: #011C27;       /* current --dark-blue */
  --bg: #f2f2f2;       /* current --light-gray */
  --accent: #3c7efb;   /* current --light-blue */

  --font-serif: "Instrument Serif", Georgia, "Times New Roman", serif;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "OCRA", ui-monospace, "SF Mono", Menlo, monospace;
  --font-body: var(--font-serif);
  --font-display: var(--font-sans);
  --font-ui: var(--font-mono);
}

/* Compatibility shim — legacy OP tokens still referenced across
 * components and routes. Resolves them to lewk equivalents.
 * Remove entries as components/routes are migrated. */
:root {
  --txt-color: var(--fg);
  --bg-color: var(--bg);
  --dark-blue: var(--fg);
  --light-blue: var(--accent);
  --pale-green: var(--buffer);

  --serif-stack: var(--font-serif);
  --sans-stack: var(--font-sans);
  --mono-stack: var(--font-mono);

  --baseline: 1.5rem;   /* vertical rhythm — not a theme value, kept */

  /* Type scale shim — OP --txt-* → lewk --fs-* (closest match) */
  --txt--2: var(--fs-1);
  --txt--1: var(--fs-2);
  --txt-0:  var(--fs-3);
  --txt-1:  var(--fs-4);
  --txt-2:  var(--fs-5);
  --txt-3:  var(--fs-6);
  --txt-4:  var(--fs-7);

  /* Leading shim — kept at current values; not worth re-deriving */
  --lead-1: 1rem;
  --lead-1-half: 1.5rem;
  --lead-2: 2rem;
  --lead-3: 3rem;
}
```

### `src/app.html` change

Add `data-theme="op"` to `<html>`:
```html
<html lang="en" data-theme="op">
```

### Shell component refactors

Goal: replace ad-hoc flex/grid in shell components with lewk primitives, but keep the same DOM/markup shape so nothing else breaks.

| Component | Current approach | Target |
|-----------|-----------------|--------|
| `Header.svelte` | `<header>` with custom flex, dotted border-bottom | Use `.section` for hairline rule; keep flex centering |
| `Nav.svelte` | `<nav><ul>` with custom grid + dotted border | Apply `.nav` class on the `<nav>`; keep current items |
| `Footer.svelte` | `<footer>` with two nav blocks + image | Apply `.footer` class; use `.cluster` for nav link row |
| `LayoutSidebar.svelte` | `.layout` flex wrapper with `main` | Replace `.layout` with lewk's `.split` (sidebar + main) |
| `+layout.svelte` | `.container { padding-inline: 2ch }` | Use `.page` from lewk for the page container |

Each component's `<style>` block gets reviewed: if its rules are now redundant (lewk's `.nav`/`.footer`/etc. provide them), they get removed. Otherwise they stay.

## Verification

Manual smoke test against the local dev server (`instance` from `.env`):

1. `/` — landing page loads, layout intact
2. `/~` — terms list
3. `/~/demo` — single term page
4. `/explore` — discovery page
5. `/domains` — domain list
6. `/webrings` — webring list
7. `/register` — registration form (input styles preserved)
8. `/about` — content page
9. A `/get/everything/thorped/?o=demo` JSON endpoint — confirm no regression (this is unaffected but sanity check)

For each: visual check that nothing is grossly broken (missing background, illegible text, collapsed layout). Pixel-perfect parity with the current site is **not** a goal — the visible frame will look different.

## Deferred Work — Next-Step Checklist

These were explicitly excluded from the pilot. Track for follow-up:

### Component refactors (highest visual payoff first)
- [ ] `ResultCard.svelte` (64 lines) → adopt lewk `.card` styling
- [ ] `Lockup.svelte` (49 lines) — review whether brand mark needs token cleanup
- [ ] `MultiPassEncoder.svelte` (174 lines) — biggest component; form-heavy, defer until touched for other reasons
- [ ] `Loading.svelte` (105 lines) — mostly animations; may not need migration
- [ ] `RSSFeed.svelte` (37 lines)
- [ ] `Contribute.svelte` (18 lines)
- [ ] `TKCard.svelte` (10 lines)
- [ ] `PreviewImage.svelte` (8 lines)

### Route-level style blocks
- [ ] 16 of 24 routes have their own `<style>` blocks. Audit and migrate opportunistically. Highest-traffic first: `/`, `/~/[term]`, `/explore`, `/domains`.

### Token cleanup
- [ ] Remove shim entries as components/routes stop referencing the legacy token names. Goal: eventually delete the shim entirely.
- [ ] Audit one-off color tokens: `--wave`, `--brown`, `--bios-gray`, `--grid-color`, `--gray`, `--dark-gray`, `--white`, `--black`, `--background-image`. Decide whether each becomes a lewk-derived value, a one-off in `op-theme.css`, or gets removed.
- [ ] `static/global.css` itself — once shim is gone, audit whether global.css's element styles (`h1`, `p`, `a:hover`, `pre`, etc.) conflict with or duplicate lewk's defaults. Trim accordingly.

### Future capabilities (not committed)
- [ ] Live theme/font switching via `themer.js` — would require a UI surface (e.g. add to footer or a settings panel)
- [ ] Additional themes (dark mode, paper, noir, etc.) — only useful once themer is wired up
- [ ] Adopt lewk layout primitives (`.rails-*`, `.prose`, `.feature`, `.hero`) for specific page types

### Risk to monitor
- [ ] `static/fonts.css` uses `@import` from Google Fonts. Lewk's demo uses a `<link>` in `<head>`. Confirm the @import path still works for Instrument Serif + Inter after the swap.
- [ ] Web components in `/src/lib/web-components/` (`<octo-thorpe>`, etc.) have their own shadow-DOM styles using CSS custom properties. They consume `--octo-*` tokens from the host page. **Pilot does not touch these.** Verify they still render correctly post-swap (they should — they use their own token namespace).

## Files Changed (Pilot)

- `src/app.html` — add `data-theme="op"`, add lewk.css link, replace var.css with op-theme.css
- `static/lewk.css` — copied from `~/dev/lewk/lewk.css`
- `static/op-theme.css` — new file, replaces `static/var.css`
- `static/var.css` — deleted
- `src/lib/components/Header.svelte` — use `.section`, trim style block
- `src/lib/components/Nav.svelte` — apply `.nav` class, trim style block
- `src/lib/components/Footer.svelte` — apply `.footer` class, trim style block
- `src/lib/components/LayoutSidebar.svelte` — use `.split` layout
- `src/routes/+layout.svelte` — use `.page` container
- `docs/release-notes-development.md` — append entry

## Rollback

Single git revert restores the previous state. No data migrations, no API changes, no breaking changes to consumers of the API or web components.
