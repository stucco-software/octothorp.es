import { describe, it, expect } from 'vitest'
import {
  buildResolutionIndex,
  resolveWikilinks,
  applyResolution,
} from '../../packages/core/wikilinkResolution.js'

// Small helper to build a document descriptor the way C13 will:
// each indexed .md contributes { uri, path, wikilinks }.
const doc = (uri, path, wikilinks = []) => ({ uri, path, wikilinks })
const wl = (target, extra = {}) => ({
  target,
  basename: target.split('/').pop(),
  heading: null,
  alias: null,
  raw: target,
  ...extra,
})

describe('buildResolutionIndex', () => {
  it('keys documents by basename derived from path', () => {
    const index = buildResolutionIndex([
      doc('https://x/a', 'notes/Alpha.md'),
      doc('https://x/b', 'notes/Beta.md'),
    ])
    expect(index.get('Alpha').map((e) => e.uri)).toEqual(['https://x/a'])
    expect(index.get('Beta').map((e) => e.uri)).toEqual(['https://x/b'])
  })

  it('records multiple docs sharing a basename (collision) under one key', () => {
    const index = buildResolutionIndex([
      doc('https://x/1', 'projects/Alpha.md'),
      doc('https://x/2', 'archive/Alpha.md'),
    ])
    expect(index.get('Alpha')).toHaveLength(2)
  })

  it('honours an explicit basename over the path-derived one', () => {
    const index = buildResolutionIndex([{ uri: 'https://x/a', path: 'notes/whatever.md', basename: 'Canonical' }])
    expect(index.has('Canonical')).toBe(true)
    expect(index.has('whatever')).toBe(false)
  })
})

describe('resolveWikilinks — basic resolution', () => {
  it('resolves a [[basename]] to the target document URL and emits a link octothorpe', () => {
    const docs = [
      doc('https://x/a', 'Alpha.md', [wl('Beta')]),
      doc('https://x/b', 'Beta.md'),
    ]
    const { byUri } = resolveWikilinks(docs)
    const a = byUri.get('https://x/a')
    expect(a.resolvedLinks).toHaveLength(1)
    expect(a.resolvedLinks[0]).toMatchObject({ basename: 'Beta', uri: 'https://x/b' })
    expect(a.unresolvedLinks).toEqual([])
    expect(a.octothorpes).toEqual([{ type: 'link', uri: 'https://x/b' }])
  })

  it('records an unresolved link (no matching doc) without dropping it and without an edge', () => {
    const docs = [doc('https://x/a', 'Alpha.md', [wl('Ghost')])]
    const { byUri } = resolveWikilinks(docs)
    const a = byUri.get('https://x/a')
    expect(a.resolvedLinks).toEqual([])
    expect(a.unresolvedLinks).toHaveLength(1)
    expect(a.unresolvedLinks[0]).toMatchObject({ basename: 'Ghost', reason: 'no-match' })
    expect(a.octothorpes).toEqual([])
  })

  it('resolves mutual links A <-> B (deferred whole-instance pass)', () => {
    const docs = [
      doc('https://x/a', 'Alpha.md', [wl('Beta')]),
      doc('https://x/b', 'Beta.md', [wl('Alpha')]),
    ]
    const { byUri } = resolveWikilinks(docs)
    expect(byUri.get('https://x/a').octothorpes).toEqual([{ type: 'link', uri: 'https://x/b' }])
    expect(byUri.get('https://x/b').octothorpes).toEqual([{ type: 'link', uri: 'https://x/a' }])
  })
})

describe('resolveWikilinks — occurrences, dedupe, self-links', () => {
  it('preserves every occurrence in resolvedLinks (for ref-counting) but dedupes octothorpes edges', () => {
    const docs = [
      doc('https://x/a', 'Alpha.md', [wl('Beta'), wl('Beta'), wl('Beta')]),
      doc('https://x/b', 'Beta.md'),
    ]
    const a = resolveWikilinks(docs).byUri.get('https://x/a')
    expect(a.resolvedLinks).toHaveLength(3)
    expect(a.octothorpes).toEqual([{ type: 'link', uri: 'https://x/b' }])
  })

  it('does not emit a self-edge when a document links to itself', () => {
    const docs = [doc('https://x/a', 'Alpha.md', [wl('Alpha')])]
    const a = resolveWikilinks(docs).byUri.get('https://x/a')
    expect(a.resolvedLinks).toHaveLength(1) // still reported as resolved
    expect(a.octothorpes).toEqual([]) // but no self-mention edge
  })
})

