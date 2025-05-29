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
    return query
}

// fix handling of default objects / subjects ie s? and o?
// otherwise this fuckin works!