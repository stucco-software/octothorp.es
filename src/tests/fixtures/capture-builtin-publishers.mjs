// One-off capture for #323 parity: dumps the pre-change builtin publisher
// registry shape and render output. Run from the repo root:
//   node src/tests/fixtures/capture-builtin-publishers.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPublisherRegistry, publish } from '../../../packages/core/client.js'

const registry = createPublisherRegistry()
const names = registry.listPublishers().sort()

// Volatile stamps (rss2 lastBuildDate, ics DTSTAMP) are replaced so the capture
// is reproducible.
const stamp = (s) => String(s)
  .replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/g, '<lastBuildDate>{DATE}</lastBuildDate>')
  .replace(/DTSTAMP:[0-9TZ]+/g, 'DTSTAMP:{DATE}')

const SOURCES = [
  {
    '@id': 'https://example.com/a',
    title: 'A page & "quoted" <tag>',
    description: 'First item, with; commas, and\nnewlines',
    image: 'https://example.com/a.png',
    date: '2026-03-04T05:06:07.000Z',
    startDate: '2026-03-04T05:06:07.000Z',
    endDate: '2026-03-05',
    location: 'Somewhere, NY',
    octothorpes: [{ uri: 'https://op.test/~/tag-one', type: 'Term' }, { uri: 'https://op.test/~/two words', type: 'Term' }],
    documentRecord: { site: 'https://example.com/', path: '/a', textContent: 'Body text' },
  },
  { uri: 'https://example.com/b', title: 'Dateless row' },
  { uri: 'https://example.com/c', title: 'Row with date', date: '2026-01-02T03:04:05.000Z' },
]

const shape = {}
const rendered = {}
for (const name of names) {
  const p = registry.getPublisher(name)
  shape[name] = {
    contentType: p.contentType ?? null,
    meta: p.meta ?? null,
    envelope: p.envelope ?? null,
    requires: p.requires ?? null,
    resolver: p.resolver ?? null,
  }
  const items = publish(SOURCES, p.resolver)
  const out = p.render(items, { ...(p.envelope ?? {}), feedDate: 'Wed, 04 Mar 2026 05:06:07 GMT' })
  rendered[name] = {
    items: JSON.parse(JSON.stringify(items, (k, v) => (k === 'createdAt' || k === 'publishedAt' ? '{DATE}' : v))),
    output: typeof out === 'string'
      ? stamp(out)
      : JSON.parse(JSON.stringify(out, (k, v) => (k === 'createdAt' || k === 'publishedAt' ? '{DATE}' : v))),
  }
}

const dir = fileURLToPath(new URL('.', import.meta.url))
writeFileSync(`${dir}builtin-publishers.json`, JSON.stringify(shape, null, 2) + '\n')
writeFileSync(`${dir}builtin-publishers-render.json`, JSON.stringify(rendered, null, 2) + '\n')
console.log('captured', names.join(', '))
