import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { TID } from '@atproto/common-web'

const resolver = JSON.parse(
  await readFile(new URL('./resolver.json', import.meta.url), 'utf8')
)

export default {
  schema: resolver,
  contentType: 'application/json',
  meta: resolver.meta,

  // Publication this publisher targets on leaflet.pub.
  publication: 'at://did:plc:dqwrazxvzuekt2jleqsc4dbt/site.standard.publication/3mhjczzi37k2t',
  publicationUrl: 'https://octothorpes.leaflet.pub',

  // Renderer: conforms resolved items to site.standard.document with
  // pub.leaflet.content blocks so Leaflet.pub can render the full post.
  render(items) {
    return items.map(item => {
      // Get plaintext, flattening the harmonizer's array of selector matches
      let plaintext = ''
      if (Array.isArray(item.textContent)) {
        plaintext = (item.textContent.find(t => t && t.trim()) || '').trim()
      } else if (item.textContent) {
        plaintext = item.textContent
      }

      // Generate a TID to use as both the rkey and path, so the
      // canonical URL (publication.url + path) resolves on leaflet.pub.
      const rkey = TID.nextStr()

      const record = {
        $type: 'site.standard.document',
        site: this.publication,
        path: `/${rkey}`,
        title: item.title,
        publishedAt: item.publishedAt || new Date().toISOString(),
        _rkey: rkey,
      }

      // Wrap textContent into pub.leaflet.content block structure
      if (plaintext) {
        record.content = {
          $type: 'pub.leaflet.content',
          pages: [{
            id: randomUUID(),
            $type: 'pub.leaflet.pages.linearDocument',
            blocks: [{
              $type: 'pub.leaflet.pages.linearDocument#block',
              block: {
                $type: 'pub.leaflet.blocks.text',
                plaintext,
              },
            }],
          }],
        }
      }

      if (item.description) record.description = item.description
      if (item.tags?.length) record.tags = item.tags

      return record
    })
  },
}
