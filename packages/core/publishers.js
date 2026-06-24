/**
 * Resolve a publisher's output envelope: its declared default feed-level values
 * merged with per-request overrides (canonical vocab: title, link, description, date).
 * Returns undefined for per-record publishers that declare no envelope.
 * @param {Object} publisher - a registered publisher (with optional .envelope)
 * @param {Object} [overrides] - per-request values; nullish/empty entries are ignored
 * @returns {Object|undefined}
 */
export const resolveEnvelope = (publisher, overrides = {}) => {
  if (!publisher?.envelope) return undefined
  const clean = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, v]) => v != null && v !== '')
  )
  return { ...publisher.envelope, ...clean }
}

/**
 * Validate that a client-supplied pubDefs bag satisfies a publisher's declared
 * `requires` (an array of input-key names). No-op when nothing is declared.
 * @param {Object} publisher - a registered publisher (with optional .requires)
 * @param {Object} [pubDefs] - the per-invocation bag of provided values
 * @throws {Error} when a required input is null/undefined
 */
export const assertRequires = (publisher, pubDefs = {}) => {
  const required = publisher?.requires
  if (!required || required.length === 0) return
  const name = publisher?.meta?.name ?? 'publisher'
  for (const key of required) {
    if (pubDefs?.[key] == null) {
      throw new Error(`Publisher "${name}" requires input "${key}"`)
    }
  }
}

/**
 * Creates a publisher registry with all built-in publishers as plain objects.
 * Mirrors createHarmonizerRegistry() pattern.
 * @returns {{ getPublisher: Function, listPublishers: Function }}
 */
