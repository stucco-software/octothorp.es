# Creating New Web Components

## Quick Start (30 seconds)

1. **Copy the template:**
   ```bash
   cp src/lib/web-components/shared/COMPONENT_TEMPLATE.svelte \
      src/lib/web-components/octo-links/OctoLinks.svelte
   ```

2. **Edit 3 things:**
   - Line 18: `customElement="octo-links"`
   - Line 45: `createOctoQuery('pages', 'linked')`
   - Customize rendering if needed (optional)

3. **Add to build config:**
   ```javascript
   // vite.config.components.js
   entry: {
     'octo-thorpe': resolve(__dirname, 'src/lib/web-components/octo-thorpe/OctoThorpe.svelte'),
     'octo-links': resolve(__dirname, 'src/lib/web-components/octo-links/OctoLinks.svelte')  // Add this
   }
   ```

4. **Build:**
   ```bash
   npm run build:components
   ```

5. **Done!** Component is at `static/components/octo-links.js`

---

## Available Endpoints

Your component queries `/get/[what]/[by]`. Common combinations:

### Pages
- `createOctoQuery('pages', 'thorped')` - Pages tagged with octothorpes
- `createOctoQuery('pages', 'linked')` - Pages linking to specific URLs
- `createOctoQuery('pages', 'posted')` - Pages from specific domains
- `createOctoQuery('pages', 'backlinked')` - Pages backlinking to URLs
- `createOctoQuery('pages', 'bookmarked')` - Pages bookmarking URLs
- `createOctoQuery('pages', 'in-webring')` - Pages in a webring

### Domains
- `createOctoQuery('domains', 'in-webring')` - Domains in a webring
- `createOctoQuery('domains', 'posted')` - Domains that posted

### Thorpes
- `createOctoQuery('thorpes', 'used')` - Octothorpes that have been used

### Everything
- `createOctoQuery('everything', 'thorped')` - All items tagged with octothorpes
- `createOctoQuery('everything', 'posted')` - All items from domains

---

## What Gets Copied (Don't Change)

These sections are **standard across all components**:

### Props Declaration (Lines 24-37)
```javascript
export let server = 'https://octothorp.es';
export let s = '';
export let o = '';
export let nots = '';
export let noto = '';
export let match = '';
export let limit = '10';
export let offset = '0';
export let when = '';
export let autoload = false;
export let render = 'list';

$: params = { server, s, o, nots, noto, match, limit, offset, when };
```

**Why:** Web components require individual exports for HTML attributes.

### Standard Methods (Lines 49-58)
```javascript
async function load() {
  await query.fetch(params);
}

onMount(() => {
  if (autoload || autoload === '') {
    load();
  }
});
```

**Why:** Consistent loading behavior across all components.

---

## What to Customize

### 1. Component Name (Line 18)
```svelte
<svelte:options customElement="your-component-name" />
```

### 2. Query Endpoint (Line 45)
```javascript
const query = createOctoQuery('what', 'by');
```

### 3. Rendering Logic (Lines 71+)
The template includes:
- `count` mode - Just show number
- `list` mode - Bulleted list
- `cards` mode - Grid layout
- `compact` mode - Inline comma-separated

**Keep what you need, remove what you don't.**

### 4. Styles (Lines 178+)
- Change CSS custom properties defaults
- Add component-specific styles
- Keep the same variable names for consistency

---

## Example: Creating `<octo-links>`

Shows pages that link to specific URLs.

**File:** `src/lib/web-components/octo-links/OctoLinks.svelte`

**Changes from template:**

```diff
- <svelte:options customElement="component-name" />
+ <svelte:options customElement="octo-links" />

- const query = createOctoQuery('pages', 'thorped');
+ const query = createOctoQuery('pages', 'linked');

- Load pages tagged "{o || 'octothorpes'}"
+ Load pages linking to "{o || 'URL'}"
```

**Usage:**
```html
<script type="module" src="https://octothorp.es/components/octo-links.js"></script>
<octo-links o="https://example.com" autoload></octo-links>
```

