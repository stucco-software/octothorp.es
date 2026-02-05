/**
 * Publisher System
 * 
 * Transforms OP data (blobjects) into other structured formats
 * using declarative resolver schemas.
 */

export { resolve, validateResolver, loadResolver } from './resolve.js'
export { rssItem, rssChannel } from './resolvers/rss.js'

// ATProto resolver is loaded from JSON - import with:
// import atprotoDocument from '$lib/publish/resolvers/atproto-document.json'
