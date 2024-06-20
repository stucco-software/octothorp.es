import { getGraph, getFrame } from '$lib/ld/graph'

export async function load({ params }){
  const r = await getGraph()
  let docTree = await getFrame({
    id: "/docs",
    body: {},
    hasPart: {
      prefLabel: {},
      id: {},
      type: {},
      body: {},
      draft: {},
      hasPart: {
        prefLabel: {},
        draft: {},
        body: {}
      }
    }
  })
  return docTree
}