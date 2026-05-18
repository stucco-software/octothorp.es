---
name: octothorpes:web-components
description: Use when building or modifying OP web components — octo-thorpe, octo-backlinks, octo-multipass, or octo-multipass-loader. Load when working in /src/lib/web-components/, building components, or configuring component attributes.
---

# OP Web Components

Client-side custom elements that query the OP API and render results. Built with Svelte, compiled to standard Web Components.

**Source:** `/src/lib/web-components/`
**Build config:** `vite.config.components.js`
**Output:** `/static/components/` (ES modules)
**Build command:** `npm run build:components` — uses Vite with Svelte plugin in `customElement` mode.

## Components

| Element | Source | API endpoint | Purpose |
|---------|--------|-------------|---------|
| `<octo-thorpe>` | `octo-thorpe/OctoThorpe.svelte` | `/get/pages/thorped` | Display pages tagged with specific terms |
| `<octo-backlinks>` | `octo-backlinks/OctoBacklinks.svelte` | `/get/pages/linked` | Show pages linking to a URL (defaults to current page) |
| `<octo-multipass>` | `octo-multipass/OctoMultipass.svelte` | Dynamic | Accept a MultiPass object, display results with metadata |
| `<octo-multipass-loader>` | `octo-multipass-loader/OctoMultipassLoader.svelte` | Dynamic | File upload (GIF/JSON) for MultiPass objects |

## Common Attributes

All components share these attributes:
- `server` - API server URL (default: `"https://octothorp.es"`)
- `autoload` - Auto-fetch on mount (boolean)
- `render` - Display mode: `list`, `cards`, `compact`, `count`
- `limit`, `offset` - Pagination
- `s`, `o` - Subject/object filters
- `nots`, `noto` - Exclusions
- `match` - Matching strategy
- `when` - Date filter

## Shared Utilities

| File | Purpose |
|------|---------|
| `shared/octo-store.js` | Svelte store factory for API queries (`createOctoQuery(what, by)`) |
| `shared/display-helpers.js` | `getTitle()`, `getUrl()`, `formatDate()` |
| `shared/multipass-utils.js` | `parseMultipass()`, `multipassToParams()`, `extractWhatBy()` |

## CSS Theming

Components use CSS custom properties for styling:
- `--octo-font`, `--octo-primary`, `--octo-background`, `--octo-text`
- `--octo-border`, `--octo-error`, `--octo-spacing`, `--octo-radius`

## Creating New Components

See `/src/lib/web-components/README.md` for the full guide on creating new components (Svelte setup, build config, deploy).

## Legacy

`/static/tag.js` is the original plain-JS implementation of `<octo-thorpe>` using shadow DOM. The Svelte-based components in `/src/lib/web-components/` are the current system.
