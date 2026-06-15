import { queryBoolean, queryArray, buildEverythingQuery, buildSimpleQuery, buildThorpeQuery, buildDomainQuery, enrichBlobjectTargets } from '$lib/sparql.js'
import { getBlobjectFromResponse, getMultiPassFromParams } from '$lib/converters.js'
import { parseBindings, rss, createPublisherRegistry, publish } from 'octothorpes'
import { publishers as sitePublishers } from '$lib/publishers/index.js'
import { error, redirect, json } from '@sveltejs/kit';

const publisherRegistry = createPublisherRegistry()
for (const [name, pub] of Object.entries(sitePublishers)) {
  try {
    publisherRegistry.register(name, pub)
  } catch (err) {
    console.warn(`Skipping site publisher "${name}": ${err.message}`)
  }
}


export async function load({ params, url, fetch }) {
  const multiPass = getMultiPassFromParams(params, url);
  let query = "";
  let actualResults = "";

  // Early return for multipass endpoint - don't execute queries
  if (params.as === "multipass") {
    // Build query string without executing it
    switch (params.what) {
      case "pages":
      case "links":
      case "backlinks":
        query = buildSimpleQuery(multiPass);
        break;
      case "everything":
        query = await buildEverythingQuery(multiPass);
        break;
      case "thorpes":
        query = buildThorpeQuery(multiPass);
        break;
      case "domains":
        query = buildDomainQuery(multiPass);
        break;
      default:
        throw new Error(`Invalid route.`)
    }
    return {
      multiPass: multiPass,
      query: query
    }
  }

  switch (params.what) {
    case "pages":
    case "links":
    case "backlinks":
      query = buildSimpleQuery(multiPass);
      const sr = await queryArray(query);
      actualResults = parseBindings(sr.results.bindings);
      break;

    case "everything":
      query = await buildEverythingQuery(multiPass);
      const bj = await queryArray(query);
      // Pass filters when returning blobjects, because blobjects are composite objects
      // and we want to filter the set of blobjects, not response entries
      actualResults = await getBlobjectFromResponse(bj, multiPass.filters);
      actualResults = await enrichBlobjectTargets(actualResults);
      // TKTK check to run filters on result instead of query
      break;
    case "thorpes":
      query = buildThorpeQuery(multiPass);
      const tr = await queryArray(query);
      actualResults = parseBindings(tr.results.bindings, "terms")
      break;
    case "domains":
      query = buildDomainQuery(multiPass);
      const dr = await queryArray(query);
      actualResults = parseBindings(dr.results.bindings)
      break;
    default:
    throw new Error(`Invalid route.`)
      break
  }

  switch (params.as) {
    case "debug":
    return {
      multiPass: multiPass,
      query: query,
      actualResults: actualResults,
    }
    case "rss":
      // Create RSS feed structure
      const rssTree = {
        channel: {
          title: multiPass.meta.title,
          description: multiPass.meta.description,
          link: url.href,
          pubDate: new Date().toUTCString(),
          items: actualResults
        }
      };

      return {
        rss: rss(rssTree, params.what)
      };
    default: {
      const publisher = params.as ? publisherRegistry.getPublisher(params.as) : null
      if (publisher) {
        const items = publish(actualResults, publisher.schema)
        // For RSS-shaped publishers (those with channel meta), build per-request channel
        const channel = publisher.meta?.channel ? {
          title: multiPass.meta?.title,
          description: multiPass.meta?.description,
          link: url.href,
          pubDate: new Date().toUTCString(),
        } : publisher.meta
        // render may be async (e.g. publishers that do per-item network I/O).
        // Pass SvelteKit's fetch as an option so publishers can use it.
        const rendered = await publisher.render(items, channel, { fetch })
        return {
          rendered,
          contentType: publisher.contentType,
          publisher: params.as,
        }
      }
      return { results: actualResults }
    }
  }

}
