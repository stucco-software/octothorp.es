/**
 * Publisher System
 * 
 * Transforms OP data (blobjects) into other structured formats
 * using declarative resolver schemas.
 */

export { resolve, validateResolver } from './resolve.js'
export { rssItem, rssChannel } from './resolvers/rss.js'
