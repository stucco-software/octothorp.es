const harmonize = (content, schema, options = {}) => ({
  '@id': 'source',
  octothorpes: [],
})

export default {
  mode: 'null',
  contentTypes: [],
  meta: {
    name: 'Null Handler',
    description: 'Last-resort fallback. Returns a minimal blobject with no extracted metadata.',
  },
  harmonize,
}
