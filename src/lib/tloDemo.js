// STAGING-ONLY Tiny Little Office demo (issue #318), gated by the `tlo_demo`
// env var (default off). Kept free of $env/$lib imports so it is unit-testable;
// the route injects the flag value and the indexer deps.
//
// Why not /index: core's handler() fetches the page and keys the subject on
// origin+pathname, dropping the #doc= fragment that IS the document. TLO
// indexing must decode the submitted string instead, so this runs a small
// fetch-less pipeline: flag -> TLO URL check -> ban -> approved-origin gate ->
// rate limit -> cooldown -> tlo handler -> ingestBlobject.
//
// Origin policy: tinylittleoffice.com must be approved by hand at /admin on
// the staging relay. It is intentionally NOT whitelisted in octothorpes.json.
import tloHandler, { isTloUrl } from 'octothorpes/handlers/tlo/handler.js'

export const TLO_ORIGIN = 'https://tinylittleoffice.com'

export const tloDemoEnabled = (value) =>
  ['true', '1', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())

export const indexTloLink = async (uri, {
  enabled,
  isApproved,
  isBanned,
  checkRateLimit,
  recentlyIndexed,
  recordIndexing,
  ingestBlobject,
}) => {
  if (!enabled) throw new Error('The TLO demo is not enabled on this relay.')
  if (!isTloUrl(uri)) throw new Error('Only links starting with https://tinylittleoffice.com/ are accepted.')
  if (await isBanned(TLO_ORIGIN)) throw new Error('tinylittleoffice.com is banned from this server.')
  if (!(await isApproved(TLO_ORIGIN))) {
    throw new Error('tinylittleoffice.com is not an approved origin on this relay. Ask the maintainer to approve it at /admin.')
  }
  if (!checkRateLimit(TLO_ORIGIN)) throw new Error('Rate limit exceeded. Please try again later.')
  if (await recentlyIndexed(uri)) throw new Error('This link has been recently indexed.')
  const blobject = await tloHandler.harmonize(uri)
  await recordIndexing(uri)
  await ingestBlobject(blobject)
  return blobject
}
