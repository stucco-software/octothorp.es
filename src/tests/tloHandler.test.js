import { describe, it, expect } from 'vitest'
import tloHandler, {
  isTloUrl,
  parseTloUrl,
  extractHashtags,
} from '../../packages/core/handlers/tlo/handler.js'
import { createDefaultHandlerRegistry } from '../../packages/core/client.js'

const link = (md, extra = '') =>
  `https://tinylittleoffice.com/write/#doc=${encodeURIComponent(md)}${extra}`

describe('tlo handler — contract', () => {
  it('declares mode tlo and no content types', () => {
    expect(tloHandler.mode).toBe('tlo')
    expect(tloHandler.contentTypes).toEqual([])
    expect(typeof tloHandler.harmonize).toBe('function')
  })

  it('is NOT in the default registry (staging demo only, opt-in per adapter)', () => {
    expect(createDefaultHandlerRegistry().getHandler('tlo')).toBeNull()
  })
})

describe('isTloUrl', () => {
  it('accepts https://tinylittleoffice.com/ links only', () => {
    expect(isTloUrl('https://tinylittleoffice.com/write/#doc=x')).toBe(true)
    expect(isTloUrl('http://tinylittleoffice.com/write/#doc=x')).toBe(false)
    expect(isTloUrl('https://tinylittleoffice.com.evil.com/write/#doc=x')).toBe(false)
    expect(isTloUrl('https://example.com/#doc=x')).toBe(false)
    expect(isTloUrl('not a url')).toBe(false)
    expect(isTloUrl(undefined)).toBe(false)
  })
})

describe('parseTloUrl — fragment decode', () => {
  it('decodes doc, title and by from the fragment', () => {
    const p = parseTloUrl(link('Hello & goodbye\n\n100% #tag', '&title=My%20Doc&by=nim'))
    expect(p.app).toBe('write')
    expect(p.markdown).toBe('Hello & goodbye\n\n100% #tag')
    expect(p.title).toBe('My Doc')
    expect(p.by).toBe('nim')
  })

  it('keeps a literal + in the doc (not form-decoded to a space)', () => {
    expect(parseTloUrl(link('1+1')).markdown).toBe('1+1')
  })

  it('rejects non-TLO URLs', () => {
    expect(() => parseTloUrl('https://example.com/write/#doc=hi')).toThrow(/tinylittleoffice/)
  })

  it('rejects the packed /v1/ form politely', () => {
    expect(() => parseTloUrl('https://tinylittleoffice.com/v1/#eJxLy8nPBwAGZQIq')).toThrow(/packed/i)
    expect(() => parseTloUrl('https://tinylittleoffice.com/write/v1/#abc')).toThrow(/packed/i)
  })

  it('rejects a link with no doc= payload', () => {
    expect(() => parseTloUrl('https://tinylittleoffice.com/write/')).toThrow(/doc=/)
  })
})

describe('extractHashtags', () => {
  it('matches #tag style hashtags', () => {
    expect(extractHashtags('I like #cats and #some-tag, also #snake_case.')).toEqual([
      'cats', 'some-tag', 'snake_case',
    ])
  })

  it('does not match markdown headings', () => {
    expect(extractHashtags('# Title\n## Sub heading\n### third\nbody #real')).toEqual(['real'])
  })

  it('does not match anchors inside URLs or words', () => {
    expect(extractHashtags('see https://x.com/page#anchor and a#b and /#doc=1')).toEqual([])
  })

  it('ignores code spans and fences', () => {
    expect(extractHashtags('`#notatag`\n```\n#nope\n```\n#yes')).toEqual(['yes'])
  })

  it('dedupes', () => {
    expect(extractHashtags('#a #a #b')).toEqual(['a', 'b'])
  })
})

describe('harmonize', () => {
  it('builds a blobject from the URI: @id, {.title} title, description, hashtags, links', async () => {
    const md = '# Field Notes {.title}\n\nFirst para about #birds\nwith a [link](https://example.com/x).\n\nSecond para #owls.'
    const uri = link(md, '&title=Ignored')
    const b = await tloHandler.harmonize(uri)
    expect(b['@id']).toBe(uri)
    expect(b.title).toBe('Field Notes')
    expect(b.description).toBe('First para about #birds with a link.')
    expect(b.octothorpes).toEqual([
      'birds', 'owls',
      { type: 'link', uri: 'https://example.com/x' },
    ])
  })

  it('falls back to the title= param when there is no {.title} heading', async () => {
    const b = await tloHandler.harmonize(link('Just text #x', '&title=From%20Param'))
    expect(b.title).toBe('From Param')
    expect(b.description).toBe('Just text #x')
  })

  it('strips other TLO attribute blocks from text', async () => {
    const b = await tloHandler.harmonize(link('Hello world {.center}'))
    expect(b.description).toBe('Hello world')
  })

  it('throws for non-TLO input', async () => {
    await expect(tloHandler.harmonize('https://example.com/')).rejects.toThrow(/tinylittleoffice/)
  })
})
