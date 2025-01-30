import { queryBoolean } from '$lib/sparql.js'
import { server_name } from '$env/static/private'
import { JSDOM } from 'jsdom'


export const getAlias = (origin) => {
  let alias
  if (origin.startsWith('https')) {
    alias = origin.startsWith('https://www.')
        ? origin.replace('https://www.', 'https://')
        : origin.replace('https://', 'https://www.')
  } else {
    alias = origin.startsWith('http://www.')
      ? origin.replace('http://www.', 'http://')
      : origin.replace('http://', 'http://www.')
  }
  return alias
}

export const verifiedOrigin = async (origin) => {

  
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
   if (verifiyContent(origin)){
    return true
   }
  }
  else {

    let alias = getAlias(origin)

    let originVerified = await queryBoolean(`
      ask {
        <${origin}> octo:verified "true" .
      }
    `)
    let aliasVerified = await queryBoolean(`
      ask {
        <${alias}> octo:verified "true" .
      }
    `)
    return originVerified || aliasVerified
  }
}