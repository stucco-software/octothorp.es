// For each changed spelling: does the canonical spelling already exist as a
// node, and how many triples hang off the old spelling (subject/object side)?
import { readFile } from 'node:fs/promises'
const m = JSON.parse(await readFile(process.argv[2], 'utf8'))
const BASE = 'http://0.0.0.0:7879'
const sel = async (q) => (await (await fetch(`${BASE}/query`, { method: 'POST', headers: { 'content-type': 'application/sparql-query', accept: 'application/sparql-results+json' }, body: q })).json()).results.bindings
const n = async (q) => Number((await sel(q))[0].n.value)
for (const [label, list] of [['SUBJECT', m.subjChanged], ['OBJECT', m.objChanged]]) {
  const urls = [...new Map(list.map((x) => [x.from, x.to])).entries()]
  let canonExists = 0, oldAsSubj = 0, oldAsObj = 0, oldIsPage = 0, canonIsPage = 0
  const exists = []
  for (const [from, to] of urls) {
    const ce = await n(`SELECT (COUNT(*) AS ?n) WHERE { { <${to}> ?p ?o } UNION { ?s ?p <${to}> } }`)
    if (ce) { canonExists++; exists.push(`${from} -> ${to} (${ce} triples)`) }
    oldAsSubj += await n(`SELECT (COUNT(*) AS ?n) WHERE { <${from}> ?p ?o }`)
    oldAsObj += await n(`SELECT (COUNT(*) AS ?n) WHERE { ?s ?p <${from}> }`)
    if (await n(`SELECT (COUNT(*) AS ?n) WHERE { <${from}> a <octo:Page> }`)) oldIsPage++
    if (await n(`SELECT (COUNT(*) AS ?n) WHERE { <${to}> a <octo:Page> }`)) canonIsPage++
  }
  console.log(label, { distinct: urls.length, canonExists, oldIsPage, canonIsPage, triplesWithOldAsSubject: oldAsSubj, triplesWithOldAsObject: oldAsObj })
  for (const e of exists) console.log('  canon exists:', e)
}
