// pages/bookmarked/rss: per request, items (by guid, renames mapped) that
// left or entered, plus per-item field changes for items in both.
import { readFile } from 'node:fs/promises'
const moves = JSON.parse(await readFile('scripts/migrate-270/out/apply.moves.json', 'utf8'))
const map = new Map(moves.map((m) => [m.from, m.to]))
const route = process.argv[2] || 'pages__bookmarked__rss'
const load = async (l) => JSON.parse(await readFile(`scripts/equivalence/captures/${l}/${route}.json`, 'utf8'))
const items = (xml) => {
  const out = new Map()
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const f = (t) => (m[1].match(new RegExp(`<${t}[^>]*>([^<]*)</${t}>`)) || [])[1]?.replace(/&amp;/g, '&')
    const g = f('guid')
    out.set(map.get(g) ?? g, { title: f('title'), pubDate: f('pubDate') ? Date.parse(f('pubDate')) : null, raw: m[1].trim() })
  }
  return out
}
const A = await load('before-270'), B = await load('after-270')
const rb = new Map(B.requests.map((r) => [r.url, r]))
const report = []
for (const ra of A.requests) {
  const r2 = rb.get(ra.url)
  if (!r2 || ra.hash === r2.hash) continue
  const a = items(ra.body), b = items(r2.body)
  const left = [...a.keys()].filter((g) => !b.has(g))
  const entered = [...b.keys()].filter((g) => !a.has(g))
  const changed = [...a.keys()].filter((g) => b.has(g) && a.get(g).raw.replace(/&amp;/g, '&') !== b.get(g).raw.replace(/&amp;/g, '&'))
  report.push({ url: ra.url, before: a.size, after: b.size, left: left.map((g) => [g, a.get(g).pubDate]), entered: entered.map((g) => [g, b.get(g).pubDate]),
    changed: changed.map((g) => ({ g, a: a.get(g), b: b.get(g) })) })
}
console.log(JSON.stringify(report.map((r) => ({ ...r, changed: r.changed.length, changedSample: r.changed.slice(0, 3).map((c) => ({ g: c.g, a: c.a.raw.slice(0, 300), b: c.b.raw.slice(0, 300) })) })), null, 1))
