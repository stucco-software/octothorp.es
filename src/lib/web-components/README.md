# Octothorpes Web Components

This directory contains Svelte-based web components that compile to standard custom elements for embedding Octothorpes Protocol functionality in any website.

## Architecture

```
/src/lib/web-components/
├── shared/              # Shared utilities
│   ├── api-client.js   # API wrapper with MultiPass support
│   └── ...             # Future: styles, utils, etc.
├── octo-query/         # MultiPass query component
│   ├── OctoQuery.svelte
│   └── README.md
└── README.md           # This file
```

## Components

### octo-query

A flexible query component that accepts MultiPass-style parameters and displays results from the Octothorpes API.

**Use cases:**
- Display pages tagged with specific terms
- Show recent posts from your site
- List backlinks to your pages
- Create custom feeds
- Build webring navigation

[Full Documentation](./octo-query/README.md)

**Quick Example:**
```html
<script type="module" src="https://octothorp.es/components/octo-query.js"></script>

<octo-query 
  what="pages" 
  by="thorped" 
  o="indieweb"
  limit="10"
  autoload="true">
</octo-query>
```

## Development

### Building Components

Build all components:
```bash
npm run build:components
```

This compiles Svelte components to ES modules in `/static/components/`.

### Build Configuration

Components are built using a separate Vite config (`vite.config.components.js`) with:
- Custom element mode enabled
- ES module output
- Minification and sourcemaps
- Output to `/static/components/`

### Adding New Components

1. Create a new directory in `/src/lib/web-components/`
2. Create a `.svelte` file with `<svelte:options customElement="your-name" />`
3. Add the component to `vite.config.components.js` entry points
4. Build and test

Example structure:
```
/src/lib/web-components/your-component/
├── YourComponent.svelte
├── README.md
└── test.html (optional demo)
```

## Shared Utilities

### API Client

Located in `shared/api-client.js`, provides a clean interface to the Octothorpes API:

```javascript
import { createClient } from '@shared/api-client.js';

const client = createClient('https://octothorp.es');

// Query with MultiPass parameters
const results = await client.query('pages', 'thorped', {
  o: ['demo', 'test'],
  limit: 20,
  when: 'recent'
});

// Convenience methods
const pages = await client.getPagesThorped(['indieweb']);
const backlinks = await client.getBacklinks('https://example.com');
const webring = await client.getDomainsInWebring('https://example.com/ring/');
```

## Design Principles

1. **API-First**: Components are thin wrappers around API calls
2. **MultiPass Compatible**: Accept parameters matching the API's MultiPass structure
3. **Standard Web Components**: No framework required to use them
4. **Customizable**: CSS custom properties for styling
5. **Progressive Enhancement**: Works with or without JavaScript
6. **Self-Contained**: Each component bundles only what it needs

## Testing

Components can be tested using Vitest with JSDOM:

```javascript
import { render } from '@testing-library/svelte';
import OctoQuery from './OctoQuery.svelte';

describe('OctoQuery', () => {
  it('renders with default props', () => {
    const { container } = render(OctoQuery, {
      props: { what: 'pages', by: 'posted' }
    });
    expect(container).toBeTruthy();
  });
});
```

## Browser Support

Components work in all modern browsers supporting:
- ES Modules
- Custom Elements v1
- Shadow DOM
- Fetch API

No polyfills required for modern browsers (Chrome 67+, Firefox 63+, Safari 10.1+, Edge 79+).

## Future Components

Planned components based on existing functionality:

- **octo-thorpe** - Inline octothorpe/tag display (migration of `tag.js`)
- **web-ring** - Webring navigation (migration of `ring.js`)
- **octo-feed** - RSS feed display
- **octo-bookmarks** - Bookmark collection display
- **octo-badge** - Protocol badge/status indicator

## Migration from Legacy Components

Existing components in `/static/` (`tag.js`, `ring.js`) will be migrated to this architecture:

1. Keep old versions working
2. Build new Svelte versions alongside
3. Add deprecation notices
4. Support both for 3-6 months
5. Eventually remove old versions

## Resources

- [Octothorpes API Documentation](https://octothorp.es/docs/api)
- [MultiPass Structure](https://octothorp.es/docs/multipass)
- [Svelte Custom Elements](https://svelte.dev/docs#run-time-custom-element-api)
- [Web Components Spec](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
