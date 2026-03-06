export const contentType = 'application/json'

export const meta = {
  name: 'Semble Card',
  description: 'Converts blobjects to network.cosmik.card URL records for Semble',
  lexicon: 'network.cosmik.card',
}

export const render = (items, _feedMeta) => items.map(item => ({
  type: 'URL',
  $type: 'network.cosmik.card',
  content: {
    url: item.url,
    $type: 'network.cosmik.card#urlContent',
    metadata: {
      ...(item.title && { title: item.title }),
      ...(item.description && { description: item.description }),
      ...(item.image && { imageUrl: item.image }),
    },
  },
  createdAt: item.createdAt,
}))
