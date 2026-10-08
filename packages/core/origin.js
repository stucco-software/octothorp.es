import { originVariants } from './uri.js'

export const verifyApprovedDomain = async (origin, { queryBoolean }) => {
  // Match any spelling of the origin, not just the one that asked (#275).
  // Origins are stored canonically (no www, no trailing slash), but a site may
  // ask as https://www.foo.com/, and legacy rows may carry either spelling.
  const variants = originVariants(origin).map((o) => `<${o}>`).join(' ')
  let originVerified = await queryBoolean(`
    ask {
      values ?origin { ${variants} }
      ?origin octo:verified "true" .
    }
  `)
  return originVerified
}

export const verifyWebOfTrust = async (origin, { queryBoolean }) => {
  // @TKTK
  // Are there any verified origins in the graph that…
    // endorse this origin?
    // endorse an origin that endorses this origin?
    // endorse an origin that enorses an origin that … etc etc ect
    // this is a sparql property path traversal?
      // given ?unknown…
      // ASK {
      //   ?origin octo:verified "true" .
      //   ?origin octo:endorses+ ?unknown .
      // }
  // TODO make this retur real value

  return false
}

export const verifiedOrigin = async (origin, { queryBoolean }) => {
  // TKTK this should use env vars, but something like an object
  // that contains both the flag for method to use
  // and the params to send it. that way you can't just look at the repo
  // and find the verification criteria for different services.
  // We can also add a couple more basic methods, like verifying
  // on origin (ie *.glitch.com) and white/blacklists.
  //
  // The old per-service content checks are no longer here. The Bear Blog meta
  // tag became an injected endorser (src/lib/endorsers/clientEndorsed.js), and
  // robots directives are resolved by resolveIndexPolicy in ./indexer.js,
  // before any gate.
  // TKTK verify web trusted domain
  // let webbed = await verifyWebOfTrust(origin)
  return await verifyApprovedDomain(origin, { queryBoolean })
}
