import { queryBoolean, queryArray, buildEverythingQuery, testQueryFromMultiPass, buildSimpleQuery } from '$lib/sparql.js'
import { getBlobjectFromResponse, getMultiPassFromParams } from '$lib/converters.js'
import { parseBindings } from '$lib/utils'
import { error, redirect, json } from '@sveltejs/kit';
/*

get
  /everything
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
  const multiPass = getMultiPassFromParams(params, url);
  let query = "";
  let actualResults = "";

  switch (params.what) {
    case "pages":
    case "backlinks":
      query = buildSimpleQuery(multiPass);
      const sr = await queryArray(query);
      actualResults = parseBindings(sr.results.bindings);
      break;

    case "everything":
      query = buildEverythingQuery(multiPass);
      const bj = await queryArray(query);
      // Pass filters when returning blobjects, because blobjects are composite objects
      // and we want to filter the set of blobjects, not response entries
      actualResults = await getBlobjectFromResponse(bj, multiPass.filters);
      // TKTK check to run filters on result instead of query
      break;
    case "thorpes":
    // TKTK after v0.5
      break;
    case "domains":
      break;
    case "webrings":
      break;
    default:
      break;
  }
  return {
    multiPass: multiPass,
    query: query,
    actualResults: actualResults,
  };
}