---

## Example: Creating `<octo-webring>`

Shows domains in a webring.

**File:** `src/lib/web-components/octo-webring/OctoWebring.svelte`

**Changes from template:**

```diff
- <svelte:options customElement="component-name" />
+ <svelte:options customElement="octo-webring" />

- const query = createOctoQuery('pages', 'thorped');
+ const query = createOctoQuery('domains', 'in-webring');

- export let render = 'list';
+ export let render = 'list'; // Could default to 'compact' for webrings
```

**Custom rendering** (domains don't have descriptions/dates):
```svelte
<ul class="list">
  {#each $query.results as item}
    <li>
      <a href={getUrl(item)} target="_blank" rel="noopener noreferrer">
        {getUrl(item)}
      </a>
    </li>
  {/each}
</ul>
```

**Usage:**
```html
<octo-webring s="https://example.com/webring.json" autoload></octo-webring>
```

---

## Testing Your Component

### 1. Create a demo page

**File:** `static/components/your-component-demo.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Your Component Demo</title>
</head>
<body>
  <h1>Your Component Demo</h1>
  
  <your-component o="test" autoload></your-component>
  
  <script type="module" src="/components/your-component.js"></script>
</body>
</html>
```

### 2. Start dev server

```bash
npm run dev
```

### 3. Visit demo

```
http://localhost:5173/components/your-component-demo.html
```

---

## Common Patterns

### Component with only one render mode

Remove the `render` prop and conditional rendering:

```diff
- export let render = 'list';

- {#if render === 'list'}
    <ul class="list">...</ul>
- {:else if render === 'cards'}
-   ...
- {/if}
+ <ul class="list">...</ul>
```

### Component with custom helper functions

Add them after the standard helpers (line 64+):

```javascript
function formatDomain(uri) {
  return new URL(uri).hostname;
}

function isRecent(timestamp) {
  const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
  return parseInt(timestamp) > twoWeeksAgo;
}
```

### Component with different default limit

```diff
- export let limit = '10';
+ export let limit = '50';
```

---

## Troubleshooting

### Component doesn't show up
- Check customElement name is unique
- Verify it's added to vite.config.components.js
- Run `npm run build:components`
- Check browser console for errors

### Attributes not working
- Remember: HTML attributes are lowercase only
- Use `o="value"` not `O="value"`
- Boolean attributes: `autoload` not `autoload="true"`

### Store not updating
- Check params object includes all needed props
- Verify query endpoint (what/by) is correct
- Check API response in Network tab

### Styles not applying
- CSS custom properties must be on `:host`
- Component styles are scoped (can't affect children)
- Use browser DevTools to inspect shadow DOM

---

## Bundle Size Tips

- Remove unused render modes
- Remove unused helper functions
- Remove unused CSS (especially unused render mode styles)
- Use `render="count"` for smallest inline components

Expected sizes:
- Minimal component (count only): ~8KB (2KB gzipped)
- Full component (all modes): ~15KB (5KB gzipped)
- First component includes store: +2KB

---

## Best Practices

1. **Keep render modes consistent** - Users expect list/cards/compact/count across all components
2. **Use CSS custom properties** - Let users customize colors/spacing
3. **Support autoload** - Let users choose when to fetch data
4. **Show loading states** - Always indicate when fetching
5. **Handle errors gracefully** - Show retry button
6. **Provide count mode** - For inline "X results" usage
7. **Use semantic HTML** - `<article>`, `<time>`, `<ul>`, etc.
8. **Target="_blank" for external links** - With rel="noopener noreferrer"

---

## Publishing

Once your component is built:

1. It's automatically in `static/components/your-component.js`
2. SvelteKit serves it at `https://octothorp.es/components/your-component.js`
3. Third parties can use it with:
   ```html
   <script type="module" src="https://octothorp.es/components/your-component.js"></script>
   <your-component o="value" autoload></your-component>
   ```

No npm package needed - just a script tag!
