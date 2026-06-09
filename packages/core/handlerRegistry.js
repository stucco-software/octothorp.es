export const nullHandler = {
  mode: 'null',
  contentTypes: [],
  meta: {
    name: 'Null Handler',
    description: 'Last-resort fallback. Returns a minimal blobject with no extracted metadata.',
  },
  harmonize: (content, schema, options = {}) => ({ '@id': 'source', octothorpes: [] }),
}

export const createHandlerRegistry = () => {
  const handlers = {}
  const contentTypeMap = {}
  const builtins = new Set()

  const register = (mode, handler) => {
    if (builtins.has(mode)) throw new Error(`Handler "${mode}" is already registered as a built-in`)
    if (!handler.mode || !handler.contentTypes || typeof handler.harmonize !== 'function') {
      throw new Error('Handler must have mode, contentTypes, and harmonize')
    }
    handlers[mode] = handler
    for (const ct of handler.contentTypes) {
      contentTypeMap[ct] = handler
    }
  }

  const getHandler = (mode) => handlers[mode] ?? null

  const getHandlerForContentType = (contentType) => {
    // Strip parameters (e.g., "text/html; charset=utf-8" -> "text/html")
    const base = contentType?.split(';')[0]?.trim()
    return contentTypeMap[base] ?? null
  }

  const listHandlers = () => Object.keys(handlers)

  const markBuiltins = () => {
    for (const mode of Object.keys(handlers)) {
      builtins.add(mode)
    }
  }

  let defaultMode = null

  const setDefault = (mode) => {
    if (!handlers[mode]) throw new Error(`Cannot set default: handler "${mode}" is not registered`)
    defaultMode = mode
  }

  const getDefault = () => (defaultMode ? handlers[defaultMode] : null)

  return { register, getHandler, getHandlerForContentType, listHandlers, markBuiltins, setDefault, getDefault }
}
