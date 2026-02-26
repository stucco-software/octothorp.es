# OP Vocabulary & Client Schema Epic

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Formalize the OP RDF vocabulary, define the blobject as a documented projection of that vocabulary, and enable clients to extend the blobject shape with custom predicates via a documentRecord.

**Architecture:** Three layers -- (1) the RDF vocabulary at `vocab.octothorp.es#` defines the canonical graph terms, (2) the JSON-LD context maps those terms for serialization, (3) the blobject is an opinionated projection that clients can customize. Client vocabulary extensions add predicates to the graph and project them into a `documentRecord` sub-object. Harmonizers handle extraction (the *how*); the vocab defines the schema (the *what*).

**Tech Stack:** RDF/SPARQL, JSON-LD, JavaScript (packages/core)

**Issues:** #195 (vocab ↔ blobject), #194 (client vocab), #192 (content labels), #166 (on-demand DR harmonization)

---

## Background & Design Decisions

These decisions were reached through discussion and should be treated as settled:

### The three layers

1. **RDF Vocabulary** (`vocab.octothorp.es#`) -- the source of truth for what terms exist, their types, and their semantics. All data in the triplestore uses these predicates.

2. **JSON-LD Context** (`context.json`) -- a valid JSON-LD context that can serialize the graph. Handles the `octothorpes` predicate pointing at both Term IRIs and blank node Relationship objects. Does NOT handle the blobject's simplifications (e.g. trimming Term URIs to bare strings).

3. **Blobject** -- a documented projection format. `getBlobjectFromResponse` transforms graph data into a consumer-friendly JSON shape. The blobject references vocab terms but is not itself JSON-LD. This is the layer most client developers will interact with.

### Vocab vs harmonizer responsibility

- The **vocab** defines *what* predicates exist, their types (literal, URI), and where they project in the blobject.
- The **harmonizer** defines *how* to extract values for those predicates from a source format (HTML, JSON, etc.).
- These are deliberately separate concerns. A developer setting up a new client must create a harmonizer that matches their blobject schema. Future versions may add setup factories with guardrails, but not now.

### documentRecord is within the graph

`documentRecord` is NOT an escape hatch from RDF. It is an extension point within the graph. Client-defined predicates are stored as real triples. The client's vocab schema defines how those triples get projected into the `documentRecord` sub-object of the blobject. The constraint: whatever a client puts in documentRecord must map to triples that can be written to and read from the triplestore.

### Current naming inconsistencies to resolve

