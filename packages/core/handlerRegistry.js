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

  return { register, getHandler, getHandlerForContentType, listHandlers, markBuiltins }
}
