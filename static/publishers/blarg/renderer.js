import resolver from './resolver.json' with { type: 'json' }

export default {
  ...resolver,
  render: (items) => items,
}
