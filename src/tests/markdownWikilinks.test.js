import { describe, it, expect } from 'vitest'
import markdownHandler, {
  buildTargetMap,
  AMBIGUOUS,
} from '../../packages/core/handlers/markdown/handler.js'
import { extractWikilinks } from '../../packages/core/handlers/markdown/wikilinks.js'

describe('extractWikilinks — grammar', () => {
  it('extracts a simple [[target]]', () => {
    const links = extractWikilinks('see [[Alpha]] for more')
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ target: 'Alpha', basename: 'Alpha', alias: null, heading: null })
  })

  it('extracts [[target|alias]]', () => {
    const links = extractWikilinks('see [[Alpha|the first letter]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', basename: 'Alpha', alias: 'the first letter', heading: null })
  })

  it('extracts [[target#heading]]', () => {
    const links = extractWikilinks('see [[Alpha#Intro]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', basename: 'Alpha', heading: 'Intro', alias: null })
  })

  it('extracts the combination [[target#heading|alias]]', () => {
    const links = extractWikilinks('see [[Alpha#Intro|start here]]')
    expect(links[0]).toMatchObject({
      target: 'Alpha',
      basename: 'Alpha',
      heading: 'Intro',
      alias: 'start here',
    })
  })

  it('preserves a path qualifier in target but derives basename from the last segment', () => {
    const links = extractWikilinks('[[projects/Alpha]] and [[notes/sub/Beta#H|B]]')
    expect(links[0]).toMatchObject({ target: 'projects/Alpha', basename: 'Alpha' })
    expect(links[1]).toMatchObject({ target: 'notes/sub/Beta', basename: 'Beta', heading: 'H', alias: 'B' })
  })

  it('strips a trailing .md extension from the target', () => {
    const links = extractWikilinks('[[Alpha.md]] [[folder/Beta.md#H]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', basename: 'Alpha' })
    expect(links[1]).toMatchObject({ target: 'folder/Beta', basename: 'Beta', heading: 'H' })
  })

  it('captures a block-reference heading (#^blockid)', () => {
    const links = extractWikilinks('[[Alpha#^abc123]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', heading: '^abc123' })
  })

  it('extracts multiple links and preserves every occurrence (for later ref-counting)', () => {
    const links = extractWikilinks('[[A]] then [[B]] then [[A]] again')
    expect(links.map((l) => l.basename)).toEqual(['A', 'B', 'A'])
  })

  it('returns [] when there are no wikilinks', () => {
    expect(extractWikilinks('plain text with [a link](http://x) and no wikilinks')).toEqual([])
  })

  it('exposes the raw inner text for traceability', () => {
    const links = extractWikilinks('[[folder/Alpha#Intro|start]]')
    expect(links[0].raw).toBe('folder/Alpha#Intro|start')
  })

  it('trims whitespace inside the brackets', () => {
    const links = extractWikilinks('[[  Alpha  #  Intro  |  start  ]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', heading: 'Intro', alias: 'start' })
  })
})

describe('extractWikilinks — code spans & fences are ignored', () => {
  it('ignores wikilinks inside an inline code span', () => {
    expect(extractWikilinks('use `[[NotALink]]` syntax')).toEqual([])
  })

  it('extracts real links but not the ones inside inline code on the same line', () => {
    const links = extractWikilinks('real [[Alpha]] but `[[Fake]]` here')
    expect(links.map((l) => l.basename)).toEqual(['Alpha'])
  })

  it('ignores wikilinks inside a fenced code block (```)', () => {
    const md = ['before [[Alpha]]', '```', '[[Fake]]', '[[AlsoFake]]', '```', 'after [[Beta]]'].join('\n')
    const links = extractWikilinks(md)
    expect(links.map((l) => l.basename)).toEqual(['Alpha', 'Beta'])
  })

  it('ignores wikilinks inside a tilde-fenced code block (~~~)', () => {
    const md = ['~~~', '[[Fake]]', '~~~', '[[Real]]'].join('\n')
    expect(extractWikilinks(md).map((l) => l.basename)).toEqual(['Real'])
  })

  it('handles multi-backtick inline code spans', () => {
    expect(extractWikilinks('`` [[Fake]] `` and [[Real]]').map((l) => l.basename)).toEqual(['Real'])
  })
})

