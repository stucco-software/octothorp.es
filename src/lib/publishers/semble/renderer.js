import resolver from './resolver.json'

export default {
  ...resolver,
  render: (items) => items.map(item => ({
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
}
