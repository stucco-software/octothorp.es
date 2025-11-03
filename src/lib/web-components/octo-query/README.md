# octo-query Web Component

A web component for querying and displaying data from the Octothorpes Protocol API. Built with Svelte and compiled to a standard custom element.

## Installation

Include the component script in your HTML:

```html
<script type="module" src="https://octothorp.es/components/octo-query.js"></script>
```

Or for local development:

```html
<script type="module" src="http://localhost:5173/components/octo-query.js"></script>
```

## Basic Usage

```html
<octo-query 
  what="pages" 
  by="thorped" 
  o="demo,webdev"
  autoload="true">
</octo-query>
```

## Attributes

All attributes map to the MultiPass structure used by the Octothorpes API.

### Connection

| Attribute | Default | Description |
|-----------|---------|-------------|
| `server` | `https://octothorp.es` | API server URL |

### Query Parameters (MultiPass)

| Attribute | Default | Description |
|-----------|---------|-------------|
| `what` | `everything` | What to get: `pages`, `thorpes`, `everything`, `domains` |
| `by` | `posted` | How to filter: `thorped`, `linked`, `posted`, `backlinked`, `bookmarked`, `cited`, `in-webring` |
| `s` | `` | Subjects (comma-separated URLs or domains) |
| `o` | `` | Objects (comma-separated terms or URLs) |
| `nots` | `` | Exclude subjects (comma-separated) |
| `noto` | `` | Exclude objects (comma-separated) |
| `match` | `` | Match mode: `exact`, `fuzzy`, `fuzzy-s`, `fuzzy-o`, `very-fuzzy` |
| `limit` | `10` | Maximum number of results |
| `offset` | `0` | Number of results to skip (for pagination) |
| `when` | `` | Date filter: `recent`, `after-YYYY-MM-DD`, `before-YYYY-MM-DD`, `between-YYYY-MM-DD-and-YYYY-MM-DD` |

### Display Options

| Attribute | Default | Description |
|-----------|---------|-------------|
| `autoload` | `false` | Load data immediately on mount |
| `layout` | `list` | Display layout: `list`, `grid`, or `compact` |
| `showmeta` | `true` | Show metadata (description, date, image, tags) |

## Examples

### Get pages tagged with specific terms

```html
<octo-query 
  what="pages" 
  by="thorped" 
  o="indieweb,webdev"
  limit="20"
  autoload="true">
</octo-query>
```

### Get pages from a specific domain

```html
<octo-query 
  what="pages" 
  by="posted" 
  s="https://example.com"
  limit="10"
  autoload="true">
</octo-query>
```

### Get recent backlinks to your site

```html
<octo-query 
  what="pages" 
  by="backlinked" 
  o="https://mysite.com"
  when="recent"
  autoload="true">
</octo-query>
```

### Get domains in a webring

```html
<octo-query 
  what="domains" 
  by="in-webring" 
  s="https://example.com/webring/index.html"
  autoload="true"
  layout="compact">
</octo-query>
```

### Grid layout with fuzzy matching

```html
<octo-query 
  what="pages" 
  by="thorped" 
  o="photography"
  match="fuzzy-o"
  layout="grid"
  limit="12"
  autoload="true">
</octo-query>
```

### Manual load button

```html
<!-- Don't set autoload="true" to show a load button instead -->
<octo-query 
  what="pages" 
  by="thorped" 
  o="test">
</octo-query>
```

### Exclude certain domains

```html
<octo-query 
  what="pages" 
  by="thorped" 
  o="news"
  nots="spam.com,bad-site.com"
  autoload="true">
</octo-query>
```

### Complex query with multiple filters

```html
<octo-query 
  what="pages" 
  by="thorped" 
  s="example.com,anothersite.com"
  o="tutorial,guide"
  noto="beginner"
  match="fuzzy-o"
  when="after-2024-01-01"
  limit="50"
  autoload="true">
</octo-query>
```

## Styling

The component uses CSS custom properties for theming. You can customize the appearance:

```css
octo-query {
  --octo-primary: #3c7efb;
  --octo-background: #ffffff;
  --octo-text: #333333;
  --octo-border: #e0e0e0;
  --octo-error: #d32f2f;
  --octo-spacing: 1rem;
  --octo-radius: 4px;
}
```

Example with custom colors:

```html
<style>
  octo-query.dark-theme {
    --octo-primary: #64b5f6;
    --octo-background: #1e1e1e;
    --octo-text: #e0e0e0;
    --octo-border: #333333;
  }
</style>

<octo-query 
  class="dark-theme"
  what="pages" 
  by="thorped" 
  o="darkmode"
  autoload="true">
</octo-query>
```

## Dynamic Updates

You can update attributes dynamically using JavaScript:

```javascript
const query = document.querySelector('octo-query');

// Change the query
query.setAttribute('o', 'newterm,another');
query.setAttribute('limit', '20');

// Trigger reload (component doesn't auto-reload on attribute change)
// You would need to dispatch a custom event or add that feature
```

## API Response Format

The component expects responses in the standard Octothorpes API format:

```json
{
  "results": [
    {
      "@id": "https://example.com/page",
      "title": "Page Title",
      "description": "Page description",
      "image": "https://example.com/image.jpg",
      "date": 1704067200,
      "octothorpes": [
        "term1",
        "term2",
        {
          "uri": "https://other-site.com",
          "type": "Backlink"
        }
      ]
    }
  ]
}
```

## Browser Support

Works in all modern browsers that support:
- ES modules
- Custom Elements v1
- Shadow DOM

## Development

To build the component:

```bash
npm run build:components
```

The output will be in `static/components/octo-query.js`

## Related

- [Octothorpes API Documentation](https://octothorp.es/docs/api)
- [MultiPass Structure](https://octothorp.es/docs/multipass)
- [Other Web Components](../README.md)
