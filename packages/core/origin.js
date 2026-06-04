export const verifiyContent = async (s) => {
  let response = await fetch(s)
  const src = await response.text()
  const { JSDOM } = await import('jsdom')
  const DOMParser = new JSDOM().window.DOMParser
  const parser = new DOMParser()
  let doc = parser.parseFromString(src, "text/html")

  let isGood = false
  let isNotBad = true;
  const metaTags = doc.getElementsByTagName('meta');

  // Iterate through all meta tags
  for (let i = 0; i < metaTags.length; i++) {
    const metaTag = metaTags[i];
    if (metaTag.getAttribute('content') == 'look-for-the-bear-necessities') {
      isGood = true;
    }
    // Check if the meta tag has a name attribute set to "robots"
    if (metaTag.getAttribute('name') === 'robots') {
      const content = metaTag.getAttribute('content');

      // Check if the content contains "nofollow" or "noindex"
      if (content && (content.toLowerCase().includes('nofollow') && content.toLowerCase().includes('noindex'))) {
        // Return false if both are found
        // This lets people still use "nofollow" on its own
        isNotBad = false;
      }
    }
  }

  if (isGood && isNotBad ) {
    console.log("Passes")
    return true;
  }
  else {
    console.log("Octothorpes will not index this page");
    return false;
  }
}

export const verifyApprovedDomain = async (origin, { queryBoolean }) => {
  let originVerified = await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)
  console.log(`ask {
      <${origin}> octo:verified "true" .
    }`, originVerified)
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

// Assert a verified origin (used by open-mode auto-verification). Mirrors the
// origin triples written during normal processing (see indexer.js createOctothorpe).
export const createVerifiedOrigin = async (origin, { insert }) => {
  return await insert(`
    <${origin}> rdf:type <octo:Origin> .
    <${origin}> octo:verified "true" .
  `)
}

export const verifiedOrigin = async (origin, { serverName, queryBoolean, registration_mode, insert }) => {
  if (serverName == "Bear Blog") {
    // this will work with Bear Blog but we should consider
    // whether we should try to do this on the full url that requests indexing
    return await verifiyContent(origin)
  }
  const approved = await verifyApprovedDomain(origin, { queryBoolean })
  if (approved) return true
  // Open mode: the on-page opt-in already ran upstream (proof of control) and the
  // ban gate already rejected banned origins, so auto-create + verify.
  if (registration_mode === 'open' && insert) {
    await createVerifiedOrigin(origin, { insert })
    return true
  }
  return false
}

// Block + purge an origin. Order matters: delete the origin's pages and their blank
// nodes FIRST, then GC terms left with zero references, then write the tombstone.
export const banOrigin = async (domain, { query }) => {
  await query(`
    delete { ?page ?pp ?po . ?bn ?bp ?bo . }
    where {
      <${domain}> octo:hasPart ?page .
      ?page ?pp ?po .
      optional { ?page octo:octothorpes ?bn . filter(isBlank(?bn)) . ?bn ?bp ?bo . }
    }
  `)
  await query(`
    delete { ?term ?tp ?to . }
    where {
      ?term rdf:type <octo:Term> ; ?tp ?to .
      filter not exists { ?p octo:octothorpes ?term . }
    }
  `)
  await query(`delete { <${domain}> ?p ?o . } where { <${domain}> ?p ?o . }`)
  await query(`insert data { <${domain}> rdf:type <octo:Origin> . <${domain}> octo:banned "true" . }`)
}
