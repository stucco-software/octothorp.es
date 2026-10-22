// ATProto site.standard.document publisher: the resolver does all the work, so
// render is the identity. Two-file layout per #323.
import resolver from './resolver.json' with { type: 'json' }

export default {
  resolver,
  contentType: 'application/json',
  meta: {
    name: 'ATProto StandardSiteDocument',
    description: 'Converts blobjects to site.standard.document format',
    lexicon: 'site.standard.document',
  },
  render: (items, _feedMeta) => items,
}
