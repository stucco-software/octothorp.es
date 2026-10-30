// Proof for pages/bookmarked/rss?limit=100 window movers: every item that left
// or entered the 100-row window must belong to the primary-sort-key tie cohort
// at the cutoff (K = COALESCE(?postDate, ?date) equal to row 100's K).
// Runs the route's own query (from /debug) with LIMIT/OFFSET removed against the bed.
import { readFile } from 'node:fs/promises'
import prefixes from '../../packages/core/ld/prefixes.js'
const SPARQL = 'http://localhost:7879/query'
const dbg = await (await fetch('http://localhost:5173/get/pages/bookmarked/debug?limit=100')).json()
const full = dbg.query.replace(/LIMIT\s+\d+/i, '').replace(/OFFSET\s+\d+/i, '')
const res = await fetch(SPARQL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' }, body: new URLSearchParams({ query: `${prefixes}\n${full}` }) })
const rows = (await res.json()).results.bindings
const K = (b) => Number(b.postDate?.value ?? b.date?.value)
const kCut = K(rows[99])
const above = rows.filter((b) => K(b) > kCut).length
const atCut = rows.filter((b) => K(b) === kCut).length
console.log(`rows=${rows.length} K_cut=${kCut} (${new Date(kCut).toISOString()}) rowsAbove=${above} cohortRows=${atCut} cohortSpan=[${above}, ${above + atCut})`)
// movers from the captures (renames mapped)
const moves = JSON.parse(await readFile('scripts/migrate-270/out/apply.moves.json', 'utf8'))
const map = new Map(moves.map((m) => [m.from, m.to]))
const load = async (l) => JSON.parse(await readFile(`scripts/equivalence/captures/${l}/pages__bookmarked__rss.json`, 'utf8'))
const url = 'http://localhost:5173/get/pages/bookmarked/rss?limit=100'
const guids = (xml) => new Set([...xml.matchAll(/<guid[^>]*>([^<]*)<\/guid>/g)].map((m) => { const g = m[1].replace(/&amp;/g, '&'); return map.get(g) ?? g }))
const a = guids((await load('before-270')).requests.find((r) => r.url === url).body)
const b = guids((await load('after-270')).requests.find((r) => r.url === url).body)
const movers = [...[...a].filter((g) => !b.has(g)).map((g) => ['left', g]), ...[...b].filter((g) => !a.has(g)).map((g) => ['entered', g])]
const bad = []
for (const [dir, g] of movers) {
  const idx = rows.map((r, i) => [r, i]).filter(([r]) => r.s.value === g || r.o?.value === g)
  const ks = [...new Set(idx.map(([r]) => K(r)))]
  const first = idx[0]?.[1]
  const inCohort = idx.length > 0 && idx.some(([r]) => K(r) === kCut) && !idx.some(([r]) => K(r) > kCut)
  if (!inCohort) bad.push({ dir, g, rowIdx: idx.map(([, i]) => i).slice(0, 5), ks })
  else if (process.argv.includes('-v')) console.log(dir, g, 'firstRow', first)
}
console.log(`movers=${movers.length} (left ${movers.filter((m) => m[0] === 'left').length}, entered ${movers.filter((m) => m[0] === 'entered').length}); not tie-explained: ${bad.length}`)
for (const x of bad) console.log('  NOT TIE:', JSON.stringify(x))
