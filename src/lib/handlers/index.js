const handlers = import.meta.glob('./*/handler.js', { eager: true })

export const customHandlers = Object.fromEntries(
  Object.entries(handlers)
    .map(([path, mod]) => [path.split('/')[1], mod.default])
    .filter(([name]) => !name.startsWith('_'))
)