| Current | In SPARQL | In blobject.js | In harmonizer | Resolution |
|---------|-----------|----------------|---------------|------------|
| Term vs Octothorpe | `octo:Term` | strings | `hashtag` key | Standardize on `Term` in vocab, `Octothorpe` is the relationship |
| `date` vs `indexed` | `octo:indexed` | `date` field | not extracted | Vocab uses `indexed`, blobject projects as `date` (documented) |
| Endorse casing | `octo:endorses` (verb) | `endorse` (lower) | `endorse` key | Vocab class: `Endorse`, predicate: `endorses` |
| Button casing | stored as `octo:Button` | `button` (lower) | `button` key | Vocab class: `Button` |
| Backlink default | implicit default subtype | `Backlink` | n/a (it's link + mutual) | Vocab class: `Backlink` |

---

## Task 1: Define the canonical RDF vocabulary document

Write `packages/core/ld/vocabulary.js` -- the single source of truth for all OP vocab terms. This is a data file, not runtime logic.

**Files:**
- Create: `packages/core/ld/vocabulary.js`
- Test: `src/tests/vocabulary.test.js`

**Step 1: Write the vocabulary definition**

The vocabulary declares all classes, properties, and relationship subtypes used by OP. Each entry includes its full IRI, type (class/property), range (literal/uri/timestamp), and whether it's part of the canonical blobject projection.

```javascript
// packages/core/ld/vocabulary.js

export const NAMESPACE = 'https://vocab.octothorp.es#'

/**
 * OP Vocabulary — canonical term definitions.
 *
 * Each term declares:
 *   id        — local name (appended to NAMESPACE for full IRI)
 *   type      — 'class' | 'property' | 'relationship'
 *   comment   — human-readable description
 *   range     — for properties: 'literal' | 'uri' | 'timestamp' | 'boolean'
 *   domain    — which class(es) this property applies to
 *   projectTo — where this appears in the blobject projection (null = not projected)
 */

// ── Classes ──────────────────────────────────────────────

export const classes = {
  Page: {
    id: 'Page',
    type: 'class',
    comment: 'An indexed web resource identified by URI.',
  },
  Term: {
    id: 'Term',
    type: 'class',
    comment: 'A hashtag-like tag. URI pattern: {instance}~/{term}',
  },
  Origin: {
    id: 'Origin',
    type: 'class',
    comment: 'A verified domain that has opted in to indexing.',
  },
  Webring: {
    id: 'Webring',
    type: 'class',
    comment: 'A webring index page that declares member origins.',
  },
  Relationship: {
    id: 'Relationship',
    type: 'class',
    comment: 'A typed connection between two Pages, carried by a blank node.',
  },
  Label: {
    id: 'Label',
    type: 'class',
    comment: 'A content label applied to a Page (see AT Protocol label spec).',
  },
}

// ── Relationship Subtypes (subclasses of Relationship) ───

export const relationshipSubtypes = {
  Backlink: {
    id: 'Backlink',
    type: 'class',
    parent: 'Relationship',
    comment: 'A validated bidirectional link between two Pages.',
  },
  Cite: {
    id: 'Cite',
    type: 'class',
    parent: 'Relationship',
    comment: 'A citation from one Page to another.',
  },
  Bookmark: {
    id: 'Bookmark',
    type: 'class',
    parent: 'Relationship',
    comment: 'A bookmarked Page.',
  },
  Endorse: {
    id: 'Endorse',
    type: 'class',
    parent: 'Relationship',
    comment: 'An endorsement of one Origin by another.',
  },
  Button: {
    id: 'Button',
    type: 'class',
    parent: 'Relationship',
    comment: 'An 88x31 button link between Pages.',
  },
}

// ── Properties ───────────────────────────────────────────

export const properties = {
  // Page metadata
  title: {
    id: 'title',
    type: 'property',
    domain: ['Page'],
    range: 'literal',
    comment: 'The title of a Page.',
    projectTo: 'title',
  },
  description: {
    id: 'description',
    type: 'property',
    domain: ['Page'],
    range: 'literal',
    comment: 'A short description of a Page.',
    projectTo: 'description',
  },
  image: {
    id: 'image',
    type: 'property',
    domain: ['Page'],
    range: 'uri',
    comment: 'A representative image URI for a Page.',
    projectTo: 'image',
  },
  contact: {
    id: 'contact',
    type: 'property',
    domain: ['Page'],
    range: 'literal',
    comment: 'Contact information for a Page.',
    projectTo: null, // extracted during indexing, not in blobject
  },
  pageType: {
    id: 'type',
    type: 'property',
    domain: ['Page'],
    range: 'literal',
    comment: 'The content type of a Page (e.g. article, blog, portfolio).',
    projectTo: null, // extracted during indexing, not in blobject
  },

  // Timestamps
  indexed: {
    id: 'indexed',
    type: 'property',
    domain: ['Page'],
    range: 'timestamp',
    comment: 'When the OP server last indexed this Page. Projected as "date" in blobjects.',
    projectTo: 'date',
  },
  postDate: {
    id: 'postDate',
    type: 'property',
    domain: ['Page'],
    range: 'timestamp',
    comment: 'Author-declared publication date.',
    projectTo: 'postDate',
  },
  created: {
    id: 'created',
    type: 'property',
    domain: ['Term', 'Relationship'],
    range: 'timestamp',
    comment: 'When this Term or Relationship was first created.',
    projectTo: null,
  },
  used: {
    id: 'used',
    type: 'property',
    domain: ['Term'],
    range: 'timestamp',
    comment: 'When this Term was last referenced by an indexing operation.',
    projectTo: null,
  },

  // Core relationship
  octothorpes: {
    id: 'octothorpes',
    type: 'property',
    domain: ['Page'],
    range: 'uri', // points at Term URI or Relationship blank node
    comment: 'The core OP predicate. A Page octothorpes a Term (tagging) or a Relationship blank node (linking).',
    projectTo: 'octothorpes',
  },

  // Relationship blank node properties
  url: {
    id: 'url',
    type: 'property',
    domain: ['Relationship'],
    range: 'uri',
    comment: 'The target URI on a Relationship blank node.',
    projectTo: null, // projected as "uri" inside octothorpes array objects
  },

  // Structural
  hasPart: {
    id: 'hasPart',
    type: 'property',
    domain: ['Origin'],
    range: 'uri',
    comment: 'An Origin has a Page as part of its domain.',
    projectTo: null,
  },
  hasMember: {
    id: 'hasMember',
    type: 'property',
    domain: ['Webring'],
    range: 'uri',
    comment: 'A Webring includes an Origin as a member.',
    projectTo: null,
  },
  endorses: {
    id: 'endorses',
    type: 'property',
    domain: ['Origin'],
    range: 'uri',
    comment: 'An Origin endorses another Origin (enables backlinks between domains).',
    projectTo: null,
  },
  verified: {
    id: 'verified',
    type: 'property',
    domain: ['Origin'],
    range: 'boolean',
    comment: 'Whether an Origin has been verified for indexing.',
    projectTo: null,
  },

  // NOTE: indexPolicy, indexServer, indexHarmonizer are NOT vocab terms.
  // They are extraction directives used by harmonizers and consumed by
  // the indexing pipeline. They belong to client profile / indexing config.
}

// ── Blobject Projection Schema ───────────────────────────
//
// Documents the canonical blobject shape as produced by
// getBlobjectFromResponse(). This is the default projection
// that clients receive. Client vocab extensions (#194) can
// add fields via documentRecord but cannot remove canonical fields.
//
// {
//   "@id": uri,                    ← Page URI
//   "title": string | null,        ← octo:title
//   "description": string | null,  ← octo:description
//   "image": uri | null,           ← octo:image
//   "date": timestamp | null,      ← octo:indexed
//   "postDate": timestamp | null,  ← octo:postDate
//   "octothorpes": [               ← octo:octothorpes
//     "termString",                    Term URI trimmed to bare string
//     {                                Relationship blank node projected:
//       "uri": uri,                      ← octo:url
//       "type": string,                  ← rdf:type (minus octo: prefix)
//       "terms": [string]                ← relationship terms (optional)
//     }
//   ],
//   "documentRecord": { ... }      ← client-defined extension (optional)
// }

export const canonicalBlobjectFields = [
  '@id', 'title', 'description', 'image', 'date', 'postDate', 'octothorpes'
]

// ── Helpers ──────────────────────────────────────────────

/** Full IRI for a vocab term */
export const iri = (localName) => `${NAMESPACE}${localName}`

/** All vocab terms as a flat object */
export const allTerms = {
  ...classes,
  ...relationshipSubtypes,
  ...properties,
}
```

**Step 2: Write tests for the vocabulary**

```javascript
// src/tests/vocabulary.test.js
import { describe, it, expect } from 'vitest'
import {
  NAMESPACE, classes, relationshipSubtypes, properties,
  canonicalBlobjectFields, iri, allTerms
} from 'octothorpes/ld/vocabulary.js'

describe('OP Vocabulary', () => {
  it('should use the canonical namespace', () => {
    expect(NAMESPACE).toBe('https://vocab.octothorp.es#')
  })

  it('should define all core classes', () => {
    expect(classes.Page).toBeDefined()
    expect(classes.Term).toBeDefined()
    expect(classes.Origin).toBeDefined()
    expect(classes.Webring).toBeDefined()
    expect(classes.Relationship).toBeDefined()
    expect(classes.Label).toBeDefined()
  })

  it('should define all relationship subtypes with Relationship as parent', () => {
    for (const [name, def] of Object.entries(relationshipSubtypes)) {
      expect(def.parent).toBe('Relationship')
      expect(def.type).toBe('class')
    }
  })

  it('should define relationship subtypes with consistent capitalization', () => {
    const names = Object.keys(relationshipSubtypes)
    for (const name of names) {
      expect(name[0]).toBe(name[0].toUpperCase())
    }
  })

  it('should map indexed to date in blobject projection', () => {
    expect(properties.indexed.projectTo).toBe('date')
  })

  it('should not include indexing directives as vocab terms', () => {
    expect(properties.indexPolicy).toBeUndefined()
    expect(properties.indexServer).toBeUndefined()
    expect(properties.indexHarmonizer).toBeUndefined()
  })

  it('should produce correct IRIs', () => {
    expect(iri('Page')).toBe('https://vocab.octothorp.es#Page')
    expect(iri('octothorpes')).toBe('https://vocab.octothorp.es#octothorpes')
  })

  it('should list canonical blobject fields', () => {
    expect(canonicalBlobjectFields).toContain('@id')
    expect(canonicalBlobjectFields).toContain('title')
    expect(canonicalBlobjectFields).toContain('octothorpes')
    expect(canonicalBlobjectFields).not.toContain('documentRecord')
  })

  it('should include all terms in allTerms', () => {
    expect(allTerms.Page).toBeDefined()
    expect(allTerms.Backlink).toBeDefined()
    expect(allTerms.title).toBeDefined()
  })
})
```

**Step 3: Run tests**

Run: `npx vitest run src/tests/vocabulary.test.js`
Expected: All pass.

**Step 4: Update package.json exports to expose ld/ subpath**

The test imports `octothorpes/ld/vocabulary.js`. Check that the package.json `files` field already includes `ld/` (it does). Add a subpath export if needed:

In `packages/core/package.json`, verify `exports` includes subpath access or that direct file imports work. The current `"files": ["*.js", "ld/"]` should suffice for file: installs.

**Step 5: Commit**

```
feat(#195): define canonical OP RDF vocabulary
```

---

## Task 2: Update the JSON-LD context

Rewrite `packages/core/ld/context.json` to reflect the actual vocabulary. Remove stale terms (`prefLabel`, `draft`), add all properties and classes that exist in practice.

**Files:**
- Modify: `packages/core/ld/context.json`
- Test: `src/tests/vocabulary.test.js` (extend)

**Step 1: Write a test for context completeness**

```javascript
// Add to src/tests/vocabulary.test.js
import context from 'octothorpes/ld/context.json' assert { type: 'json' }

describe('JSON-LD Context', () => {
  it('should use the canonical base and vocab', () => {
    expect(context['@base']).toBe('https://vocab.octothorp.es')
    expect(context['@vocab']).toBe('#')
  })

  it('should define all classes', () => {
    expect(context.Page).toBe('Page')
    expect(context.Term).toBe('Term')
    expect(context.Origin).toBe('Origin')
    expect(context.Webring).toBe('Webring')
  })

  it('should define octothorpes as a set of IRIs', () => {
    expect(context.octothorpes['@id']).toBe('octothorpes')
    expect(context.octothorpes['@container']).toBe('@set')
  })

  it('should define all relationship subtypes', () => {
    expect(context.Backlink).toBe('Backlink')
    expect(context.Cite).toBe('Cite')
    expect(context.Bookmark).toBe('Bookmark')
    expect(context.Endorse).toBe('Endorse')
    expect(context.Button).toBe('Button')
  })

  it('should define url as a URI property', () => {
    expect(context.url['@type']).toBe('@id')
  })

  it('should not contain stale terms', () => {
    expect(context.prefLabel).toBeUndefined()
    expect(context.draft).toBeUndefined()
    // Octothorpe was the old class name for Term
    expect(context.Octothorpe).toBeUndefined()
  })
})
```

**Step 2: Run test, confirm it fails against current context.json**

Run: `npx vitest run src/tests/vocabulary.test.js`
Expected: Several failures (missing Page, Term, stale prefLabel, etc.)

**Step 3: Rewrite context.json**

```json
{
  "@base": "https://vocab.octothorp.es",
  "@vocab": "#",
  "id": "@id",
  "type": "@type",

  "Page": "Page",
  "Term": "Term",
  "Origin": "Origin",
  "Webring": "Webring",
  "Relationship": "Relationship",
  "Label": "Label",

  "Backlink": "Backlink",
  "Cite": "Cite",
  "Bookmark": "Bookmark",
  "Endorse": "Endorse",
  "Button": "Button",

  "title": "title",
  "description": "description",
  "image": { "@id": "image", "@type": "@id" },
  "contact": "contact",
  "indexed": "indexed",
  "postDate": "postDate",
  "created": "created",
  "used": "used",

  "octothorpes": {
    "@id": "octothorpes",
    "@type": "@id",
    "@container": "@set"
  },
  "octothorpedBy": {
    "@reverse": "octothorpes"
  },

  "url": { "@id": "url", "@type": "@id" },

  "hasPart": { "@id": "hasPart", "@type": "@id" },
  "partOf": { "@reverse": "hasPart" },
  "hasMember": { "@id": "hasMember", "@type": "@id" },
  "endorses": { "@id": "endorses", "@type": "@id" },
  "verified": "verified",
  "challenge": "challenge"
}
```

**Step 4: Run tests, confirm pass**

Run: `npx vitest run src/tests/vocabulary.test.js`
Expected: All pass.

**Step 5: Commit**

```
feat(#195): update JSON-LD context to match canonical vocabulary
```

---

## Task 3: Define the client vocabulary extension schema

Create the schema definition for client vocab extensions. This is the config shape a developer passes to `createClient` to declare custom predicates and their projection into `documentRecord`.

**Files:**
- Create: `packages/core/clientVocab.js`
- Test: `src/tests/clientVocab.test.js`

**Step 1: Write tests for vocab validation**

```javascript
// src/tests/clientVocab.test.js
import { describe, it, expect } from 'vitest'
import { validateClientVocab, mergeVocab } from 'octothorpes/clientVocab.js'

describe('Client Vocabulary', () => {
  it('should accept a valid client vocab', () => {
    const vocab = {
      namespace: 'https://myapp.example.com/vocab#',
      predicates: {
        author: { range: 'literal' },
        rating: { range: 'literal' },
      }
    }
    expect(() => validateClientVocab(vocab)).not.toThrow()
  })

  it('should require a namespace', () => {
    const vocab = {
      predicates: { author: { range: 'literal' } }
    }
    expect(() => validateClientVocab(vocab)).toThrow(/namespace/)
  })

  it('should reject predicates that collide with canonical vocab', () => {
    const vocab = {
      namespace: 'https://myapp.example.com/vocab#',
      predicates: {
        title: { range: 'literal' }, // collides with octo:title
      }
    }
    expect(() => validateClientVocab(vocab)).toThrow(/title/)
  })

  it('should require range on each predicate', () => {
    const vocab = {
      namespace: 'https://myapp.example.com/vocab#',
      predicates: {
        author: {}, // missing range
      }
    }
    expect(() => validateClientVocab(vocab)).toThrow(/range/)
  })

  it('should accept literal and uri ranges', () => {
    const vocab = {
      namespace: 'https://myapp.example.com/vocab#',
      predicates: {
        author: { range: 'literal' },
        homepage: { range: 'uri' },
        publishedAt: { range: 'timestamp' },
      }
    }
    expect(() => validateClientVocab(vocab)).not.toThrow()
  })

  describe('mergeVocab', () => {
    it('should produce a merged vocab with canonical + client predicates', () => {
      const clientVocab = {
        namespace: 'https://myapp.example.com/vocab#',
        predicates: {
          author: { range: 'literal' },
        }
      }
      const merged = mergeVocab(clientVocab)
      // Canonical fields still present
      expect(merged.canonical).toContain('title')
      expect(merged.canonical).toContain('octothorpes')
      // Client fields in documentRecord mapping
      expect(merged.documentRecord.author).toEqual({
        predicate: 'https://myapp.example.com/vocab#author',
        range: 'literal',
      })
    })

    it('should allow nulling out canonical fields', () => {
      const clientVocab = {
        namespace: 'https://myapp.example.com/vocab#',
        predicates: {},
        suppress: ['contact', 'pageType'],
      }
      const merged = mergeVocab(clientVocab)
      expect(merged.suppressed).toContain('contact')
      expect(merged.suppressed).toContain('pageType')
    })

    it('should not allow suppressing required canonical fields', () => {
      const clientVocab = {
        namespace: 'https://myapp.example.com/vocab#',
        predicates: {},
        suppress: ['@id'], // can't suppress the identifier
      }
      expect(() => mergeVocab(clientVocab)).toThrow(/@id/)
    })
  })
})
```

**Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/tests/clientVocab.test.js`
Expected: FAIL (module not found)

**Step 3: Implement clientVocab.js**

```javascript
// packages/core/clientVocab.js
import { properties, canonicalBlobjectFields } from './ld/vocabulary.js'

const VALID_RANGES = ['literal', 'uri', 'timestamp', 'boolean']
const UNSUPPRESSABLE = ['@id', 'octothorpes']

/**
 * Validates a client vocabulary definition.
 * @param {Object} vocab
 * @param {string} vocab.namespace - Client's namespace URI
 * @param {Object} vocab.predicates - Map of name → { range }
 * @param {string[]} [vocab.suppress] - Canonical fields to suppress
 * @throws {Error} if invalid
 */
export const validateClientVocab = (vocab) => {
  if (!vocab.namespace || typeof vocab.namespace !== 'string') {
    throw new Error('Client vocab requires a namespace URI')
  }

  const canonicalNames = Object.keys(properties)

  for (const [name, def] of Object.entries(vocab.predicates || {})) {
    if (canonicalNames.includes(name)) {
      throw new Error(
        `Predicate "${name}" collides with canonical OP vocab. ` +
        `Use a different name or suppress the canonical field.`
      )
    }
    if (!def.range || !VALID_RANGES.includes(def.range)) {
      throw new Error(
        `Predicate "${name}" requires a range (${VALID_RANGES.join(', ')})`
      )
    }
  }
}

/**
 * Merges a client vocab with the canonical OP vocab.
 * Returns a projection config used by getBlobjectFromResponse.
 *
 * @param {Object} clientVocab
 * @returns {{ canonical: string[], suppressed: string[], documentRecord: Object }}
 */
export const mergeVocab = (clientVocab) => {
  validateClientVocab(clientVocab)

  const suppressed = clientVocab.suppress || []
  for (const field of suppressed) {
    if (UNSUPPRESSABLE.includes(field)) {
      throw new Error(`Cannot suppress required field "${field}"`)
    }
  }

  const documentRecord = {}
  for (const [name, def] of Object.entries(clientVocab.predicates || {})) {
    documentRecord[name] = {
      predicate: `${clientVocab.namespace}${name}`,
      range: def.range,
    }
  }

  return {
    canonical: canonicalBlobjectFields,
    suppressed,
    documentRecord,
  }
}
```

**Step 4: Run tests, confirm pass**

Run: `npx vitest run src/tests/clientVocab.test.js`
Expected: All pass.

**Step 5: Commit**

```
feat(#194): add client vocabulary validation and merge
```

---

## Task 4: Wire client vocab into createClient

Accept an optional `vocabulary` config in `createClient` and pass the merged vocab through to the blobject formatter.

**Files:**
- Modify: `packages/core/index.js`
- Test: `src/tests/clientVocab.test.js` (extend)

**Step 1: Write integration test**

```javascript
// Add to src/tests/clientVocab.test.js
import { createClient } from 'octothorpes'

describe('createClient with vocabulary', () => {
  it('should accept a vocabulary config', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
      vocabulary: {
        namespace: 'https://myapp.example.com/vocab#',
        predicates: {
          author: { range: 'literal' },
        }
      }
    })
    expect(op).toBeDefined()
    expect(op.vocabulary).toBeDefined()
    expect(op.vocabulary.documentRecord.author).toBeDefined()
  })

  it('should work without a vocabulary config', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    expect(op).toBeDefined()
    expect(op.vocabulary).toBeNull()
  })

  it('should reject invalid vocabulary at client creation', () => {
    expect(() => createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
      vocabulary: {
        predicates: { author: { range: 'literal' } }
        // missing namespace
      }
    })).toThrow(/namespace/)
  })
})
```

**Step 2: Run tests, confirm fail**

Run: `npx vitest run src/tests/clientVocab.test.js`
Expected: FAIL (vocabulary not on client)

**Step 3: Update createClient**

In `packages/core/index.js`, add vocabulary handling:

```javascript
// Add import at top
import { mergeVocab } from './clientVocab.js'

