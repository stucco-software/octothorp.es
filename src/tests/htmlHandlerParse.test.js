import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getHarmonizer } from '$lib/getHarmonizer.js'

// Wrap the real jsdom so we can count JSDOM constructions per harmonize call.
vi.mock('jsdom', async (importOriginal) => {
  const actual = await importOriginal()
  const JSDOM = vi.fn((...args) => new actual.JSDOM(...args))
  JSDOM.prototype = actual.JSDOM.prototype
  return { ...actual, JSDOM }
})

const { JSDOM } = await import('jsdom')
const htmlHandler = (await import('../../packages/core/handlers/html/handler.js')).default

const html = `<!DOCTYPE html>
<html><head><title>Parse Count</title>
<meta name="description" content="one parse please">
</head><body>
<a href="https://example.com/a" rel="octo:bookmark">a</a>
<octo-thorpe>demo</octo-thorpe>
</body></html>`

describe('HTML handler parses once per harmonize', () => {
  beforeEach(() => {
    JSDOM.mockClear()
  })

  it('constructs exactly one JSDOM for a raw string input', async () => {
    await htmlHandler.harmonize(html, 'default', { getHarmonizer })
    expect(JSDOM).toHaveBeenCalledTimes(1)
  })

  it('constructs exactly one JSDOM for a source object without a document', async () => {
    const source = { content: html, contentType: 'text/html' }
    await htmlHandler.harmonize(source, 'default', { getHarmonizer })
    expect(JSDOM).toHaveBeenCalledTimes(1)
    expect(source.document).toBeTruthy()
  })

  it('constructs zero JSDOMs when the source object already carries a document', async () => {
    const document = await htmlHandler.parse(html)
    JSDOM.mockClear()
    const source = { content: html, contentType: 'text/html', document }
    await htmlHandler.harmonize(source, 'default', { getHarmonizer })
    expect(JSDOM).toHaveBeenCalledTimes(0)
  })
})
