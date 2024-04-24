import { queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { json, error } from '@sveltejs/kit'

export async function GET(req) {
  const thorpe = req.params.thorpe
  const sr = await queryArray(`
    SELECT ?s {
     ?s octo:octothorpes <${instance}~/${thorpe}> .
    }
  `)
  const thorpes = sr.results.bindings.map(b => b.s.value)

  return json({
    uri: `${instance}~/${thorpe}`,
    octothorpedBy: thorpes
  })
}

const verifiedOrigin = async (s) => {} // Boolean
const verifiedThorpe = async (o) => {} // Boolean
const createOctothorpe = async ({s, p, o}) => {} // object or error

const recordCreation = async () => {
  // what … does this do really?
  // "this object was created NOW"
}
const recordUsage = async () => {
  // and this one?
  // "this thorpe was added to NOW"
}
const emailAdministrator = async () => {} // object or error

export async function POST({params, request}) {
  const data = await request.formData()
  let o = `/~/${params.thorpe}`
  let p = data.get('p')
  let s = data.get('s')
  console.log(s, p, o)
  return json({
    okay: 200
  })
}