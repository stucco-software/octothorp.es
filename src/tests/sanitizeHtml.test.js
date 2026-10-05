import { describe, it, expect, vi, afterEach } from 'vitest'
import { sanitizeHtml, processValue, validators } from 'octothorpes'

afterEach(() => vi.restoreAllMocks())

describe('sanitizeHtml: removed elements', () => {
  // Elements that can hold content: the element and its content go.
  const removed = ['script', 'style', 'iframe', 'object', 'noscript', 'template', 'applet']
  for (const tag of removed) {
    it(`removes <${tag}> and its content`, () => {
      const out = sanitizeHtml(`<p>keep</p><${tag} data-x="1">gone</${tag}>`)
      expect(out).toContain('<p>keep</p>')
      expect(out.toLowerCase()).not.toContain(`<${tag}`)
      expect(out).not.toContain('gone')
    })
  }

  // Void elements (and frame/frameset, which the parser drops outside a
  // frameset document) cannot hold content; only the element itself goes.
  const voids = ['embed', 'link', 'meta', 'base', 'frame', 'frameset']
  for (const tag of voids) {
    it(`removes <${tag}>`, () => {
      const out = sanitizeHtml(`<p>keep</p><${tag} data-x="1">`)
      expect(out).toBe('<p>keep</p>')
    })
  }

  it('removes svg <script>', () => {
    const out = sanitizeHtml('<svg><script>alert(1)</script><circle r="1"></circle></svg>')
    expect(out).not.toContain('script')
    expect(out).not.toContain('alert')
    expect(out).toContain('<circle')
  })

  it('removes nested executable elements', () => {
    const out = sanitizeHtml('<div><section><script>x()</script><p>ok</p></section></div>')
    expect(out).toBe('<div><section><p>ok</p></section></div>')
  })

  it('removes HTML comments', () => {
    expect(sanitizeHtml('<p>a</p><!-- hidden -->')).toBe('<p>a</p>')
  })
})

describe('sanitizeHtml: attributes', () => {
  it('removes every on* attribute', () => {
    const out = sanitizeHtml('<img src="a.png" onerror="x()" ONLOAD="y()"><div onclick="z()" onmouseover="w()">t</div>')
    expect(out.toLowerCase()).not.toMatch(/\son[a-z]+=/)
    expect(out).toContain('src="a.png"')
  })

  const urlAttrs = [
    ['a', 'href'],
    ['img', 'src'],
    ['form', 'action'],
    ['button', 'formaction'],
  ]
  for (const [tag, attr] of urlAttrs) {
    for (const scheme of ['javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<b>x</b>']) {
      it(`removes ${attr}="${scheme.split(':')[0]}:..." on <${tag}>`, () => {
        const out = sanitizeHtml(`<${tag} ${attr}="${scheme.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}">t</${tag}>`)
        expect(out).not.toContain(`${attr}=`)
      })
    }
  }

  it('removes xlink:href with a javascript: URL', () => {
    const out = sanitizeHtml('<svg><a xlink:href="javascript:alert(1)"><text>t</text></a></svg>')
    expect(out).not.toContain('javascript')
  })

  it('catches obfuscated schemes (case, whitespace, control chars, entities)', () => {
    const samples = [
      '<a href="JaVaScRiPt:alert(1)">t</a>',
      '<a href="  javascript:alert(1)">t</a>',
      '<a href="java\tscript:alert(1)">t</a>',
      '<a href="java&#x0A;script:alert(1)">t</a>',
      '<a href="&#106;avascript:alert(1)">t</a>',
      '<a href="\u0001javascript:alert(1)">t</a>',
      '<a href="DATA:text/html,x">t</a>',
    ]
    for (const s of samples) {
      expect(sanitizeHtml(s), s).toBe('<a>t</a>')
    }
  })

  it('keeps data:image/ URLs and ordinary URLs', () => {
    const out = sanitizeHtml('<img src="data:image/png;base64,AAAA"><a href="https://example.com/x">x</a><a href="/rel">r</a><a href="mailto:a@b.c">m</a>')
    expect(out).toContain('src="data:image/png;base64,AAAA"')
    expect(out).toContain('href="https://example.com/x"')
    expect(out).toContain('href="/rel"')
    expect(out).toContain('href="mailto:a@b.c"')
  })
})

