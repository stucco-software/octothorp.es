import { describe, it, expect } from 'vitest'
import { scopeIri, unscopeIri } from '../../packages/core/scopedIri.js'

const anchor = 'notes.example.com'

describe('scopedIri', () => {
  const samples = [
    'obsidian://open?vault=N&file=a/b.md',
    'obsidian://open?vault=Études&file=montréal/50%25.md',
    'obsidian://open?vault=My Vault&file=a#heading',
    'zotero://select/library/items/ABC123',
    'file:///Users/me/notes/a b.md',
    'x-thing://a/b/',
    'x-thing://',
    'x-thing://a//b',
    'web+app://%41/%2F/100%',
    'a.b-c+d1://q?x=1#y?z',
  ]

  it.each(samples)('round-trips exactly: %s', (raw) => {
    expect(unscopeIri(anchor, scopeIri(anchor, raw))).toBe(raw)
  })

  it('produces https://<anchor>/.op/<scheme>/<remainder> with scheme visible', () => {
    const s = scopeIri(anchor, 'obsidian://open?vault=N&file=a/b.md')
    expect(s.startsWith(`https://${anchor}/.op/obsidian/`)).toBe(true)
    expect(s).not.toContain('obsidian://')
    expect(() => new URL(s)).not.toThrow()
    expect(new URL(s).hash).toBe('')
    expect(new URL(s).search).toBe('')
  })

  it('throws on a foreign anchor', () => {
    const s = scopeIri('other.example.com', 'obsidian://open')
    expect(() => unscopeIri(anchor, s)).toThrow()
  })

  it('throws on non-scoped input', () => {
    expect(() => unscopeIri(anchor, 'https://notes.example.com/page')).toThrow()
    expect(() => unscopeIri(anchor, `https://${anchor}/.op/`)).toThrow()
  })

  it('throws on invalid raw URIs', () => {
    expect(() => scopeIri(anchor, 'not a uri')).toThrow()
    expect(() => scopeIri(anchor, '1bad://x')).toThrow()
  })
})
