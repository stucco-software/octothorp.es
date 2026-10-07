// #217 wave 4 stage 4: the ONE place the adapter builds its endorsers, shared
// by src/lib/op.js (createClient) and src/lib/indexing.js (createIndexer — the
// /index route's indexer, which previously got none and denied every
// unregistered origin). Built once at module evaluation, so the
// construction-time missing-marker warning fires once, not per consumer.
import { endorsement_marker, endorsement_selector } from '$lib/config.js'
import { getProfile } from '$lib/profile.js'
import { createClientEndorsed, CLIENT_ENDORSED_NAME } from '$lib/endorsers/clientEndorsed.js'

const profile = getProfile()

// Injection is unconditional — core only runs an endorser the profile's
// policies.access.endorsement.sources names, so an unnamed source is inert.
// The missing-marker warning, however, is a real alarm ONLY when this deploy
// actually names the source: octothorp.es leaves `endorsement_marker` unset on
// purpose, and must not log a false alarm on every boot.
const clientEndorsedNamed = (profile.policies.access.endorsement?.sources ?? []).includes(CLIENT_ENDORSED_NAME)
const clientEndorsed = createClientEndorsed({
  marker: endorsement_marker,
  selector: endorsement_selector,
  warn: clientEndorsedNamed ? console.warn : () => {},
})

export const endorsers = [clientEndorsed]
