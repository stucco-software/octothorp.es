import context from '$lib/ld/context.json'
import * as jsonld from 'jsonld'

const frame = async (doc, f) => {
  if (jsonld.default) {
    return await jsonld.default.frame(doc, f)
  } else {
    return await jsonld.frame(doc, f)
  }
}


export const getMarkdownMeta = async () => {
  const allMdFiles = import.meta.glob('../../md/*.md')
  const iterable = Object.entries(allMdFiles)
  console.log('???')
  console.log(iterable.length)
  const markowndowns = await Promise.all(
    iterable.map(async ([path, resolver], i) => {
      const r = await resolver()
      console.log(i, r.metadata)
      if (r.metadata) {
        r.metadata.id = path.slice(9, -3)
      }
      return {
        ...r.metadata,
        body: r.default.render().html 
      }
    })
  )

  console.log(markowndowns.length)
  return markowndowns
}

export const getGraph = async () => {
  let data = {
    "@context": context,
    "@graph": await getMarkdownMeta()
  }
  return data
}

export const getFrame = async (query) => {
  const graph = await getGraph()
  let f = {
    "@context": context,
    ...query
  }
  return await frame(graph, f)
}