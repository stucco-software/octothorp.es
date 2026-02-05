import schema from './resolver.json'

export default schema

export const contentType = 'application/rss+xml'

export const meta = {
  name: 'RSS 2.0 Feed',
  channel: {
    title: 'Octothorpes Feed',
    description: 'Links from the Octothorpes network',
    link: 'https://octothorp.es/'
  }
}

/**
 * XML encoding for safe output
 */
const encode = value => {
  if (value == null) return ''
  const str = String(value)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

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
 * Renders an RSS feed from channel metadata and array of resolved items
 * 
 * @param {Array} items - Array of resolved items
 * @param {Object} channel - Channel metadata (merged from meta.channel + overrides)
 * @returns {string} RSS XML string
 */
export function render(items, channel) {
  return `
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
}