describe('sanitizeHtml: benign markup', () => {
  it('preserves ordinary rich content unchanged', () => {
    const html = '<h2 id="t">Title</h2><p class="lead">Some <strong>bold</strong> and <em>em</em> &amp; <a href="https://x.test/a" title="A">a link</a>.</p><ul><li>one</li><li>two</li></ul><figure><img src="https://x.test/i.png" alt="i"><figcaption>cap</figcaption></figure><table><tbody><tr><td>c</td></tr></tbody></table>'
    expect(sanitizeHtml(html)).toBe(html)
  })

  it('returns an empty string for empty or non-string input', () => {
    expect(sanitizeHtml('')).toBe('')
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
  })

  it('is idempotent', () => {
    const inputs = [
      '<p onclick="x()">a<script>b</script></p><a href="javascript:c">d</a><style>e</style>',
      '<div><p>unclosed<li>item</div>',
      '<p>' + 'word '.repeat(50) + '</p><p>tail</p>',
    ]
    for (const input of inputs) {
      const once = sanitizeHtml(input)
      expect(sanitizeHtml(once)).toBe(once)
      const trimmed = sanitizeHtml(input, { maxLength: 60 })
      expect(sanitizeHtml(trimmed, { maxLength: 60 })).toBe(trimmed)
    }
  })
})

describe('sanitizeHtml: maxLength', () => {
  it('leaves content within the limit alone and does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(sanitizeHtml('<p>a</p><p>b</p>', { maxLength: 100 })).toBe('<p>a</p><p>b</p>')
    expect(warn).not.toHaveBeenCalled()
  })

  it('drops whole trailing nodes until it fits, and warns once with both lengths', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = '<p>one</p><p>two</p><p>three</p>'
    const out = sanitizeHtml(html, { maxLength: 21 })
    expect(out).toBe('<p>one</p><p>two</p>')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain(String(html.length))
    expect(warn.mock.calls[0][0]).toContain(String(out.length))
  })

  it('measures length after sanitizing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = sanitizeHtml('<p>a</p><script>' + 'x'.repeat(500) + '</script>', { maxLength: 10 })
    expect(out).toBe('<p>a</p>')
    expect(warn).not.toHaveBeenCalled()
  })

  it('descends into a lone oversized node and drops its trailing children', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = '<article><p>one</p><p>two</p><p>three</p></article>'
    const out = sanitizeHtml(html, { maxLength: 40 })
    expect(out).toBe('<article><p>one</p><p>two</p></article>')
  })

  it('truncates the text of a lone text node rather than cutting markup', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = sanitizeHtml('<p>' + 'a'.repeat(100) + '</p>', { maxLength: 27 })
    expect(out).toBe('<p>' + 'a'.repeat(20) + '</p>')
    expect(out.length).toBeLessThanOrEqual(27)
  })

  it('never exceeds maxLength, even when markup alone is too long', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = sanitizeHtml('<div class="' + 'c'.repeat(50) + '"><p>x</p></div>', { maxLength: 20 })
    expect(out.length).toBeLessThanOrEqual(20)
  })

  it('stays fast on many small nodes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = '<p>x</p>'.repeat(20000)
    const t = Date.now()
    const out = sanitizeHtml(html, { maxLength: 100000 })
    expect(out.length).toBeLessThanOrEqual(100000)
    expect(out.endsWith('</p>')).toBe(true)
    expect(Date.now() - t).toBeLessThan(5000)
  })
})

describe('sanitizeHtml via processValue', () => {
  it('is a postProcess method', () => {
    expect(processValue('<p onclick="x()">a</p><script>b</script>', 'sanitizeHtml')).toBe('<p>a</p>')
    expect(processValue('<p>a</p><p>b</p>', 'sanitizeHtml', { maxLength: 8 })).toBe('<p>a</p>')
  })

  it('passes harmonizer schema validation', () => {
    const rule = { selector: '.octo-content', attribute: 'innerHTML', postProcess: { method: 'sanitizeHtml', params: { maxLength: 100000 } } }
    expect(validators.html({ documentRecord: { richContent: [rule] }, hashtag: { o: [rule] } })).toBe(true)
    expect(validators.json({ documentRecord: { richContent: [{ path: 'x', postProcess: rule.postProcess }] } })).toBe(true)
  })
})
