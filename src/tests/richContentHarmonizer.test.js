import { describe, it, expect } from 'vitest'
import htmlHandler from '../../packages/core/handlers/html/handler.js'
import { getHarmonizer } from '$lib/getHarmonizer.js'

// The default harmonizer captures `documentRecord.richContent` from the first
// element marked `data-octo-content="rich"`, `data-octo-content="rich-content"`
// or `.octo-content`, as sanitized innerHTML.

const harmonize = (body, harmonizer) =>
  htmlHandler.harmonize(
    `<!DOCTYPE html><html><head><title>T</title></head><body>${body}</body></html>`,
    harmonizer,
    { getHarmonizer }
  )

describe('default harmonizer: documentRecord.richContent', () => {
  it('captures data-octo-content="rich"', async () => {
    const r = await harmonize('<div data-octo-content="rich"><p>Hello <em>there</em></p></div>')
    expect(r.documentRecord.richContent).toBe('<p>Hello <em>there</em></p>')
  })

  it('captures data-octo-content="rich-content"', async () => {
    const r = await harmonize('<section data-octo-content="rich-content"><h2>H</h2><p>b</p></section>')
    expect(r.documentRecord.richContent).toBe('<h2>H</h2><p>b</p>')
  })

  it('captures .octo-content', async () => {
    const r = await harmonize('<article class="post octo-content"><p>c</p></article>')
    expect(r.documentRecord.richContent).toBe('<p>c</p>')
  })

  it('ignores bare or other-valued data-octo-content', async () => {
    for (const body of [
      '<div data-octo-content><p>x</p></div>',
      '<div data-octo-content=""><p>x</p></div>',
      '<div data-octo-content="plain"><p>x</p></div>',
      '<div data-octo-content="richer"><p>x</p></div>',
    ]) {
      const r = await harmonize(body)
      expect(r.documentRecord?.richContent, body).toBeUndefined()
    }
  })

  it('omits documentRecord entirely when nothing is marked', async () => {
    const r = await harmonize('<p>plain page</p>')
    expect(r.documentRecord).toBeUndefined()
  })

  it('takes the first match in document order and stores a single string', async () => {
    const r = await harmonize(
      '<div class="octo-content"><p>first</p></div><div data-octo-content="rich"><p>second</p></div>'
    )
    expect(r.documentRecord.richContent).toBe('<p>first</p>')
  })

  it('strips scripts and handlers end to end', async () => {
    const r = await harmonize(
      '<div data-octo-content="rich"><p onclick="steal()">ok</p><script>steal()</script><a href="javascript:steal()">l</a></div>'
    )
    expect(r.documentRecord.richContent).toBe('<p>ok</p><a>l</a>')
  })

  it('does not strip a trailing slash from the HTML', async () => {
    const r = await harmonize('<div class="octo-content">see https://x.test/</div>')
    expect(r.documentRecord.richContent).toBe('see https://x.test/')
  })

  it('leaves the rest of the default output unchanged', async () => {
    const r = await harmonize('<div class="octo-content"><p>c</p></div><octo-thorpe>tag</octo-thorpe>')
    expect(r.title).toBe('T')
    expect(r.octothorpes).toContain('tag')
  })
})
