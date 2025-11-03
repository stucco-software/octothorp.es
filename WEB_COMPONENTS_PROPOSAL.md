# Web Components Modernization Proposal

## Current Problems

1. **Pre-API Implementation**: `tag.js` and `ring.js` were built before the API matured, using manual fetch logic
2. **No Code Reuse**: Don't leverage existing SPARQL utilities, converters, or validation functions
3. **Missing SvelteKit Integration**: Not using Svelte's web component compilation features
4. **Maintenance Burden**: Logic duplicated between server and client
5. **No SSR/Hydration**: Components are purely client-side, missing performance benefits

## Proposed Architecture

### Three-Tier Approach

```
┌─────────────────────────────────────────────────────┐
│  Tier 1: Svelte Components (authoring)             │
│  - Write in .svelte with full framework features   │
│  - Access to shared utilities via imports           │
│  - Easy testing, hot reload, type safety           │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  Tier 2: Compiled Web Components (output)          │
│  - Built via Vite library mode                     │
│  - Single JS bundle per component                  │
│  - Shadow DOM encapsulation                        │
│  - Standard custom elements                        │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  Tier 3: API Endpoints (data layer)                │
│  - Existing /get/[what]/[by] endpoints             │
│  - CORS-enabled for cross-origin use               │
│  - Shared SPARQL/converter utilities               │
└─────────────────────────────────────────────────────┘
```

## Implementation Strategy

### 1. Create a Web Components Directory

```
/src/lib/web-components/
  ├── octo-thorpe/
  │   ├── OctoThorpe.svelte          # Main component
  │   ├── octo-thorpe.config.js      # Build config
  │   └── README.md                   # Usage docs
  ├── web-ring/
  │   ├── WebRing.svelte
  │   ├── web-ring.config.js
  │   └── README.md
  ├── shared/
  │   ├── api-client.js              # Shared API wrapper
  │   ├── styles.js                  # Common CSS variables
  │   └── utils.js                   # Client-side utilities
  └── build-components.js            # Build script
```

### 2. Svelte Component Example: `OctoThorpe.svelte`

```svelte
<svelte:options customElement="octo-thorpe" />

<script>
  import { onMount } from 'svelte';
  import { fetchThorpe } from '../shared/api-client.js';
  
  // Props (become attributes)
  export let href = '';
  export let label = '';
  export let server = 'https://octothorp.es';
  
  // State
  let open = false;
  let data = null;
  let loading = false;
  let error = null;
  
  // Reactive thorpe encoding
  $: o = encodeURIComponent(href || label);
  
  async function loadData() {
    if (!o || data) return;
    
    loading = true;
    error = null;
    
    try {
      data = await fetchThorpe(server, o);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
  
  onMount(() => {
    // Preload if requested
    if (open) loadData();
  });
  
  function handleToggle() {
    open = !open;
    if (open && !data) loadData();
  }
</script>

<details class="octo-thorpe" class:open bind:open on:toggle={handleToggle}>
  <summary>{label || href}</summary>
  
  {#if loading}
    <article>Loading...</article>
  {:else if error}
    <article class="error">{error}</article>
  {:else if data}
    <article>
      {#each data as server}
        <section>
          <p><b><a href="{server.origin}/~/{o}">{server.origin}</a></b></p>
          <ul>
            {#each server.thorpes as item}
              <li><a href="{item.uri}">{item.title || item.uri}</a></li>
            {/each}
          </ul>
        </section>
      {/each}
    </article>
  {:else}
    <article>…</article>
  {/if}
</details>

<style>
  .octo-thorpe {
    display: inline;
  }
  
  .octo-thorpe.open {
    display: block;
  }
  
  summary {
    list-style: none;
    cursor: zoom-in;
  }
  
  summary::before {
    content: "#";
    font-weight: bold;
    display: inline-block;
    transform: rotate(30deg);
    padding-inline-end: 0.1em;
  }
  
  .octo-thorpe.open summary::before {
    transform: rotate(0);
  }
  
  /* More styles... */
</style>
```

### 3. Shared API Client: `api-client.js`

```javascript
// Wrapper around fetch for consistency and error handling
export class OctothorpesAPIClient {
  constructor(baseUrl = 'https://octothorp.es') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }
  
  async fetch(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  }
  
  async getThorpe(thorpe) {
    return this.fetch(`/~//${encodeURIComponent(thorpe)}`);
  }
  
  async getDomainsInWebring(siteUrl) {
    return this.fetch(`/get/domains/in-webring?s=${encodeURIComponent(siteUrl)}`);
  }
  
  async getPages(what, by, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    if (options.filter) params.set('filter', options.filter);
    
    const query = params.toString();
    const endpoint = `/get/${what}/${by}${query ? '?' + query : ''}`;
    return this.fetch(endpoint);
  }
}

// Singleton for convenience
const defaultClient = new OctothorpesAPIClient();

export const fetchThorpe = (server, thorpe) => {
  const client = server ? new OctothorpesAPIClient(server) : defaultClient;
  return client.getThorpe(thorpe);
};

