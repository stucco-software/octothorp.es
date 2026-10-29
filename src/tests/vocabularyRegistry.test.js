import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BUILTIN_CLASSES,
  CLASS,
  typeRef,
  SUBTYPE_ALIASES,
} from '../../packages/core/vocabulary.js'
import { resolveSubtype } from '../../packages/core/indexer.js'

// #195: vocabulary.js is the registry indexer.js / queryBuilders.js consume,
// not only the source of the generated /vocabulary document.
describe('#195 vocabulary registry', () => {
  it('CLASS names every builtin class by its own name', () => {
    for (const c of BUILTIN_CLASSES) expect(CLASS[c.name]).toBe(c.name)
    expect(Object.isFrozen(CLASS)).toBe(true)
  })

  it('registers every class core writes, including Button', () => {
    for (const n of ['Term', 'Page', 'Origin', 'Webring', 'Link', 'Backlink', 'Cite', 'Bookmark', 'Mention', 'Button']) {
      expect(CLASS[n]).toBe(n)
    }
  })

  it('typeRef emits the current stored type form and rejects unregistered names', () => {
    expect(typeRef(CLASS.Term)).toBe('<octo:Term>')
    expect(() => typeRef('Octothorpe')).toThrow()
  })

  it('every alias target is a registered relationship class', () => {
    for (const target of Object.values(SUBTYPE_ALIASES)) {
      expect(BUILTIN_CLASSES.find((c) => c.name === target)?.subClassOf).toContain('Link')
    }
  })

  it('resolveSubtype reads aliases from the registry', () => {
    expect(resolveSubtype('citation')).toBe('Cite')
    expect(resolveSubtype('bookmark')).toBe('Bookmark')
    // #332: first-letter capitalisation is the only transform for other keys.
    expect(resolveSubtype('alias')).toBe('Alias')
  })

  it('indexer and query builders no longer hardcode core type IRIs', () => {
    for (const f of ['indexer.js', 'queryBuilders.js']) {
      const src = readFileSync(new URL(`../../packages/core/${f}`, import.meta.url), 'utf8')
      expect(src).not.toMatch(/<octo:(Term|Page|Origin|Webring)>/)
    }
  })

  it('context.json uses Term, not Octothorpe, for the class (spec §4)', () => {
    for (const p of ['../../packages/core/ld/context.json', '../lib/ld/context.json']) {
      const ctx = JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
      expect(ctx.Term).toBe('Term')
      expect(ctx.Octothorpe).toBeUndefined()
    }
  })
})