describe('extractWikilinks — escapes & edge cases', () => {
  it('ignores an escaped \\[[target]]', () => {
    expect(extractWikilinks('escaped \\[[NotALink]] here')).toEqual([])
  })

  it('skips a same-document heading link [[#Section]] (no target)', () => {
    expect(extractWikilinks('jump to [[#Section]]')).toEqual([])
  })

  it('skips empty or whitespace-only targets', () => {
    expect(extractWikilinks('[[]] and [[   ]] and [[|alias]]')).toEqual([])
  })
})

describe('markdown handler — wikilink integration', () => {
  it('stages body wikilinks on output.wikilinks (NOT on octothorpes — those stay basenames until resolution)', async () => {
    const md = `---
title: A Note
---

Links to [[Alpha]] and [[folder/Beta|B]].`
    const blob = await markdownHandler.harmonize(md)
    expect(blob.title).toBe('A Note')
    expect(blob.wikilinks.map((l) => l.basename)).toEqual(['Alpha', 'Beta'])
    // Guardrail: unresolved basenames must not leak onto the relationship-write path.
    expect(blob.octothorpes).toEqual([])
  })

  it('does not read frontmatter as wikilink source', async () => {
    const md = `---
title: "[[NotALink]]"
---
body [[Real]]`
    const blob = await markdownHandler.harmonize(md)
    expect(blob.wikilinks.map((l) => l.basename)).toEqual(['Real'])
  })

  it('omits the wikilinks field entirely when there are none', async () => {
    const blob = await markdownHandler.harmonize('# Heading\n\nno links')
    expect(blob.wikilinks).toBeUndefined()
  })
})

// ---- #246: declared-URI resolution --------------------------------------

describe('buildTargetMap', () => {
  it('keys declared URIs by basename', () => {
    const map = buildTargetMap([
      { frontmatter: { uri: 'ni:a' }, path: 'notes/Alpha.md' },
      { frontmatter: { uri: 'ni:b' }, path: 'notes/Beta.md' },
    ])
    expect(map.get('Alpha')).toBe('ni:a')
    expect(map.get('Beta')).toBe('ni:b')
  })

  it('parses declared URIs from raw source when no frontmatter object is given', () => {
    const map = buildTargetMap([
      { source: '---\nuri: ni:a\n---\nbody', path: 'notes/Alpha.md' },
    ])
    expect(map.get('Alpha')).toBe('ni:a')
  })

  it('honours a custom uriField', () => {
    const map = buildTargetMap(
      [{ frontmatter: { id: 'ni:a' }, path: 'Alpha.md' }],
      { uriField: 'id' }
    )
    expect(map.get('Alpha')).toBe('ni:a')
  })

  it('skips entries with no declared URI', () => {
    const map = buildTargetMap([{ frontmatter: { title: 'x' }, path: 'Alpha.md' }])
    expect(map.has('Alpha')).toBe(false)
  })

  it('registers qualified path keys and marks a colliding basename AMBIGUOUS', () => {
    const map = buildTargetMap([
      { frontmatter: { uri: 'ni:proj' }, path: 'projects/Delta.md' },
      { frontmatter: { uri: 'ni:arch' }, path: 'archive/Delta.md' },
    ])
    expect(map.get('Delta')).toBe(AMBIGUOUS)
    expect(map.get('projects/Delta')).toBe('ni:proj')
    expect(map.get('archive/Delta')).toBe('ni:arch')
  })

  it('does not mark a basename ambiguous when both entries declare the same URI', () => {
    const map = buildTargetMap([
      { frontmatter: { uri: 'ni:same' }, path: 'a/Dup.md' },
      { frontmatter: { uri: 'ni:same' }, path: 'b/Dup.md' },
    ])
    expect(map.get('Dup')).toBe('ni:same')
  })
})