export const fetchWebring = (server, siteUrl) => {
  const client = server ? new OctothorpesAPIClient(server) : defaultClient;
  return client.getDomainsInWebring(siteUrl);
};
```

### 4. Build Configuration: `vite.config.components.js`

```javascript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        customElement: true
      }
    })
  ],
  build: {
    lib: {
      entry: {
        'octo-thorpe': resolve(__dirname, 'src/lib/web-components/octo-thorpe/OctoThorpe.svelte'),
        'web-ring': resolve(__dirname, 'src/lib/web-components/web-ring/WebRing.svelte')
      },
      formats: ['es'],
      fileName: (format, name) => `${name}.js`
    },
    outDir: 'static/components',
    emptyOutDir: false
  }
});
```

### 5. Build Script: `build-components.js`

```javascript
import { build } from 'vite';
import config from './vite.config.components.js';

async function buildComponents() {
  console.log('Building web components...');
  
  try {
    await build(config);
    console.log('✓ Web components built successfully');
  } catch (error) {
    console.error('✗ Build failed:', error);
    process.exit(1);
  }
}

buildComponents();
```

Update `package.json`:
```json
{
  "scripts": {
    "build:components": "node build-components.js",
    "build": "npm run build:components && vite build"
  }
}
```

## Migration Path

### Phase 1: Infrastructure (Week 1)
1. Create `/src/lib/web-components/` directory structure
2. Create shared API client
3. Set up component build configuration
4. Add build scripts to package.json

### Phase 2: Migrate `octo-thorpe` (Week 1-2)
1. Port `tag.js` logic to `OctoThorpe.svelte`
2. Integrate with `/~/[thorpe]` API endpoint
3. Add tests using Vitest + @testing-library/svelte
4. Build and deploy to `/static/components/octo-thorpe.js`
5. Update documentation

### Phase 3: Migrate `web-ring` (Week 2-3)
1. Port `ring.js` logic to `WebRing.svelte`
2. Use `/get/domains/in-webring` endpoint
3. Add blogroll mode support
4. Add tests
5. Build and deploy to `/static/components/web-ring.js`

### Phase 4: Deprecation (Week 3-4)
1. Add deprecation notices to old components
2. Create migration guide for users
3. Support both versions for 3-6 months
4. Remove old components

## Benefits

### For Development
- **Code Reuse**: Leverage existing API utilities and endpoints
- **Better DX**: Hot reload, TypeScript support, better error messages
- **Testability**: Use existing Vitest setup with component testing
- **Maintainability**: Single source of truth for data fetching logic

### For Users
- **Smaller Bundles**: Svelte compiles to minimal JS
- **Better Performance**: Can use SSR for initial render, hydrate for interactivity
- **Consistency**: Components use same data format as main site
- **Future-Proof**: Easy to add new features using established patterns

### For the API
- **Clear Separation**: Components are API consumers, not duplicating logic
- **Versioning**: Can version components independently
- **Documentation**: Component usage serves as API documentation
- **Monitoring**: Easier to track component usage and API load

## Advanced Features (Future)

### Server-Side Rendering Option
For sites that want faster initial loads, provide SSR endpoints:

```
GET /components/octo-thorpe?href=example&label=Example
→ Returns pre-rendered HTML with hydration script
```

### Component Registry
Create a `/components/` page that lists all available components with:
- Live demos
- Code examples
- API endpoint documentation
- Customization options

### Analytics Integration
Track component usage to understand:
- Which octothorpes are most popular
- Performance metrics
- Error rates
- API usage patterns

## Example Usage (After Migration)

### Before (current):
```html
<script src="https://octothorp.es/tag.js" 
        data-plugins="linkfill" 
        data-register="https://octothorp.es"></script>
<octo-thorpe href="webdev">Web Development</octo-thorpe>
```

### After (new):
```html
<script type="module" src="https://octothorp.es/components/octo-thorpe.js"></script>
<octo-thorpe href="webdev" label="Web Development"></octo-thorpe>
```

or with custom server:
```html
<octo-thorpe 
  href="webdev" 
  label="Web Development"
  server="https://custom-instance.example.com"></octo-thorpe>
```

## Testing Strategy

```javascript
// octo-thorpe.test.js
import { render, screen, waitFor } from '@testing-library/svelte';
import { vi } from 'vitest';
import OctoThorpe from './OctoThorpe.svelte';

describe('OctoThorpe', () => {
  it('renders label correctly', () => {
    render(OctoThorpe, { props: { label: 'Test' } });
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
  
  it('fetches data when opened', async () => {
    const mockFetch = vi.fn(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [] })
      })
    );
    global.fetch = mockFetch;
    
    const { component } = render(OctoThorpe, { 
      props: { href: 'test', label: 'Test' } 
    });
    
    const summary = screen.getByText('Test');
    await summary.click();
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/~/test'),
        expect.any(Object)
      );
    });
  });
});
```

## Open Questions

1. **Backward Compatibility**: Should we maintain old attribute names/behavior?
2. **Styling**: Allow CSS custom properties vs slots vs both?
3. **Error Handling**: What level of error detail to expose?
4. **Caching**: Should components cache API responses? For how long?
5. **Bundle Size**: Single file with all components or separate files?
6. **Documentation**: Where should component docs live? /docs/ or separate site?

## Recommendation

I recommend starting with **Phase 1 & 2** as a proof of concept:
1. Set up the infrastructure
2. Migrate `octo-thorpe` only
3. Run both versions in parallel
4. Gather feedback from early adopters
5. Iterate before migrating `web-ring`

This approach minimizes risk while proving the value of the new architecture.
