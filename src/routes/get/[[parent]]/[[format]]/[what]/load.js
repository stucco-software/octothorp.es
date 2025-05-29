import { queryBoolean, queryArray, buildQueryFromMultiPass } from '$lib/sparql.js'
import { getBlobjectFromResponse, getMultiPassFromParams } from '$lib/converters.js'
import { error, redirect, json } from '@sveltejs/kit';
/*

terms
thorpes
octothorpes
links
backlinks
bookmarks
all


if parent is webring
    sMode = WEBRING
if what is octo/thorpe/term/etc
    objectType = term
*/


export async function load({ params, url }) {
    const multiPass = getMultiPassFromParams(params, url)
    const query = buildQueryFromMultiPass(multiPass)
    const sr = await queryArray(query)
    const blobjects = await getBlobjectFromResponse(sr)
    return { 
            multiPass: multiPass,    
            query: query,
            return: blobjects
    }
}

// fix handling of default objects / subjects ie s? and o?
// fix subject and object mode always being fuzzy
// look into time filters taking so long
// look into fuzzy subject still normalizing the url
// look into handling PARENT and FORMAT at once
// add elements to blobject
// otherwise this fuckin works!
// limit is interesting because it limits the response within the blobject