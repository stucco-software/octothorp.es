/**
 * Creates a publisher registry with all built-in publishers as plain objects.
 * Mirrors createHarmonizerRegistry() pattern.
 * @returns {{ getPublisher: Function, listPublishers: Function }}
 */
export const createPublisherRegistry = () => {

  // --- RSS 2.0 ---

  const rss2Schema = {
    '@context': 'http://purl.org/rss/1.0/',
    '@id': 'https://octothorp.es/publishers/rss2',
    '@type': 'resolver',
    schema: {
      title: { from: ['title', '@id'], required: true },
      link: { from: '@id', required: true },
      guid: { from: '@id' },
      pubDate: { from: 'date', postProcess: { method: 'date', params: 'rfc822' }, required: true },
      description: { from: 'description' },
      image: { from: 'image' },
    }
  }

  const xmlEncode = value => {
    if (value == null) return ''
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  const xmlTag = (name, value) => value ? `<${name}>${xmlEncode(value)}</${name}>` : ''

  const rss2RenderItem = item => `
  <item>
  ${xmlTag('title', item.title)}
  ${xmlTag('description', item.description)}
  ${item.guid ? `<guid isPermaLink="true">${xmlEncode(item.guid)}</guid>` : ''}
  ${xmlTag('pubDate', item.pubDate)}
  ${xmlTag('link', item.link)}
  ${item.image ? `<enclosure url="${xmlEncode(item.image)}" type="image/jpeg" />` : ''}
</item>`

  const rss2Render = (items, channel) => `
  <rss
    xmlns:atom="http://www.w3.org/2005/Atom"
    version="2.0">
    <channel>
      ${xmlTag('title', channel.title)}
      ${xmlTag('link', channel.link)}
      ${channel.link ? `<atom:link href="${xmlEncode(channel.link)}" rel="self" type="application/rss+xml" />` : ''}
      ${xmlTag('description', channel.description)}
      ${xmlTag('pubDate', channel.pubDate)}
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
      ${items.map(rss2RenderItem).join('')}
    </channel>
  </rss>
`

  const rss2 = {
    schema: rss2Schema,
    contentType: 'application/rss+xml',
    meta: {
      name: 'RSS 2.0 Feed',
      channel: {
        title: 'Octothorpes Feed',
        description: 'Links from the Octothorpes network',
        link: 'https://octothorp.es/',
      }
    },
    render: rss2Render,
  }

  // --- ATProto ---

  const atprotoSchema = {
    '@context': 'https://standard.site/',
    '@id': 'https://octothorp.es/publishers/atproto.document',
    '@type': 'resolver',
    meta: {
      name: 'ATProto Document',
      description: 'Converts blobjects to site.standard.document format for AT Protocol publishing platforms',
      lexicon: 'site.standard.document',
      version: '1.0',
    },
    schema: {
      url: { from: '@id', required: true },
      title: { from: ['title', '@id'], required: true },
      publishedAt: { from: 'date', postProcess: { method: 'date', params: 'iso8601' }, required: true },
      description: { from: 'description' },
      tags: { from: 'octothorpes', postProcess: { method: 'extractTags' } },
      image: { from: 'image' },
    }
  }

  const atproto = {
    schema: atprotoSchema,
    contentType: 'application/json',
    meta: {
      name: 'ATProto Document',
      description: 'Converts blobjects to site.standard.document format',
      lexicon: 'site.standard.document',
    },
    render: (items, _feedMeta) => items,
  }

  // --- Registry ---

  const publishers = {
    rss2,
    rss: rss2,  // alias
    atproto,
  }

  const builtins = new Set(Object.keys(publishers))

  const getPublisher = (name) => publishers[name] ?? null

  const listPublishers = () => Object.keys(publishers)

  const register = (name, publisher) => {
    if (builtins.has(name)) throw new Error(`Publisher "${name}" is already registered as a built-in`)
    // Flat shape: resolver fields at top level (@context, @id, schema, contentType, render)
    // Explicit shape: { schema: resolverObj, contentType, meta, render }
    const isFlat = publisher['@context'] || publisher['@id']
    const normalized = isFlat
      ? { schema: publisher, contentType: publisher.contentType, meta: publisher.meta ?? {}, render: publisher.render }
      : publisher
    if (!normalized.schema || !normalized.contentType || typeof normalized.render !== 'function') {
      throw new Error('Publisher must have schema, contentType, and render')
    }
    publishers[name] = normalized
  }

  return { getPublisher, listPublishers, register }
}