// Inside createClient, after policy normalization:
const vocabulary = config.vocabulary ? mergeVocab(config.vocabulary) : null

// Add to return object:
return {
  indexSource,
  get: ({ what, by, ...rest } = {}) => api.get(what, by, rest),
  getfast: api.fast,
  harmonize,
  harmonizer: registry,
  vocabulary,
  sparql,
  api,
}
```

**Step 4: Run tests, confirm pass**

Run: `npx vitest run src/tests/clientVocab.test.js`
Expected: All pass.

**Step 5: Run full test suite to confirm no regressions**

Run: `npx vitest run`
Expected: All existing tests still pass.

**Step 6: Commit**

```
feat(#194): wire client vocabulary into createClient
```

---

## Task 5: Add content labels to the vocabulary (#192)

This task adds the `Label` class and label-related properties to the vocabulary. Labels follow the AT Protocol label spec pattern -- they are applied to Pages and carry a value and optional metadata.

**Note:** This task defines the vocab terms and harmonizer extraction. Actual storage (SPARQL INSERT for labels) and retrieval (blobject projection of labels) are follow-up work that depends on deciding how labels are stored in the triplestore.

**Files:**
- Modify: `packages/core/ld/vocabulary.js` (already has Label class stub)
- Modify: `packages/core/harmonizers.js` (add label extraction to default harmonizer)
- Test: `src/tests/vocabulary.test.js` (extend)
- Test: `src/tests/harmonizer-labels.test.js`

**Step 1: Research the AT Protocol label spec**

Fetch https://atproto.com/specs/label and review the label structure. Key fields to map:
- `val` — the label value (string)
- `src` — who applied the label (DID/URI)
- `uri` — what the label is applied to
- `neg` — whether this negates a previous label
- `cts` — creation timestamp

For OP, the minimal mapping is:
- `octo:label` — predicate on Page, points to a Label blank node
- `octo:labelValue` — the label string (on the blank node)
- `octo:labelSource` — who applied it (on the blank node, optional)

**Step 2: Add label properties to vocabulary.js**

Add to the `properties` object in `packages/core/ld/vocabulary.js`:

```javascript
  label: {
    id: 'label',
    type: 'property',
    domain: ['Page'],
    range: 'uri', // points to Label blank node
    comment: 'A content label applied to this Page.',
    projectTo: 'labels',
  },
  labelValue: {
    id: 'labelValue',
    type: 'property',
    domain: ['Label'],
    range: 'literal',
    comment: 'The string value of a content label.',
    projectTo: null,
  },
  labelSource: {
    id: 'labelSource',
    type: 'property',
    domain: ['Label'],
    range: 'uri',
    comment: 'The origin or authority that applied this label.',
    projectTo: null,
  },
```

Add `'labels'` as an optional entry in the blobject projection comment (but NOT to `canonicalBlobjectFields` yet — labels are opt-in).

**Step 3: Add label extraction to default harmonizer**

Add to the `subject` block of the default harmonizer in `packages/core/harmonizers.js`:

```javascript
"labels": [
  {
    "selector": "meta[name='octo:label']",
    "attribute": "content"
  },
  {
    "selector": "meta[property='octo:label']",
    "attribute": "content"
  }
]
```

This allows pages to declare labels via:
```html
<meta name="octo:label" content="nsfw">
<meta name="octo:label" content="satire">
```

**Step 4: Write test for label extraction**

```javascript
// src/tests/harmonizer-labels.test.js
import { describe, it, expect } from 'vitest'
import { harmonizeSource } from 'octothorpes'

const mockGetHarmonizer = async (id) => {
  // Return null to use default
  throw new Error('Harmonizer not found')
}

describe('Label extraction', () => {
  it('should extract labels from meta tags', async () => {
    const html = `
      <html><head>
        <title>Test</title>
        <meta name="octo:label" content="nsfw">
        <meta name="octo:label" content="satire">
      </head><body></body></html>
    `
    const result = await harmonizeSource(html, 'default', {
      getHarmonizer: mockGetHarmonizer,
    })
    // The exact shape depends on how harmonizeSource handles
    // array extraction — verify labels are present
    expect(result.labels).toBeDefined()
    expect(result.labels).toContain('nsfw')
    expect(result.labels).toContain('satire')
  })

  it('should return empty labels when none declared', async () => {
    const html = `<html><head><title>Test</title></head><body></body></html>`
    const result = await harmonizeSource(html, 'default', {
      getHarmonizer: mockGetHarmonizer,
    })
    // labels may be undefined or empty array
    expect(result.labels?.length ?? 0).toBe(0)
  })
})
```

**Step 5: Run tests**

Run: `npx vitest run src/tests/harmonizer-labels.test.js src/tests/vocabulary.test.js`
Expected: All pass.

**Step 6: Commit**

```
feat(#192): add content labels to OP vocabulary and default harmonizer
```

---

## Task 6: Update context.json with label terms and add to package exports

**Files:**
- Modify: `packages/core/ld/context.json`
- Modify: `packages/core/index.js` (re-export clientVocab)
- Modify: `packages/core/package.json` (if exports need updating)

**Step 1: Add label terms to context.json**

```json
"Label": "Label",
"label": {
  "@id": "label",
  "@container": "@set"
},
"labelValue": "labelValue",
"labelSource": { "@id": "labelSource", "@type": "@id" }
```

**Step 2: Add clientVocab exports to index.js**

```javascript
export { validateClientVocab, mergeVocab } from './clientVocab.js'
```

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All pass.

**Step 4: Commit**

```
feat(#192, #194): update context.json with labels, export clientVocab
```

---

## What this does NOT cover (future work)

These are deliberately deferred and should be tracked as follow-up issues:

1. **Label storage and retrieval** — Writing label triples during indexing and projecting them in `getBlobjectFromResponse`. Requires deciding on SPARQL INSERT pattern for label blank nodes.

2. **documentRecord storage and retrieval** — The client vocab defines the schema, but actually writing/reading custom predicate triples needs changes to the indexer and query builders.

3. **Blobject formatter integration** — `getBlobjectFromResponse` doesn't yet use the vocabulary to drive its projection. Currently it's hardcoded. Wiring the vocab in so that `vocabulary.documentRecord` fields get projected is a separate task.

4. **On-demand DR harmonization (#166)** — Storing harmonizer references and harmonizing at request time. Depends on documentRecord storage working.

5. **Setup factory / guardrails** — Tooling that validates a harmonizer matches a client vocab. Explicitly deferred per design discussion.

6. **vocab.octothorp.es hosting** — Serving the vocabulary as a dereferenceable RDF document at the namespace URI. Currently the namespace is declared but not hosted.
