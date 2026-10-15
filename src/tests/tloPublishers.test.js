import { describe, it, expect } from 'vitest'
import { publish } from '../../packages/core/publish.js'
import { createPublisherRegistry } from '../../packages/core/publishers.js'
import tloCal from '../../static/publishers/tlo-cal/renderer.js'
import tloDoc, { htmlToBlocks } from '../../static/publishers/tlo-doc/renderer.js'
import { tloInline, tloLink } from '../../static/publishers/_tlo/tlo.js'

const registry = createPublisherRegistry()
registry.register('tlo-cal', tloCal)
registry.register('tlo-doc', tloDoc)

const docText = link => decodeURIComponent(link.split('#doc=')[1].split('&')[0])

const run = (name, blobjects, envelope) => {
  const pub = registry.getPublisher(name)
  const items = publish(blobjects, pub.resolver)
  return pub.render(items, { ...pub.envelope, ...envelope })
}

describe('tloInline escaping', () => {
  it('collapses newlines to one line', () => {
    expect(tloInline('a\n\nb\t c')).toBe('a b c')
  })
  it('strips attribute braces', () => {
    expect(tloInline('Hi {.title}')).toBe('Hi .title')
  })
  it('escapes front matter / rule lines', () => {
    expect(tloInline('---')).toBe('\\---')
  })
  it('escapes a leading list marker', () => {
    expect(tloInline('- item')).toBe('\\- item')
    expect(tloInline('1. item')).toBe('1\\. item')
  })
  it('escapes link syntax and backticks', () => {
    expect(tloInline('[x](y)')).toBe('\\[x\\](y)')
    expect(tloInline('a `code` b')).toBe('a \\`code\\` b')
  })
  it('escapes leading # and >', () => {
    expect(tloInline('# h')).toBe('\\# h')
    expect(tloInline('> q')).toBe('\\> q')
  })
})

describe('tloLink', () => {
  it('round-trips the doc text', () => {
    const text = '# T {.title}\n\nhello & 100% #ok'
    const link = tloLink('write', text, { title: 'T' })
    expect(link.startsWith('https://tinylittleoffice.com/write/#doc=')).toBe(true)
    expect(docText(link)).toBe(text)
    expect(link).toContain('&by=octothorpes')
  })
})

describe('tlo-cal', () => {
  const blobs = [
    { '@id': 'https://a.com/1', title: 'Old', postDate: Date.UTC(2026, 0, 2) },
    { '@id': 'https://a.com/2', title: 'New\n- sneaky', postDate: Date.UTC(2026, 9, 12) },
    { '@id': 'https://a.com/3', title: 'No date', date: Date.UTC(2026, 5, 1) },
  ]

  it('drops items without postDate, sorts newest first, links source', () => {
    const out = run('tlo-cal', blobs)
    expect(out.app).toBe('cal')
    expect(out.count).toBe(2)
    expect(out.dropped).toBe(0)
    expect(docText(out.link)).toBe(
      '- 2026-10-12: [New - sneaky](https://a.com/2)\n- 2026-01-02: [Old](https://a.com/1)'
    )
    expect(out.link).toContain('&title=Octothorpes%20Calendar')
  })

  it('reads postDate as milliseconds', () => {
    const out = run('tlo-cal', [{ '@id': 'https://a.com/x', title: 'X', postDate: 1760227200000 }])
    expect(docText(out.link)).toContain('2025-10-12')
  })

  it('caps at 2000 chars and reports dropped', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      '@id': `https://example.com/posts/${i}`, title: `Post number ${i}`, postDate: Date.UTC(2026, 0, 1 + i),
    }))
    const out = run('tlo-cal', many)
    expect(out.link.length).toBeLessThanOrEqual(2000)
    expect(out.count).toBeGreaterThan(0)
    expect(out.count + out.dropped).toBe(100)
    expect(out.dropped).toBeGreaterThan(0)
    expect(docText(out.link).split('\n')).toHaveLength(out.count)
  })

  it('envelope title is overridable', () => {
    const out = run('tlo-cal', blobs, { title: 'Mine' })
    expect(out.link).toContain('&title=Mine')
  })
})

