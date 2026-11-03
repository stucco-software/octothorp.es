// DEPRECATED (#248): thin shim over deleter.js, removed in Phase 7.
// Use createDeleter / client.deleter instead.
import { createDeleter } from './deleter.js'

const forSparql = (sparql) => createDeleter({ query: sparql.query, queryArray: sparql.queryArray })

export const assertDeletableTarget = (targetConfig) => createDeleter().assertDeletableTarget(targetConfig)
export const deletePage = (sparql, pageUrl) => forSparql(sparql).hardDeletePage(pageUrl)
export const deleteOrigin = (sparql, originUrl, targetConfig) => forSparql(sparql).hardDeleteOrigin(originUrl, targetConfig)
