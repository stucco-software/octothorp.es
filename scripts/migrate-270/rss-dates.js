// Per RSS item (by guid): compare pubDate before vs after.
import { readFile, readdir } from 'node:fs/promises'
const moves = JSON.parse(await readFile(process.argv[2], 'utf8'))
const map = new Map(moves.map((m) => [m.from, m.to]))
const items = (xml) => {
  const out = new Map()
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const g = (m[1].match(/<guid[^>]*>([^<]*)<\/guid>/) || [])[1]?.replace(/&amp;/g, '&')
    const d = (m[1].match(/<pubDate>([^<]*)<\/pubDate>/) || [])[1]
    if (g) out.set(map.get(g) ?? g, d ? Date.parse(d) : null)
  }
  return out
}
const files = (await readdir('scripts/equivalence/captures/after-270')).filter((f) => f.includes('rss'))
const tally = { later: 0, earlier: 0, same: 0, lost: 0, gained: 0 }
const earlier = []
for (const f of files) {
  const A = JSON.parse(await readFile(`scripts/equivalence/captures/before-270/${f}`, 'utf8'))
  const B = JSON.parse(await readFile(`scripts/equivalence/captures/after-270/${f}`, 'utf8'))
  const rb = new Map(B.requests.map((r) => [r.url, r]))
  for (const ra of A.requests) {
    const r2 = rb.get(ra.url)
    if (!r2 || typeof ra.body !== 'string') continue
    const a = items(ra.body), b = items(r2.body)
    for (const [g, d] of a) {
      if (!b.has(g)) { tally.lost++; continue }
      const e = b.get(g)
      if (e === d) tally.same++
      else if (e > d) tally.later++
      else { tally.earlier++; earlier.push(`${f} ${g} ${new Date(d).toISOString()} -> ${new Date(e).toISOString()} @ ${ra.url}`) }
    }
    for (const g of b.keys()) if (!a.has(g)) tally.gained++
  }
}
console.log(tally)
earlier.forEach((x) => console.log(' earlier:', x))
