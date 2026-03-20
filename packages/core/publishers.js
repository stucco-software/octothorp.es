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

  // --- Bluesky ---

  const blueskySchema = {
    '@context': 'https://bsky.app/',
    '@id': 'https://octothorp.es/publishers/bluesky',
    '@type': 'resolver',
    schema: {
      url: { from: '@id', required: true },
      title: { from: ['title', '@id'], required: true },
      description: { from: 'description' },
      tags: { from: 'octothorpes', postProcess: { method: 'extractTags' } },
      createdAt: { value: 'now', postProcess: { method: 'date', params: 'iso8601' } }
    }
  }

  const encoder = new TextEncoder()

  const countGraphemes = (str) => {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    return [...segmenter.segment(str)].length
  }

  const truncateGraphemes = (str, max) => {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const segments = [...segmenter.segment(str)]
    if (segments.length <= max) return str
    return segments.slice(0, max - 1).map(s => s.segment).join('') + '…'
  }

  const isValidTag = (tag) => /^[\p{L}\p{N}_]+$/u.test(tag)

  const blueskyRender = (items, _feedMeta) => {
    return items.map(item => {
      const { url, title, description, tags, createdAt } = item

      // Filter tags: no spaces/special chars, max 640 graphemes each
      const validTags = (tags || [])
        .filter(t => isValidTag(t) && countGraphemes(t) <= 640)
        .slice(0, 8)

      // Build text parts with priority: title > URL > hashtags > description
      const titleEqualsUrl = title === url
      const parts = []

      if (!titleEqualsUrl) parts.push({ type: 'title', text: title })
      if (description) parts.push({ type: 'description', text: description })
      parts.push({ type: 'url', text: url })
      if (validTags.length > 0) {
        parts.push({ type: 'tags', text: validTags.map(t => `#${t}`).join(' ') })
      }

      // Compose and truncate to 300 graphemes
      const compose = (partsList) => partsList.map(p => p.text).join('\n\n')
      const limit = 300

      let text = compose(parts)
      if (countGraphemes(text) > limit) {
        // Truncate description first
        const descIdx = parts.findIndex(p => p.type === 'description')
        if (descIdx !== -1) {
          const other = parts.filter((_, i) => i !== descIdx)
          const otherText = compose(other)
          const remaining = limit - countGraphemes(otherText) - 2 // \n\n separator
          if (remaining > 3) {
            parts[descIdx] = { type: 'description', text: truncateGraphemes(parts[descIdx].text, remaining) }
            text = compose(parts)
          } else {
            parts.splice(descIdx, 1)
            text = compose(parts)
          }
        }
      }
      if (countGraphemes(text) > limit) {
        // Drop hashtags
        const tagIdx = parts.findIndex(p => p.type === 'tags')
        if (tagIdx !== -1) {
          parts.splice(tagIdx, 1)
          text = compose(parts)
        }
      }
      if (countGraphemes(text) > limit) {
        // Truncate title
        const titleIdx = parts.findIndex(p => p.type === 'title')
        if (titleIdx !== -1) {
          const other = parts.filter((_, i) => i !== titleIdx)
          const otherText = compose(other)
          const remaining = limit - countGraphemes(otherText) - 2
          if (remaining > 1) {
            parts[titleIdx] = { type: 'title', text: truncateGraphemes(parts[titleIdx].text, remaining) }
          }
          text = compose(parts)
        }
      }

      // Build facets with UTF-8 byte offsets
      const facets = []

      // URL facet
      const urlStart = text.indexOf(url)
      if (urlStart !== -1) {
        const byteStart = encoder.encode(text.slice(0, urlStart)).byteLength
        const byteEnd = byteStart + encoder.encode(url).byteLength
        facets.push({
          index: { byteStart, byteEnd },
          features: [{ '$type': 'app.bsky.richtext.facet#link', uri: url }]
        })
      }

      // Tag facets
      const tagsInText = parts.find(p => p.type === 'tags')
      if (tagsInText) {
        for (const tag of validTags) {
          const hashtag = `#${tag}`
          const tagPos = text.indexOf(hashtag, text.indexOf(tagsInText.text))
          if (tagPos !== -1) {
            const byteStart = encoder.encode(text.slice(0, tagPos)).byteLength
            const byteEnd = byteStart + encoder.encode(hashtag).byteLength
            facets.push({
              index: { byteStart, byteEnd },
              features: [{ '$type': 'app.bsky.richtext.facet#tag', tag }]
            })
          }
        }
      }

      const record = {
        '$type': 'app.bsky.feed.post',
        text,
        createdAt,
      }

      if (facets.length > 0) record.facets = facets
      if (validTags.length > 0) record.tags = validTags

      return record
    })
  }

  const bluesky = {
    schema: blueskySchema,
    contentType: 'application/json',
    meta: {
      name: 'Bluesky Post',
      lexicon: 'app.bsky.feed.post',
    },
    render: blueskyRender,
  }

  // --- Registry ---

  const publishers = {
    rss2,
    rss: rss2,  // alias
    atproto,
    bluesky,
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
