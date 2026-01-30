# Octothorpes Web Components

Modern, declarative web components for the Octothorpes Protocol, built with the **store pattern** for minimal bundle size and maximum flexibility.

## Architecture

### Design Principles

1. **Store-based**: Uses Svelte stores compiled to vanilla JavaScript
2. **Declarative**: HTML attributes map 1:1 to API query parameters
3. **Focused**: Each component queries one specific endpoint
4. **Lightweight**: Minimal JavaScript, no external dependencies
5. **Customizable**: CSS custom properties for all visual aspects

### The Pattern

```
Component Source (*.svelte)
    ↓ imports
Shared Store (octo-store.js)
    ↓ compiles to
Single JS Bundle (*.js)
    ↓ uses
API Endpoints (/get/[what]/[by])
```

## Components

### `<octo-thorpe>`

Displays pages tagged with octothorpes.

**API:** `GET /get/pages/thorped`

**Usage:**
```html
<script type="module" src="https://octothorp.es/components/octo-thorpe.js"></script>
<octo-thorpe o="demo" autoload></octo-thorpe>
```

**Attributes:**
- `o` - Octothorpe terms (comma-separated)
- `s` - Subject filter (domains, comma-separated)
- `noto` - Exclude terms
- `nots` - Exclude subjects
- `match` - Match mode: `exact`, `fuzzy`, `fuzzy-o`, `fuzzy-s`, `very-fuzzy`
- `limit` - Maximum results (default: `10`)
- `offset` - Result offset for pagination (default: `0`)
- `when` - Date filter: `recent`, `after-DATE`, `before-DATE`, `between-DATE-and-DATE`
- `autoload` - Auto-load on mount (boolean attribute)
- `render` - Display mode: `list`, `cards`, `compact`, `count`
- `server` - API server URL (default: `https://octothorp.es`)

**Render Modes:**
- `list` - Default bulleted list with descriptions and dates
- `cards` - Grid layout with images
- `compact` - Inline comma-separated links
- `count` - Just the number (for inline use)

**CSS Custom Properties:**
```css
octo-thorpe {
  --octo-font: system-ui, sans-serif;
  --octo-primary: #3c7efb;
  --octo-background: #ffffff;
  --octo-text: #333333;
  --octo-border: #e0e0e0;
  --octo-error: #d32f2f;
  --octo-spacing: 1rem;
  --octo-radius: 4px;
}
```

**Bundle Size:** 55KB (11KB gzipped)

### `<octo-backlinks>`

Shows pages that link to a specific URL. Defaults to the current page if `o` is not set.

**API:** `GET /get/pages/linked`

**Usage:**
```html
<script type="module" src="https://octothorp.es/components/octo-backlinks.js"></script>
<octo-backlinks autoload></octo-backlinks>
```

**Attributes:** Same as `<octo-thorpe>` (`server`, `s`, `o`, `nots`, `noto`, `match`, `limit`, `offset`, `when`, `autoload`, `render`), plus:
- `emptyMessage` - Message when no results (default: `"No links found to this page"`)

If `o` is omitted, defaults to `window.location.href`.

### `<octo-multipass>`

Accepts a MultiPass JSON object and displays results with metadata (title, author, description).

**Usage:**
```html
<script type="module" src="https://octothorp.es/components/octo-multipass.js"></script>
<octo-multipass multipass='{"meta":{"title":"My Feed",...},...}' autoload></octo-multipass>
```

**Attributes:**
- `multipass` - MultiPass JSON string or object
- `autoload` - Auto-load on mount (boolean)
- `render` - Display mode: `list`, `cards`, `compact`, `count`

### `<octo-multipass-loader>`

File upload component for MultiPass objects. Accepts GIF or JSON file drops.

**Usage:**
```html
<script type="module" src="https://octothorp.es/components/octo-multipass-loader.js"></script>
<octo-multipass-loader placeholder="Drop a MultiPass here"></octo-multipass-loader>
```

**Attributes:**
- `render` - Display mode: `list`, `cards`, `compact`
- `placeholder` - Upload prompt text (default: `"Drop MultiPass JSON or GIF here"`)
- `gif` - URL to a MultiPass GIF (can be set programmatically)
- `target` - CSS selector for target element to render results into

## Shared Utilities

### `octo-store.js`

Store factory for creating reactive API query stores.

```javascript
import { createOctoQuery } from '../shared/octo-store.js';

const query = createOctoQuery('pages', 'thorped');

await query.fetch({
  server: 'https://octothorp.es',
  o: 'demo',
  limit: 10
});

// Access reactive state
$query.results  // Array of results
$query.loading  // Boolean
$query.error    // String or null
$query.count    // Number of results
```

## Building Components

### 1. Create Component

```svelte
<!-- src/lib/web-components/my-component/MyComponent.svelte -->
<svelte:options customElement="my-component" />

<script>
  import { onMount } from 'svelte';
  import { createOctoQuery } from '../shared/octo-store.js';
  
  export let o = '';
  export let autoload = false;
  
  const query = createOctoQuery('pages', 'thorped');
  
  async function load() {
    await query.fetch({ o });
  }
  
  onMount(() => {
    if (autoload) load();
  });
</script>

{#if $query.loading}
  <div>Loading...</div>
{:else if $query.results.length}
  <ul>
    {#each $query.results as item}
      <li><a href={item.uri}>{item.title}</a></li>
    {/each}
  </ul>
{/if}
```

### 2. Add to Build Config

```javascript
// vite.config.components.js
export default defineConfig({
  build: {
    lib: {
      entry: {
        'octo-thorpe': resolve(__dirname, 'src/lib/web-components/octo-thorpe/OctoThorpe.svelte'),
        'my-component': resolve(__dirname, 'src/lib/web-components/my-component/MyComponent.svelte')
      }
    }
  }
});
```

### 3. Build

```bash
npm run build:components
```

### 4. Deploy

Component is output to `static/components/my-component.js` and served automatically by SvelteKit.

## Developer Experience Goals

### For Component Authors

- **Minimal code**: Store handles fetch logic, component handles display
- **Type-safe**: TypeScript support in stores
- **Testable**: Store logic separate from rendering
- **Reusable**: Share renderers across components

### For Component Users

- **Zero JavaScript**: Just HTML attributes
- **Predictable**: If you know the API, you know the components
- **Customizable**: CSS variables for styling
- **No build step**: Drop in `<script>` tag and use

## Future Components

Planned components following this pattern:

- `<octo-webring>` - Domains in webring (GET /get/domains/in-webring)
- `<octo-feed>` - Generic query with RSS output

## Migration Notes

This is the **v2 architecture**. Previous components (`tag.js`, `ring.js`, `octo-query`, `demo-list`) used a different pattern and have been deprecated.

### What Changed

**Before:**
- Manual fetch logic in each component
- `api-client.js` duplicated query building
- No shared patterns

**After:**
- Store-based reactive data fetching
- Query building happens server-side
- Shared `octo-store.js` for all components
- ~40% smaller bundles

### For Users

The API is simpler and more declarative:

```html
<!-- Old: octo-query -->
<octo-query what="pages" by="thorped" o="demo" autoload="true"></octo-query>

<!-- New: octo-thorpe -->
<octo-thorpe o="demo" autoload></octo-thorpe>
```

## Testing

Run dev server and visit demo pages:

```bash
npm run dev
```

Then open:
- http://localhost:5173/components/octo-thorpe-demo.html

## Documentation

See `octo-thorpe-demo.html` for comprehensive examples of all features.
