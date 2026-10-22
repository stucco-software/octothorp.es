// Bluesky (app.bsky.feed.post) publisher: composes post text under the 300
// grapheme limit and emits richtext facets with UTF-8 byte offsets. Two-file
// layout per #323.
import resolver from './resolver.json' with { type: 'json' }

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

const render = (items, _feedMeta) => {
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

export default {
  resolver,
  contentType: 'application/json',
  meta: {
    name: 'Bluesky Post',
    lexicon: 'app.bsky.feed.post',
  },
  render,
}
