const harmonize = (content) => {
  const data = typeof content === 'string' ? JSON.parse(content) : content
  if (!data['@id']) data['@id'] = 'source'
  return data
}

export default {
  mode: 'blobject',
  contentTypes: [],
  meta: {
    name: 'Blobject Passthru Handler',
    description: 'Passes pre-formed blobject JSON through without transformation. Always dispatched by mode declaration, not content-type.',
  },
  harmonize,
}
