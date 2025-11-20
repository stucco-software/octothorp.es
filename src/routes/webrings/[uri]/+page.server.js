import { queryArray } from '$lib/sparql.js'

export async function load({ params }) {
  const webringUri = decodeURIComponent(params.uri)
  
  let members = []
  let webringExists = false
  let webringTitle = null
  let webringDescription = null
  let webringImage = null
  
  try {
    // Get webring metadata
    const webringData = await queryArray(`
      select ?title ?description ?image {
        <${webringUri}> rdf:type <octo:Webring> .
        optional { <${webringUri}> octo:title ?title . }
        optional { <${webringUri}> octo:description ?description . }
        optional { <${webringUri}> octo:image ?image . }
      }
    `)
    
    webringExists = webringData.results.bindings.length > 0
    
    if (webringExists) {
      const webring = webringData.results.bindings[0]
      webringTitle = webring.title?.value || null
      webringDescription = webring.description?.value || null
      webringImage = webring.image?.value || null
      
      // Get all members of the webring
      const response = await queryArray(`
        select ?member ?title ?description ?image {
          <${webringUri}> octo:hasMember ?member .
          optional { ?member octo:title ?title . }
          optional { ?member octo:description ?description . }
          optional { ?member octo:image ?image . }
        }
      `)
      
      members = response.results.bindings
        .map(node => ({
          uri: node.member.value,
          title: node.title?.value || null,
          description: node.description?.value || null,
          image: node.image?.value || null
        }))
    }
  } catch (e) {
    console.log(e)
  }
  
  return {
    webringUri,
    webringExists,
    webringTitle,
    webringDescription,
    webringImage,
    members
  }
}
