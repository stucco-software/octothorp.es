import { queryBoolean } from '$lib/sparql.js'
import { server_name } from '$env/static/private'
import { JSDOM } from 'jsdom'

const verifiyContent = async (s) => {
  let response = await fetch(s)
  const src = await response.text()
  const DOMParser = new JSDOM().window.DOMParser
  const parser = new DOMParser()
  let doc = parser.parseFromString(src, "text/html")

  // let pageMetaNode = doc.querySelector("meta[content='look-for-the-bear-necessities']")
  let isGood = false
  let isNotBad = true;
  // const robotsMetaTags = doc.querySelectorAll("meta[name='robots']");
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

const verifyApprovedDomain = async origin => {
  let originVerified = await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)
  return originVerified
}

const verifyWebOfTrust = async origin => {
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

export const verifiedOrigin = async (origin) => {
  // TKTK this should use env vars, but something like an object
  // that contains both the flag for method to use 
  // and the params to send it. that way you can't just look at the repo
  // and find the verification criteria for different services.
  // We can also add a couple more basic methods, like verifying
  // on origin (ie *.glitch.com) and white/blacklists.
  if (server_name == "Bear Blog") {
    // this will work with Bear Blog but we should consider 
    // whether we should try to do this on the full url that requests indexing
    // return false
    return await verifiyContent(origin)
  } else {
    // TKTK verify web trusted domain
    // let webbed = await verifyWebOfTrust(origin)
    return await verifyApprovedDomain(origin)
  }
}