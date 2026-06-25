// Scoped delete primitives.
// deletePage is the reconciliation primitive for issue #26 (no target guard).
// deleteOrigin is the bulk test wipe and IS guarded by assertDeletableTarget.

const strip = (s) => (s || '').replace(/\/$/, '')

const INSTANCE_WHITELIST = ['http://localhost:5173', 'https://next.octothorp.es']
const SPARQL_WHITELIST = ['http://0.0.0.0:7878', 'https://octothorpes-next.fly.dev']

/**
 * Throws unless both targets are on the destructive-op whitelist.
 * @returns {true}
 */
export const assertDeletableTarget = ({ instance, sparql_endpoint }) => {
  const i = strip(instance)
  const s = strip(sparql_endpoint)
  if (!INSTANCE_WHITELIST.includes(i)) {
    throw new Error(`Refusing destructive op: instance "${instance}" is not whitelisted (${INSTANCE_WHITELIST.join(', ')})`)
  }
  if (!SPARQL_WHITELIST.includes(s)) {
    throw new Error(`Refusing destructive op: sparql_endpoint "${sparql_endpoint}" is not whitelisted (${SPARQL_WHITELIST.join(', ')})`)
  }
  return true
}

/**
 * Remove every triple referencing pageUrl (as subject or object) plus the
 * blank-node backlink closures that carry octo:url <pageUrl>.
 */
export const deletePage = async (sparql, pageUrl) => {
  // 1. Blank-node backlink closures first (while octo:url link still exists).
  await sparql.query(`DELETE { ?b ?bp ?bo } WHERE { ?b octo:url <${pageUrl}> ; ?bp ?bo }`)
  // 2. Triples with the page as subject.
  await sparql.query(`DELETE WHERE { <${pageUrl}> ?p ?o }`)
  // 3. Triples with the page as object.
  await sparql.query(`DELETE WHERE { ?s ?p <${pageUrl}> }`)
}

/**
 * Wipe an entire origin: all its pages, then the origin's own triples.
 * Guarded — only runs against whitelisted targets.
 */
export const deleteOrigin = async (sparql, originUrl, targetConfig) => {
  assertDeletableTarget(targetConfig)
  const origin = strip(originUrl)
  const res = await sparql.queryArray(`SELECT ?page WHERE { <${origin}> octo:hasPart ?page }`)
  const pages = res.results.bindings.map((b) => b.page.value)
  for (const page of pages) {
    await deletePage(sparql, page)
  }
  await sparql.query(`DELETE WHERE { <${origin}> ?p ?o }`)
  await sparql.query(`DELETE WHERE { ?s ?p <${origin}> }`)
  return { deletedPages: pages.length }
}