describe('markdown handler — declared-URI resolution (#246)', () => {
  const vault = [
    { source: '---\nuri: ni:alpha\n---\n', path: 'Alpha.md' },
    { source: '---\nuri: ni:beta\n---\n', path: 'Beta.md' },
    { frontmatter: { uri: 'ni:proj' }, path: 'projects/Delta.md' },
    { frontmatter: { uri: 'ni:arch' }, path: 'archive/Delta.md' },
  ]

  it('sets @id from the frontmatter URI field and keeps it out of documentRecord', async () => {
    const blob = await markdownHandler.harmonize(
      '---\nuri: ni:alpha\ntitle: Alpha\ncustom: keep\n---\nbody',
      null,
      { wikilinkTargets: buildTargetMap(vault) }
    )
    expect(blob['@id']).toBe('ni:alpha')
    expect(blob.documentRecord?.uri).toBeUndefined()
    expect(blob.documentRecord?.custom).toBe('keep')
  })

  it('falls back to the "source" placeholder when no URI is declared', async () => {
    const blob = await markdownHandler.harmonize('# no frontmatter')
    expect(blob['@id']).toBe('source')
  })

  it('emits resolved wikilinks as { type: link, uri } edges, deduped and no self-edge', async () => {
    const map = buildTargetMap(vault)
    const blob = await markdownHandler.harmonize(
      '---\nuri: ni:alpha\n---\nlinks [[Beta]], again [[Beta]], and self [[Alpha]]',
      null,
      { wikilinkTargets: map }
    )
    expect(blob.octothorpes).toEqual([{ type: 'link', uri: 'ni:beta' }])
  })

  it('warns (no edge) on a no-match target', async () => {
    const blob = await markdownHandler.harmonize(
      '---\nuri: ni:alpha\n---\nlinks [[Ghost]]',
      null,
      { wikilinkTargets: buildTargetMap(vault) }
    )
    expect(blob.octothorpes).toEqual([])
    expect(blob.warnings).toContainEqual({ target: 'Ghost', reason: 'no-match' })
  })

  it('warns (no edge) on an ambiguous basename but resolves the path-qualified form', async () => {
    const map = buildTargetMap(vault)
    const bare = await markdownHandler.harmonize(
      '---\nuri: ni:alpha\n---\n[[Delta]]',
      null,
      { wikilinkTargets: map }
    )
    expect(bare.octothorpes).toEqual([])
    expect(bare.warnings).toContainEqual({ target: 'Delta', reason: 'ambiguous' })

    const qualified = await markdownHandler.harmonize(
      '---\nuri: ni:alpha\n---\n[[archive/Delta]]',
      null,
      { wikilinkTargets: map }
    )
    expect(qualified.octothorpes).toEqual([{ type: 'link', uri: 'ni:arch' }])
    expect(qualified.warnings).toBeUndefined()
  })

  it('supports a resolver function as the lookup', async () => {
    const blob = await markdownHandler.harmonize(
      '---\nuri: ni:alpha\n---\n[[Beta]]',
      null,
      { wikilinkTargets: (target) => (target === 'Beta' ? 'ni:beta' : undefined) }
    )
    expect(blob.octothorpes).toEqual([{ type: 'link', uri: 'ni:beta' }])
  })

  it('stays extraction-only (no edges) when no lookup is provided', async () => {
    const blob = await markdownHandler.harmonize('body [[Beta]]')
    expect(blob.octothorpes).toEqual([])
    expect(blob.wikilinks.map((l) => l.basename)).toEqual(['Beta'])
    expect(blob.warnings).toBeUndefined()
  })
})