describe('resolveWikilinks — collisions', () => {
  it('disambiguates a collision via an authored path qualifier', () => {
    const docs = [
      doc('https://x/proj', 'projects/Alpha.md'),
      doc('https://x/arch', 'archive/Alpha.md'),
      doc('https://x/src', 'src.md', [wl('archive/Alpha')]),
    ]
    const src = resolveWikilinks(docs).byUri.get('https://x/src')
    expect(src.resolvedLinks[0].uri).toBe('https://x/arch')
    expect(src.unresolvedLinks).toEqual([])
  })

  it('falls back to the nearest-in-folder candidate when a bare basename collides', () => {
    const docs = [
      doc('https://x/proj', 'projects/Alpha.md'),
      doc('https://x/arch', 'archive/deep/Alpha.md'),
      doc('https://x/src', 'projects/notes/src.md', [wl('Alpha')]),
    ]
    const src = resolveWikilinks(docs).byUri.get('https://x/src')
    // 'projects/notes/src.md' shares the 'projects' folder prefix with projects/Alpha.md
    expect(src.resolvedLinks[0].uri).toBe('https://x/proj')
  })

  it('marks a qualified link unresolved when the qualifier matches no document', () => {
    const docs = [
      doc('https://x/proj', 'projects/Alpha.md'),
      doc('https://x/arch', 'archive/Alpha.md'),
      doc('https://x/src', 'src.md', [wl('nonexistent/Alpha')]),
    ]
    const src = resolveWikilinks(docs).byUri.get('https://x/src')
    expect(src.resolvedLinks).toEqual([])
    expect(src.unresolvedLinks[0]).toMatchObject({ reason: 'no-match' })
  })
})

describe('resolveWikilinks — rename scenario', () => {
  it('surfaces a stale link as unresolved after the target basename changes', () => {
    // Beta.md was renamed to BetaRenamed.md; Alpha still authored [[Beta]].
    const docs = [
      doc('https://x/a', 'Alpha.md', [wl('Beta')]),
      doc('https://x/b', 'BetaRenamed.md'),
    ]
    const a = resolveWikilinks(docs).byUri.get('https://x/a')
    expect(a.resolvedLinks).toEqual([])
    expect(a.unresolvedLinks[0]).toMatchObject({ basename: 'Beta', reason: 'no-match' })
  })
})

describe('applyResolution', () => {
  it('appends resolved link edges to a blobject.octothorpes and attaches the resolved/unresolved report', () => {
    const blob = { '@id': 'https://x/a', octothorpes: [{ type: 'hashtag', uri: 'https://x/~/tag' }] }
    const result = {
      octothorpes: [{ type: 'link', uri: 'https://x/b' }],
      resolvedLinks: [{ basename: 'Beta', uri: 'https://x/b' }],
      unresolvedLinks: [{ basename: 'Ghost', reason: 'no-match' }],
    }
    const out = applyResolution(blob, result)
    expect(out.octothorpes).toEqual([
      { type: 'hashtag', uri: 'https://x/~/tag' },
      { type: 'link', uri: 'https://x/b' },
    ])
    expect(out.resolvedLinks).toEqual(result.resolvedLinks)
    expect(out.unresolvedLinks).toEqual(result.unresolvedLinks)
  })

  it('does not duplicate an edge that is already present on octothorpes', () => {
    const blob = { '@id': 'https://x/a', octothorpes: [{ type: 'link', uri: 'https://x/b' }] }
    const out = applyResolution(blob, { octothorpes: [{ type: 'link', uri: 'https://x/b' }], resolvedLinks: [], unresolvedLinks: [] })
    expect(out.octothorpes).toEqual([{ type: 'link', uri: 'https://x/b' }])
  })
})
