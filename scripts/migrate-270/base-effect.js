// Which captured diffs are attributable to the newly asserted base triples?
// A '+' diff whose request or path names a missing-base subject (canonical)
// and whose value/path names that pair's object.
import { readFile } from 'node:fs/promises'
const all = JSON.parse(await readFile('scripts/migrate-270/out/triage.json', 'utf8'))
const m = JSON.parse(await readFile('scripts/migrate-270/out/phase0b.json', 'utf8'))
const { canonical } = await import('octothorpes')
const pairs = m.missingBase.map((r) => [canonical(r.s), canonical(r.o), r.t])
const hits = new Map()
for (const d of all) {
  if (d.op !== '+') continue
  const hay = decodeURIComponent(d.url) + ' ' + d.path + ' ' + JSON.stringify(d.v)
  for (const [s, o, t] of pairs) {
    if (hay.includes(s) && hay.includes(o)) { const k = `${s} -> ${o} (${t})`; (hits.get(k) || hits.set(k, []).get(k)).push(`${d.cat} ${d.route}`) }
  }
}
console.log('missing-base pairs:', pairs.length, ' pairs with a visible + diff:', hits.size)
for (const [k, v] of hits) console.log(' ', k, '|', [...new Set(v)].join(', '), `x${v.length}`)
