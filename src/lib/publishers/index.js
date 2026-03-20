const renderers = import.meta.glob('./*/renderer.js', { eager: true })

export const publishers = Object.fromEntries(
  Object.entries(renderers)
    .map(([path, mod]) => [path.split('/')[1], mod.default])
    .filter(([name]) => !name.startsWith('_'))
)
