import { describe, it, expect } from 'vitest'
import xmlHandler from '../../packages/core/handlers/xml/handler.js'

const sampleRss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com/feed</link>
    <description>An example feed</description>
    <item>
      <title>Post 1</title>
      <link>https://example.com/p1</link>
      <category>news</category>
      <category>tech</category>
    </item>
    <item>
      <title>Post 2</title>
      <link>https://example.com/p2</link>
      <category>updates</category>
    </item>
  </channel>
</rss>`

describe('xml handler', () => {
  it('declares mode and content types', () => {
    expect(xmlHandler.mode).toBe('xml')
    expect(xmlHandler.contentTypes).toEqual(
      expect.arrayContaining(['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml'])
    )
    expect(typeof xmlHandler.harmonize).toBe('function')
  })

  it('extracts subject fields from RSS channel', async () => {
    const schema = {
      mode: 'xml',
      schema: {
        subject: {
          s: 'rss.channel.link',
          title: 'rss.channel.title',
          description: 'rss.channel.description',
        }
      }
    }
    const blob = await xmlHandler.harmonize(sampleRss, schema)
    expect(blob['@id']).toBe('https://example.com/feed')
    expect(blob.title).toBe('Example Feed')
    expect(blob.description).toBe('An example feed')
  })

  it('auto-expands arrays for item links into octothorpes', async () => {
    const schema = {
      mode: 'xml',
      schema: {
        subject: { s: 'rss.channel.link' },
        link: { o: 'rss.channel.item.link' },
      }
    }
    const blob = await xmlHandler.harmonize(sampleRss, schema)
    const links = blob.octothorpes.filter(o => o.type === 'link').map(o => o.uri)
    expect(links).toEqual(['https://example.com/p1', 'https://example.com/p2'])
  })

  it('returns blobject with @id="source" when no subject path matches', async () => {
    const schema = {
      mode: 'xml',
      schema: { subject: { s: 'nonexistent.path' } }
    }
    const blob = await xmlHandler.harmonize(sampleRss, schema)
    expect(blob['@id']).toBe('source')
  })

  it('throws on missing schema', async () => {
    await expect(xmlHandler.harmonize(sampleRss, null)).rejects.toThrow(/schema/i)
  })

  it('flags feed sources as opted-in via indexPolicy', async () => {
    // The XML handler should mark feed-shaped sources as implicitly opted in,
    // so that origin-verified feeds index without per-page markers.
    const schema = {
      mode: 'xml',
      schema: { subject: { s: 'rss.channel.link' } }
    }
    const blob = await xmlHandler.harmonize(sampleRss, schema)
    expect(blob.indexPolicy).toBe('index')
  })
})
