# `<octo-graph>` Web Component

A web component that renders interactive graph visualizations of OP's term and page relationships. Embeddable on any page via a script tag, following the existing web component pattern.

## Dependencies

- **Issue #196** (graph relationship primitives in core) is the blocker. The component needs `fast.related` and `fast.neighbors` queries before it can do anything useful.

## Phase 1: Data primitives (issue 196)

Before the component makes sense, core needs graph queries exposed as `api.fast.*` methods:

- **`fast.related(term)`** -- co-occurring terms for a given term. SPARQL: find pages tagged with term, collect their other terms, rank by frequency. Returns `[{ term, count }]`.
- **`fast.neighbors(uri)`** -- 1-hop bidirectional edges for any URI. Outgoing + incoming octothorpes. Returns `{ outgoing: [...], incoming: [...] }`.

These return flat arrays that map to `{ nodes, links }` with minimal transform. Without these, the component would need multiple round-trips and client-side graph construction.

New API endpoints need to expose these -- either as new `[by]` values (e.g., `/get/thorpes/related?o=demo`) or as separate routes. Fitting into existing `[what]/[by]` is cleaner but may stretch the abstraction.

## Phase 2: `<octo-graph>` component

### Stack

`force-graph` (Canvas-based, ~40KB) wrapped in a Svelte custom element following the existing web component pattern (`createOctoQuery` store, `COMPONENT_TEMPLATE.svelte` base).

### Attributes

| Attribute | Description | Default |
|-----------|-------------|---------|
| `term` | Seed term (renders co-occurrence neighborhood) | -- |
| `uri` | Seed URI (renders 1-hop neighbors) | -- |
| `depth` | Hops to traverse | `1` |
| `server` | API server URL | `https://octothorp.es` |
| `limit` | Max nodes | `50` |
| `autoload` | Auto-load on mount | `false` |

One of `term` or `uri` is required. If both are set, `term` takes priority.

### Node types

Visually distinct by shape/color:

- **Terms** -- the `~/demo` kind (e.g., circles)
- **Pages** -- URIs (e.g., squares)
- **Origins** -- domains, if depth > 1 (e.g., diamonds)

### Interactions

- **Click node** -- re-center graph on that node (fetch its neighbors, merge into existing graph)
- **Hover** -- show metadata tooltip (title, description, date)
- **Click-through** -- link to term page or URI in new tab
- **Zoom/pan** -- handled by force-graph out of the box

### Data flow

```
<octo-graph term="demo">
  -> fetch related terms for "demo" (via new endpoint)
  -> transform response to { nodes, links }
  -> feed to force-graph instance
  -> user clicks a term node
  -> fetch related terms for clicked term
  -> merge new nodes/links into existing graph
  -> force-graph re-simulates with expanded data
```

### Graph data transform

The transform from API response to force-graph input should be a shared utility (not inline in the component), since it may be useful for other consumers:

```javascript
// Conceptual shape
function toGraph(related, seedTerm) {
  const nodes = [
    { id: seedTerm, type: 'term' },
    ...related.map(r => ({ id: r.term, type: 'term', count: r.count }))
  ]
  const links = related.map(r => ({
    source: seedTerm,
    target: r.term,
    weight: r.count
  }))
  return { nodes, links }
}
```

## Phase 3: Polish and integration

- Add to `vite.config.components.js` build entries
- Create demo page at `static/components/octo-graph-demo.html`
- Add graph view option to term pages (`/~/[term]`) as an alternative rendering
- Consider a debug route (`/debug/graph`) for exploring the full graph without embedding

## Open questions

### Performance ceiling

How many nodes before force-graph chokes? Likely fine up to ~500 nodes, but `depth=2` on a popular term could explode. May need server-side pruning (return only top N co-occurrences by frequency).

### Bundle size

force-graph at ~40KB is bigger than other components (~15KB each). Options:
- Accept it (it's still small in absolute terms)
- Lazy-load the library only when the component mounts
- Offer a static/non-interactive fallback for lighter embeds

### Upgrade path

If force-graph proves limiting (need non-force layouts, graph algorithms, clustering), Cytoscape.js (~170KB) is the next step up. The `{ nodes, links }` data shape is similar enough that migration would be a rendering swap, not a data rework.

### Endpoint design

`related` and `neighbors` could be:
- New `[by]` values: `/get/thorpes/related?o=demo`, `/get/pages/neighbors?s=https://example.com`
- Separate routes: `/graph/related/demo`, `/graph/neighbors?uri=...`
- Only available via `fast.*` in core, with a thin debug route on top

Fitting into `[what]/[by]` keeps the API surface consistent. Adding a new top-level route (`/graph/`) makes the distinct purpose clearer. Decision can wait until issue 196 lands.
