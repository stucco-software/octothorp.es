import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'
import htmlHandler, { parseHTML } from '../../packages/core/handlers/html/handler.js'
import { createHarmonizerRegistry } from '../../packages/core/harmonizers.js'

// #356: relative link hrefs were written unresolved and Oxigraph resolved them
// against its own endpoint URL (http://octothorpes.fly.dev/...). The HTML
// handler must resolve hrefs against the page being indexed, and
// handleMention must drop targets that are not absolute IRIs.

const instance = 'http://localhost:5173/'
const page = 'https://example.com/blog/post.html'
const html = `<html><body>
  <a rel="octo:octothorpes" href="/tags/x.html">rel</a>
  <a rel="octo:octothorpes" href="sibling.html">sib</a>
  <a rel="octo:octothorpes" href="https://other.com/abs">abs</a>
</body></html>`

const linkTargets = (blobject) =>
  (blobject.octothorpes || []).filter((o) => typeof o === 'object').map((o) => o.uri)

describe('#356 relative hrefs resolve against the page URL', () => {
  it('parseHTML resolves element.href against the given url', async () => {
    const doc = await parseHTML(html, 'text/html', { url: page })
    const hrefs = [...doc.querySelectorAll('a')].map((a) => a.href)
    expect(hrefs).toEqual([
      'https://example.com/tags/x.html',
      'https://example.com/blog/sibling.html',
      'https://other.com/abs',
    ])
  })

  it('dispatch resolves relative link hrefs to the page origin+path, absolute unchanged', async () => {
    const indexer = createIndexer({
      insert: vi.fn(), query: vi.fn(), queryBoolean: vi.fn(), queryArray: vi.fn(),
      instance,
      handlerRegistry: {
        getHandler: (m) => (m === 'html' ? htmlHandler : null),
        getHandlerForContentType: (ct) => (ct?.startsWith('text/html') ? htmlHandler : null),
      },
      getHarmonizer: createHarmonizerRegistry(instance).getHarmonizer,
    })
    const blobject = await indexer.dispatch({ content: html, contentType: 'text/html' }, 'default', page)
    expect(linkTargets(blobject)).toEqual(expect.arrayContaining([
      'https://example.com/tags/x.html',
      'https://example.com/blog/sibling.html',
      'https://other.com/abs',
    ]))
    expect(linkTargets(blobject).some((u) => !/^https?:\/\//.test(u))).toBe(false)
  })
})

describe('#356 handleMention drops non-absolute targets', () => {
  let insert, warn, indexer
  beforeEach(() => {
    insert = vi.fn().mockResolvedValue({})
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    indexer = createIndexer({
      insert, query: vi.fn(), queryBoolean: vi.fn().mockResolvedValue(false), queryArray: vi.fn(), instance,
    })
  })
  afterEach(() => warn.mockRestore())

  for (const target of ['/tags/x.html', '', undefined]) {
    it(`skips and logs target ${JSON.stringify(target)}`, async () => {
      await expect(indexer.handleMention(page, target)).resolves.toBeUndefined()
      expect(insert).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('statement dropped'))
    })
  }
})

// #361: the bare-term link form carries a TERM in href, not a locator.
// `element.href` is the IDL property, which resolves against the document base
// #356 introduced, so `href="demo"` was minted as the page IRI .../demo.
const termHtml = `<html><head>
  <link rel="octo:octothorpes" href="demo">
  <link rel="octo:octothorpes" href="site changes">
</head><body>
  <a rel="octo:octothorpes" href="relative.html">locator</a>
</body></html>`

describe('#361 bare-term hrefs are not resolved as URLs', () => {
  const buildIndexer = () => createIndexer({
    insert: vi.fn(), query: vi.fn(), queryBoolean: vi.fn(), queryArray: vi.fn(),
    instance,
    handlerRegistry: {
      getHandler: (m) => (m === 'html' ? htmlHandler : null),
      getHandlerForContentType: (ct) => (ct?.startsWith('text/html') ? htmlHandler : null),
    },
    getHarmonizer: createHarmonizerRegistry(instance).getHarmonizer,
  })

  it('keeps a bare term verbatim', async () => {
    const blobject = await buildIndexer().dispatch({ content: termHtml, contentType: 'text/html' }, 'default', page)
    const terms = (blobject.octothorpes || []).filter((o) => typeof o === 'string')
    expect(terms).toContain('demo')
    expect(terms).toContain('site changes')
    expect(terms.some((t) => /^https?:\/\//.test(t))).toBe(false)
  })

  it('still resolves locator hrefs on the same page (#356 unregressed)', async () => {
    const blobject = await buildIndexer().dispatch({ content: termHtml, contentType: 'text/html' }, 'default', page)
    expect(linkTargets(blobject)).toContain('https://example.com/blog/relative.html')
  })
})