describe('tlo-doc HTML mapping', () => {
  const md = html => htmlToBlocks(html).join('\n\n')
  it('headings', () => {
    expect(md('<h1>A</h1><h2>B</h2><h3>C</h3><h6>D</h6>')).toBe('## A\n\n## B\n\n### C\n\n### D')
  })
  it('paragraphs, inline formatting, br', () => {
    expect(md('<p>a <strong>b</strong> <em>c</em> <code>d</code><br>e</p>')).toBe('a **b** *c* `d`\ne')
  })
  it('links: http(s) only', () => {
    expect(md('<p><a href="https://x.com/">x</a> <a href="mailto:a@b">m</a></p>')).toBe('[x](https://x.com/) m')
  })
  it('nested lists keep two-space indentation', () => {
    expect(md('<ul><li>a<ul><li>b<ol><li>c</li></ol></li></ul></li><li>d</li></ul>'))
      .toBe('- a\n  - b\n    1. c\n- d')
  })
  it('blockquote', () => {
    expect(md('<blockquote><p>q1</p><p>q2</p></blockquote>')).toBe('> q1\n>\n> q2')
  })
  it('drops script/style, keeps text of others', () => {
    expect(md('<p>x</p><script>bad()</script><style>p{}</style><table><tr><td>cell</td></tr></table><img src="i.png">'))
      .toBe('x\n\ncell')
  })
  it('escapes hostile text inside content', () => {
    expect(md('<p>--- </p><p># not a heading {.title}</p>')).toBe('\\---\n\n\\# not a heading .title')
  })
})

describe('tlo-doc render', () => {
  const base = { '@id': 'https://a.com/p', title: 'Page' }

  it('uses richContent first', () => {
    const [r] = run('tlo-doc', [{ ...base, description: 'desc', documentRecord: { richContent: '<p>rich</p>' } }])
    expect(docText(r.link)).toBe('# Page {.title}\n\nrich\n\n[Source](https://a.com/p)')
    expect(r.truncated).toBe(false)
    expect(r.url).toBe('https://a.com/p')
  })
  it('falls back to description', () => {
    const [r] = run('tlo-doc', [{ ...base, description: 'desc' }])
    expect(docText(r.link)).toBe('# Page {.title}\n\ndesc\n\n[Source](https://a.com/p)')
  })
  it('falls back to title + source only', () => {
    const [r] = run('tlo-doc', [base])
    expect(docText(r.link)).toBe('# Page {.title}\n\n[Source](https://a.com/p)')
  })
  it('truncates whole blocks and adds Read the rest', () => {
    const html = Array.from({ length: 40 }, (_, i) => `<p>Paragraph ${i} with some words in it.</p>`).join('')
    const [r] = run('tlo-doc', [{ ...base, documentRecord: { richContent: html } }])
    expect(r.truncated).toBe(true)
    expect(r.link.length).toBeLessThanOrEqual(2000)
    const text = docText(r.link)
    expect(text.endsWith('[Read the rest](https://a.com/p)\n\n[Source](https://a.com/p)')).toBe(true)
    for (const para of text.split('\n\n').filter(b => b.startsWith('Paragraph'))) {
      expect(para).toMatch(/^Paragraph \d+ with some words in it\.$/)
    }
  })
  it('truncates a huge title when head+footer do not fit', () => {
    const [r] = run('tlo-doc', [{ ...base, title: 'T'.repeat(3000) }])
    expect(r.truncated).toBe(true)
    expect(r.link.length).toBeLessThanOrEqual(2000)
    expect(docText(r.link)).toMatch(/^# T+… \{\.title\}/)
  })
  it('every link fits and round-trips', () => {
    const out = run('tlo-doc', [
      { ...base, documentRecord: { richContent: '<p>100% & é 🚀</p>'.repeat(200) } },
      { ...base, '@id': 'https://a.com/q', description: 'x' },
    ])
    for (const r of out) {
      expect(r.link.length).toBeLessThanOrEqual(2000)
      expect(encodeURIComponent(docText(r.link))).toBe(r.link.split('#doc=')[1].split('&')[0])
    }
  })
})
