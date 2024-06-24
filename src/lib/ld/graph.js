import context from '$lib/ld/context.json'
import * as jsonld from 'jsonld'

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('TK', () => {
    // TEST TK: Unsure if this needs to be tested. Maybe failure cases?
    expect('a').toStrictEqual('b')
  })
}
// TK: This does need to be refacted to accept:
//     Get this markdown function _out_ of this file
//     and into some other `content.js` file I guess.
export const getMarkdownMeta = async () => {
  const allMdFiles = import.meta.glob('../../md/*.md')
  const iterable = Object.entries(allMdFiles)
  const markowndowns = await Promise.all(
    iterable.map(async ([path, resolver], i) => {
      const r = await resolver()
      if (r.metadata) {
        r.metadata.id = path.slice(9, -3)
      }
      return {
        ...r.metadata,
        body: r.default.render().html 
      }
    })
  )
  return markowndowns
}

// Private function that just wraps JSONLD lib
const frame = async (doc, f) => {
  if (jsonld.default) {
    return await jsonld.default.frame(doc, f)
  } else {
    return await jsonld.frame(doc, f)
  }
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Returns a JSON-LD graph.', () => {
    // TEST TK: Should be predectiable from context 
    //          and output of sample getMarkdownMeta
    expect('a').toStrictEqual('b')
  })
}
export const getGraph = async () => {
  let data = {
    "@context": context,
    "@graph": await getMarkdownMeta()
  }
  return data
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Frames JSON-LD Graph.', () => {
    // TEST TK: Should be predectiable from context 
    //          and output of sample getMarkdownMeta.
    //          Is this just testing the lib tho?
    //          But is is public and therefor should be tested?
    expect('a').toStrictEqual('b')
  })
}
export const getFrame = async (query) => {
  const graph = await getGraph()
  let f = {
    "@context": context,
    ...query
  }
  return await frame(graph, f)
}