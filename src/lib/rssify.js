import { resolve } from './publish/resolve.js'
import { rssItem as rssItemResolver, rssChannel as rssChannelResolver } from './publish/resolvers/rss.js'

/**
 * XML encoding for safe output
 */
const encode = str => str ? str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;') : ''

/**
 * Renders an optional XML tag - returns empty string if value is null/undefined
 */
const tag = (name, value) => value ? `<${name}>${encode(value)}</${name}>` : ''

/**
 * Renders an RSS item from a resolved object
 */
const renderItem = item => `
  <item>
  ${tag('title', item.title)}
  ${tag('description', item.description)}
  ${item.guid ? `<guid isPermaLink="true">${encode(item.guid)}</guid>` : ''}
  ${tag('pubDate', item.pubDate)}
  ${tag('link', item.link)}
  ${item.image ? `<enclosure url="${encode(item.image)}" type="image/jpeg" />` : ''}
</item>`

/**
 * Renders an RSS feed from a resolved channel and array of resolved items
 */
const renderFeed = (channel, items) => `
  <rss
    xmlns:atom="http://www.w3.org/2005/Atom"
    version="2.0">
    <channel>
      ${tag('title', channel.title)}
      ${tag('link', channel.link)}
      ${channel.link ? `<atom:link href="${encode(channel.link)}" rel="self" type="application/rss+xml" />` : ''}
      ${tag('description', channel.description)}
      ${tag('pubDate', channel.pubDate)}
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
      ${items.map(renderItem).join('')}
    </channel>
  </rss>
`

/**
 * Generates an RSS feed from source data
 * 
 * @param {Object} channelData - Channel metadata { title, link, description, pubDate }
 * @param {Array} sourceItems - Array of source items (blobjects or bindings)
 * @returns {string} RSS XML string
 */
export const rss = (channelData, sourceItems) => {
  // Resolve channel metadata
  const channel = resolve(channelData, rssChannelResolver)
  
  // Resolve each item, filtering out nulls (items with missing required fields)
  const items = sourceItems
    .map(item => resolve(item, rssItemResolver))
    .filter(Boolean)
  
  return renderFeed(channel, items)
}

// Legacy export for backward compatibility during migration
// TODO: Remove once load.js is updated
export const rssLegacy = (tree, what = "default") => {
  const channelData = {
    title: tree.channel.title,
    link: tree.channel.link,
    description: tree.channel.description,
    pubDate: tree.channel.pubDate
  }
  
  return rss(channelData, tree.channel.items)
}


// Tests
if (import.meta.vitest) {
  const { it, expect, describe } = import.meta.vitest

  describe('rss', () => {
    const channelData = {
      title: "Test Feed",
      link: "https://example.com/feed",
      description: "A test feed",
      pubDate: new Date('2024-06-21')
    }

    it('generates valid RSS with resolved items', () => {
      const items = [{
        title: "Test Post",
        '@id': "https://example.com/post",
        description: "A test post",
        date: new Date('2024-06-21').getTime(),
        image: "https://example.com/image.jpg"
      }]
      
      const result = rss(channelData, items)
      
      expect(result).toContain('<title>Test Feed</title>')
      expect(result).toContain('<title>Test Post</title>')
      expect(result).toContain('<link>https://example.com/post</link>')
      expect(result).toContain('<guid isPermaLink="true">https://example.com/post</guid>')
      expect(result).toContain('<enclosure url="https://example.com/image.jpg"')
    })

    it('filters out items with missing required fields', () => {
      const items = [
        { title: "Valid Post", '@id': "https://example.com/1", date: Date.now() },
        { title: "No Date", '@id': "https://example.com/2" }, // missing required date
        { '@id': "https://example.com/3", date: Date.now() } // title falls back to @id
      ]
      
      const result = rss(channelData, items)
      
      expect(result).toContain('Valid Post')
      expect(result).not.toContain('No Date')
      expect(result).toContain('https://example.com/3') // fallback title
    })

    it('encodes special characters in XML', () => {
      const items = [{
        title: "Post with <special> & \"chars\"",
        '@id': "https://example.com/post",
        date: Date.now()
      }]
      
      const result = rss(channelData, items)
      
      expect(result).toContain('&lt;special&gt;')
      expect(result).toContain('&amp;')
      expect(result).toContain('&quot;chars&quot;')
    })

    it('omits optional fields when empty', () => {
      const items = [{
        title: "Minimal Post",
        '@id': "https://example.com/post",
        date: Date.now()
        // no description or image
      }]
      
      const result = rss(channelData, items)
      
      expect(result).toContain('<title>Minimal Post</title>')
      // Item should not have description (channel still has one)
      expect(result).not.toContain('<description></description>')
      expect(result).not.toContain('<enclosure')
    })
  })
}
