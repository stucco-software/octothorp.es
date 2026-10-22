// RSS 2.0 feed publisher. Same two-file layout as a site publisher under
// `api.publishers.dir` (#323): the resolver is data, the renderer is code.
//
// The resolver's `from` arrays are ordered fallbacks so one resolver consumes
// both shapes: blobjects (keyed by `@id`, from everything/blobjects routes) and
// parseBindings rows (keyed by `uri`, from pages/links/thorpes/domains routes).
// Without the `uri` fallback, page rows fail the required `link`/`title` and
// get dropped, producing an empty feed (#233, #212).
import resolver from './resolver.json' with { type: 'json' }

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

const renderItem = item => `
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
const render = (items, envelope = {}) => `
  <rss
    xmlns:atom="http://www.w3.org/2005/Atom"
    version="2.0">
    <channel>
      ${xmlTag('title', envelope.title)}
      ${xmlTag('link', envelope.link)}
      ${envelope.link ? `<atom:link href="${xmlEncode(envelope.link)}" rel="self" type="application/rss+xml" />` : ''}
      ${xmlTag('description', envelope.description)}
      ${xmlTag('pubDate', envelope.feedDate)}
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
      ${items.map(renderItem).join('')}
    </channel>
  </rss>
`

export default {
  resolver,
  contentType: 'application/rss+xml',
  meta: {
    name: 'RSS 2.0 Feed',
  },
  envelope: {
    title: 'Octothorpes Feed',
    description: 'Links from the Octothorpes network',
    link: 'https://octothorp.es/',
  },
  render,
}
