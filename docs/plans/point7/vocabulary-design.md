# OP vocabulary design

A discussion document for the vocabulary formalization epic (#192, #194, #195, #166).

## The problem

OP's data model has three representations that don't agree with each other:

1. **The RDF graph** -- triples in the triplestore using `octo:` predicates.
2. **The JSON-LD context** (`context.json`) -- a stale mapping that's missing most terms and includes dead ones (`prefLabel`, `draft`).
3. **The blobject** -- the JSON shape that `getBlobjectFromResponse` produces and that API consumers actually use.

These were never formally connected. The context.json was written early and hasn't kept up. The blobject shape evolved through code rather than specification. Naming is inconsistent across all three (e.g. `octo:Term` in SPARQL, `Octothorpe` in the context, `hashtag` in harmonizer schema keys).

## Three layers, distinct responsibilities

We're proposing a clean separation:

### Layer 1: The RDF vocabulary

The source of truth. Lives at `vocab.octothorp.es#` and defines every class, property, and relationship subtype that OP uses. All data in the triplestore uses these terms.

Classes: `Page`, `Term`, `Origin`, `Webring`, `Relationship`, `Label`.

Relationship subtypes (subclasses of `Relationship`): `Backlink`, `Cite`, `Bookmark`, `Endorse`, `Button`.

Properties on Pages: `title`, `description`, `image`, `contact`, `pageType`, `indexed`, `postDate`.

Structural properties: `octothorpes`, `hasPart`, `hasMember`, `endorses`, `verified`.

Relationship blank node properties: `url`, `created`.

Note: `indexPolicy`, `indexServer`, and `indexHarmonizer` are NOT part of the vocabulary. They're extraction directives -- the harmonizer pulls them from HTML, the indexing pipeline consumes them, and they're discarded. They belong to the harmonizer/indexing layer as client profile configuration.

### Layer 2: The JSON-LD context

A valid JSON-LD context that can serialize the graph. It maps vocab terms for JSON-LD processors but does NOT express the blobject's simplifications (like trimming `https://instance/~/demo` to just `"demo"`).

The `octothorpes` predicate points at both Term IRIs and Relationship blank nodes in the graph. JSON-LD handles this cleanly with `@container: @set` -- a set of mixed object types under one predicate. A JSON-LD processor would serialize a Term as `{"@id": "https://instance/~/demo"}`, not as the bare string `"demo"`. That simplification is the blobject's job.

### Layer 3: The blobject (projection)

The blobject is an opinionated view of the graph, not JSON-LD itself. `getBlobjectFromResponse` transforms SPARQL results into a consumer-friendly shape:

```javascript
{
  "@id": "https://example.com/page",
  "title": "Page Title",
  "description": "...",
  "image": "https://...",
  "date": 1740179856134,        // ← "indexed" in the vocab
  "postDate": 1740179856134,
  "octothorpes": [
    "demo",                      // ← Term URI trimmed to bare string
    {
      "uri": "https://other.com",
      "type": "Bookmark",
      "terms": ["recipe"]
    }
  ]
}
```

This projection is lossy and instance-specific. That's fine. It's the format most developers will interact with, and it's documented as a projection rather than a serialization.

## The mixed `octothorpes` array

The blobject's `octothorpes` array mixes strings (terms) and objects (relationships). This mirrors the graph -- the `octo:octothorpes` predicate points at both Term URIs and Relationship blank nodes:

```
<page> octo:octothorpes <instance/~/demo> .       # direct link to Term
<page> octo:octothorpes _:b1 .                     # blank node for typed relationship
  _:b1 octo:url <target> .
  _:b1 rdf:type octo:Bookmark .
```

JSON-LD can express this (same predicate, different object types). What JSON-LD can't express is the simplification where `https://instance/~/demo` becomes just `"demo"`. That transformation lives in the blobject projection layer and is documented, not encoded in the context.

We're keeping the mixed array. It's a faithful representation of the underlying graph structure.

## Client vocabulary extensions (#194)

Clients can extend the blobject with custom fields via a `vocabulary` config on `createClient`:

```javascript
const op = createClient({
  instance: 'https://myapp.example.com/',
  sparql: { endpoint: '...' },
  vocabulary: {
    namespace: 'https://myapp.example.com/vocab#',
    predicates: {
      author: { range: 'literal' },
      rating: { range: 'literal' },
    }
  }
})
```

Custom predicates are stored as real triples in the graph and projected into a `documentRecord` sub-object on the blobject:

```javascript
{
  "@id": "...",
  "title": "...",
  "octothorpes": [...],
  "documentRecord": {
    "author": "Jane Doe",
    "rating": "5"
  }
}
```

### documentRecord is within the graph

This is a critical design point. `documentRecord` is not an escape hatch from RDF. It's an extension point within it. The client's vocab schema defines additional predicates that get stored as triples and projected into the `documentRecord` sub-object. The constraint: whatever goes in documentRecord must map to triples that can be written to and read from the triplestore.

Client predicates must be namespaced (can't collide with `octo:`) and must declare their range (`literal`, `uri`, `timestamp`, `boolean`).

### Vocab vs harmonizer responsibility

The vocab defines *what* predicates exist and where they project. The harmonizer defines *how* to extract values for those predicates from a source format.

These are deliberately separate concerns. A developer setting up a new client is responsible for creating a harmonizer that matches their vocab. The harmonizer system already supports custom extraction rules -- a client just adds keys to their harmonizer's `subject` block for the extra fields, and the vocab tells the blobject formatter where to put the extracted values.

Future versions may add a setup factory that validates harmonizer-vocab alignment, but that's not part of this work.

## Content labels (#192)

Labels follow the AT Protocol label spec pattern. They're applied to Pages and carry a value string:

```html
<meta name="octo:label" content="nsfw">
<meta name="octo:label" content="satire">
```

In the graph, labels use blank nodes (like relationships):

```
<page> octo:label _:l1 .
  _:l1 octo:labelValue "nsfw" .
  _:l1 octo:labelSource <origin> .
```

Labels project into the blobject as an optional `labels` array. They're not part of the canonical blobject fields by default -- clients opt in.

## Naming inconsistencies to resolve

| Current state | Resolution |
|---|---|
| `Octothorpe` in context.json vs `Term` in SPARQL | Standardize on `Term` for the class. `Octothorpe` describes the relationship (the act of tagging), not the tag itself. |
| `date` in blobjects vs `indexed` in RDF | Vocab uses `indexed`. Blobject projects it as `date`. Documented. |
| `endorse` (lowercase) in harmonizer and blobject vs `Endorse` (class) | Harmonizer schema keys stay lowercase (they're extraction config). Vocab class is `Endorse`. Blobject type string is `Endorse`. |
| `button` (lowercase) in harmonizer vs `Button` (class) | Same pattern. Schema key lowercase, class and type string capitalized. |
| `challenge` in current context.json | Keep -- it's used for origin verification. |

## On-demand document records (#166)

Once client vocab and documentRecord are working, on-demand harmonization becomes possible. Instead of storing DR content at index time, store a reference to the harmonizer:

```
<page> octo:harmonizeWith <harmonizer-id> .
```

At request time, re-fetch the page, harmonize through the referenced harmonizer, and project the result through the client's documentRecord schema. The triples are ephemeral -- valid RDF, but not persisted.

This enables richer content extraction (like Webmentions per #94) without stuffing arbitrary content into the datastore.

## Implementation sequence

1. **#195: Formalize the vocabulary** -- Define `vocabulary.js` as the canonical term registry. Update `context.json`. Fix naming.
2. **#192: Content labels** -- Add Label class, label properties, harmonizer extraction rules.
3. **#194: Client vocab config** -- `validateClientVocab`, `mergeVocab`, wire into `createClient`. This is the largest piece.
4. **#166: On-demand DR harmonization** -- Store harmonizer references, harmonize at request time. Depends on #194.

There's a detailed implementation plan at `docs/plans/2026-02-25-op-vocabulary.md`.

## Open questions

- **Label storage pattern.** Should labels use blank nodes (like relationships) or a simpler `<page> octo:label "value"` literal pattern? Blank nodes allow metadata (source, timestamp, negation per AT Protocol spec). Literals are simpler but less expressive.

- **documentRecord storage mechanics.** Client predicates need SPARQL INSERT patterns. Do we generate these from the vocab definition, or does the client provide them? The vocab knows the predicate IRIs and ranges, which should be enough to generate INSERT templates.

- **Vocab hosting.** Should `vocab.octothorp.es` serve a dereferenceable RDF document? Nice for linked data interop but not required for the code to work.

- **Canonical Document Records (CDRs).** Issue #194 mentions records originated in the datastore (not harmonized from external sources), keyed to internal URI schemes. This is a significant concept that deserves its own design pass once the vocab layer is stable.
