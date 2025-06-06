import { queryBoolean, queryArray, buildEverythingQuery, testQueryFromMultiPass, buildSimpleQuery } from '$lib/sparql.js'
import { getBlobjectFromResponse, getMultiPassFromParams } from '$lib/converters.js'
import { error, redirect, json } from '@sveltejs/kit';
import { buildSimpleQuery } from '../../../../../lib/sparql';
/*

get
  /everything (blobjects)
  /links
  /terms
  /domains
  /pages
 /webrings
     	/thorped
    	/in-ring
	/linked(etc)
	/posted
     
get/[what]/[by]/[[as]]??

terms
thorpes
octothorpes
links
backlinks
bookmarks
all


if by is in-webring
    sMode = WEBRING
if by is octo/thorpe/term/etc
    objectType = term
if WHAT is everything
    LIMIT and OFFSET and WHEN need to apply to the returned BLOBJECTS
    NOT the actual db query
[[as]]
default json
accept RSS, etc
*/


export async function load({ params, url }) {
    const multiPass = getMultiPassFromParams(params, url)
    let query = ""

    switch (params.what) {
        case "links":
            query = buildSimpleQuery(multiPass)
            break;
        case "everything":
            query = buildEverythingQuery(multiPass)
        default:
            break;
    }
    const sr = await queryArray(query)
    // check to run filters on result instead of query
    // const blobjects = "await getBlobjectFromResponse(sr)"
    return { 
            multiPass: multiPass,    
            query: query,
            sr: sr
    }
}

// fix handling of default objects / subjects ie s? and o?
// fix subject and object mode always being fuzzy
// look into time filters taking so long
// look into fuzzy subject still normalizing the url
// look into handling PARENT and FORMAT at once
// add elements to blobject
// otherwise this fuckin works! 
// limit switch on result mode
// EXCLUDE values -- consider subjects {include: , exclude:}
// EHHHHHHHHH maybe refactor MultiPass like so


const MultiPass = {
    meta: {
        nickName: "string",
        author: "whoever",
        image: "url",
        version: "1.x",
        shouldReturn: "blobjects",
    },
    subjects: {
        mode: "fuzzy",
        include: [],
        exclude: []
    },
    objects: {
        mode: "fuzzy",
        include: [],
        exclude: [] 
    },
    filters: {
        limit: "int",
        offset: "int",
        dateRange: { 
            after: Date,
            before: Date,
        }
    }
}