export const createPublisherRegistry = () => {

  // --- RSS 2.0 ---

  const rss2Schema = {
    '@context': 'https://www.rssboard.org/rss-specification',
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

  // The envelope is always pre-resolved (defaults + per-request overrides merged by
  // resolveEnvelope) before it reaches render, so we just read canonical fields.
  const rss2Render = (items, envelope = {}) => `
  <rss
    xmlns:atom="http://www.w3.org/2005/Atom"
    version="2.0">
    <channel>
      ${xmlTag('title', envelope.title)}
      ${xmlTag('link', envelope.link)}
      ${envelope.link ? `<atom:link href="${xmlEncode(envelope.link)}" rel="self" type="application/rss+xml" />` : ''}
      ${xmlTag('description', envelope.description)}
      ${xmlTag('pubDate', envelope.date)}
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
      ${items.map(rss2RenderItem).join('')}
    </channel>
  </rss>
`

  const rss2 = {
    resolver: rss2Schema,
    contentType: 'application/rss+xml',
    meta: {
      name: 'RSS 2.0 Feed',
    },
    envelope: {
      title: 'Octothorpes Feed',
      description: 'Links from the Octothorpes network',
      link: 'https://octothorp.es/',
    },
    render: rss2Render,
  }

  // --- ATProto ---

  const standardSiteSchema = {
    '@context': 'https://standard.site/',
    '@id': 'https://octothorp.es/publishers/standard-site.document',
    '@type': 'resolver',
    meta: {
      name: 'Standard Site Document',
      description: 'Publishes rich content to site.standard.document with textContent, site, and path',
      lexicon: 'site.standard.document'
    },
    schema: {
      site: { 'from': ['documentRecord.site', '@id'], 'required': true },
      path: { 'from': 'documentRecord.path' },
      title: { 'from': ['title', '@id'], 'required': true },
      description: { 'from': 'description' },
      textContent: { 'from': 'documentRecord.textContent' },
      tags: { 'from': 'octothorpes', 'postProcess': { 'method': 'extractTags' } },
      publishedAt: { 'from': 'date', 'postProcess': [{ 'method': 'date', 'params': 'iso8601' }, { 'method': 'default', 'params': 'now' }] }
    }
  };



  const standardSiteDocument = {
    resolver: standardSiteSchema,
    contentType: 'application/json',
    meta: {
      name: 'ATProto StandardSiteDocument',
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
    resolver: blueskySchema,
    contentType: 'application/json',
    meta: {
      name: 'Bluesky Post',
      lexicon: 'app.bsky.feed.post',
    },
    render: blueskyRender,
  }

  // --- iCalendar (ICS) ---
  // Inverse of the calendar handler (handlers/calendar/parse.js): blobjects
  // (calendar-ingested events, or any dated page) → a VCALENDAR document.

  const icsSchema = {
    '@context': 'https://www.rfc-editor.org/rfc/rfc5545',
    '@id': 'https://octothorp.es/publishers/ics',
    '@type': 'resolver',
    schema: {
      uid: { from: '@id', required: true },
      summary: { from: ['title', '@id'], required: true },
      // Calendar events carry startDate; generic dated pages fall back to date.
      start: { from: ['startDate', 'date'], required: true },
      end: { from: 'endDate' },
      description: { from: 'description' },
      location: { from: 'location' },
      url: { from: '@id' },
      categories: { from: 'octothorpes', postProcess: { method: 'extractTags' } },
    }
  }

  // Escape an iCalendar TEXT value (inverse of parse.js unescapeText):
  // backslash, semicolon, comma, and newlines.
  const icsEscapeText = value => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')

  // ISO 8601 → iCalendar basic form. Returns the property name (so date-only
  // values can carry the VALUE=DATE parameter) alongside the formatted value.
  const icsFormatDate = (name, value) => {
    if (value == null) return null
    const date = new Date(value)
    if (isNaN(date.getTime())) return null
    const s = String(value)
    // Date-only (no time component): emit a DATE value.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
      return `${name};VALUE=DATE:${d}`
    }
    return `${name}:${icsFormatUtc(date)}`
  }

  const pad = n => String(n).padStart(2, '0')

  const icsFormatUtc = date =>
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`

  // Fold a content line to <=75 octets, continuations prefixed with one space.
  const icsFold = line => {
    const bytes = Buffer.from(line, 'utf8')
    if (bytes.length <= 75) return line
    const out = []
    let start = 0
    let first = true
    while (start < bytes.length) {
      const limit = first ? 75 : 74 // continuation lines reserve a leading space
      let end = Math.min(start + limit, bytes.length)
      // Don't split a multi-byte UTF-8 sequence: back off to a lead byte.
      while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
      const chunk = bytes.slice(start, end).toString('utf8')
      out.push(first ? chunk : ` ${chunk}`)
      start = end
      first = false
    }
    return out.join('\r\n')
  }

  const icsLine = (name, value) => icsFold(`${name}:${icsEscapeText(value)}`)

  const icsRenderEvent = item => {
    const lines = ['BEGIN:VEVENT']
    lines.push(icsFold(`UID:${item.uid}`))
    lines.push(`DTSTAMP:${icsFormatUtc(new Date())}`)
    const start = icsFormatDate('DTSTART', item.start)
    if (start) lines.push(start)
    const end = icsFormatDate('DTEND', item.end)
    if (end) lines.push(end)
    if (item.summary) lines.push(icsLine('SUMMARY', item.summary))
    if (item.description) lines.push(icsLine('DESCRIPTION', item.description))
    if (item.location) lines.push(icsLine('LOCATION', item.location))
    if (item.url) lines.push(icsFold(`URL:${item.url}`))
    if (item.categories?.length) {
      lines.push(icsFold(`CATEGORIES:${item.categories.map(icsEscapeText).join(',')}`))
    }
    lines.push('END:VEVENT')
    return lines
  }

  const icsRender = (items, envelope) => {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Octothorpes//OP ICS Publisher//EN',
      'CALSCALE:GREGORIAN',
    ]
    const calName = envelope?.title
    if (calName) lines.push(icsLine('X-WR-CALNAME', calName))
    for (const item of items) lines.push(...icsRenderEvent(item))
    lines.push('END:VCALENDAR')
    return lines.join('\r\n') + '\r\n'
  }

  const ics = {
    resolver: icsSchema,
    contentType: 'text/calendar',
    meta: {
      name: 'iCalendar Feed',
      description: 'Publishes dated blobjects as an iCalendar (.ics) VCALENDAR feed',
    },
    envelope: {
      title: 'Octothorpes Calendar',
    },
    render: icsRender,
  }

  // --- Registry ---

  const publishers = {
    rss2,
    rss: rss2,  // alias
    standardSiteDocument,
    bluesky,
    ics,
  }

  const builtins = new Set(Object.keys(publishers))

  const getPublisher = (name) => publishers[name] ?? null

  const listPublishers = () => Object.keys(publishers)

  const register = (name, publisher) => {
    if (builtins.has(name)) throw new Error(`Publisher "${name}" is already registered as a built-in`)
    // Flat shape: resolver fields at top level (@context, @id, schema, contentType, render)
    // Explicit shape: { resolver: resolverObj, contentType, meta, render }
    const isFlat = publisher['@context'] || publisher['@id']
    const normalized = isFlat
      ? { resolver: publisher, contentType: publisher.contentType, meta: publisher.meta ?? {}, envelope: publisher.envelope, requires: publisher.requires, render: publisher.render }
      : publisher
    if (!normalized.resolver || !normalized.contentType || typeof normalized.render !== 'function') {
      throw new Error('Publisher must have resolver, contentType, and render')
    }
    publishers[name] = normalized
  }

  return { getPublisher, listPublishers, register }
}
