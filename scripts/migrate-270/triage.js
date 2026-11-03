// Full-fidelity triage of before-270 -> after-270: recomputes the diff.js
// structural diff without truncation, then buckets every un-allowlisted diff.
//   node scripts/migrate-270/triage.js <moves.json> [A] [B]
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const [movesFile, A = 'before-270', B = 'after-270'] = process.argv.slice(2)
const CAP = 'scripts/equivalence/captures'
const load = async (l, f) => JSON.parse(await readFile(join(CAP, l, f), 'utf8'))
const moves = JSON.parse(await readFile(movesFile, 'utf8'))
const names = [...new Set(moves.flatMap((m) => [m.from, m.to]))].sort((a, b) => b.length - a.length)
const allow = JSON.parse(await readFile('scripts/equivalence/allowlist.json', 'utf8')).patterns
  .map((p) => ({ ...p, u: p.url ? new RegExp(p.url) : null, p: p.path ? new RegExp(p.path) : null }))
const isAllowed = (url, path) => allow.find((p) => (!p.u || p.u.test(url)) && (!p.p || p.p.test(path)))
const ID_KEYS = ['@id', 'uri', 'term', 'url', 'id']
const idOf = (x) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  for (const k of ID_KEYS) if (typeof x[k] === 'string') return `${k}=${x[k]}${x.role ? `|role=${x.role}` : ''}${x.type ? `|type=${x.type}` : ''}`
  return null
}
function diff(a, b, path, out) {
  if (JSON.stringify(a) === JSON.stringify(b)) return
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.concat(b).every((x) => idOf(x) !== null)) {
      const ma = new Map(a.map((x) => [idOf(x), x])), mb = new Map(b.map((x) => [idOf(x), x]))
      for (const [k, x] of ma) if (!mb.has(k)) out.push({ path: `${path}[${k}]`, op: '-', v: x })
      for (const [k, x] of mb) if (!ma.has(k)) out.push({ path: `${path}[${k}]`, op: '+', v: x })
      for (const [k, x] of ma) if (mb.has(k)) diff(x, mb.get(k), `${path}[${k}]`, out)
      return
    }
    const cnt = (arr) => arr.map((x) => JSON.stringify(x)).reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map())
    const na = cnt(a), nb = cnt(b)
    for (const [s, n] of na) for (let i = 0; i < n - (nb.get(s) || 0); i++) out.push({ path: `${path}[]`, op: '-', v: JSON.parse(s) })
    for (const [s, n] of nb) for (let i = 0; i < n - (na.get(s) || 0); i++) out.push({ path: `${path}[]`, op: '+', v: JSON.parse(s) })
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in b)) out.push({ path: `${path}.${k}`, op: '-', v: a[k] })
      else if (!(k in a)) out.push({ path: `${path}.${k}`, op: '+', v: b[k] })
      else diff(a[k], b[k], `${path}.${k}`, out)
    }
    return
  }
  if (typeof a === 'string' && typeof b === 'string' && a.includes('\n')) return diff(a.split('\n'), b.split('\n'), `${path}<lines>`, out)
  out.push({ path, op: '~', v: a, w: b })
}
const ma = await load(A, 'manifest.json'), mb = await load(B, 'manifest.json')
const ib = new Map(mb.map((m) => [m.url, m]))
const all = []
const byRoute = new Map()
for (const a of ma) {
  const b = ib.get(a.url)
  if (!b || a.hash === b.hash) continue
  if (!byRoute.has(a.route)) byRoute.set(a.route, [])
  byRoute.get(a.route).push(a.url)
}
for (const [route, urls] of byRoute) {
  const fa = await load(A, `${route}.json`), fb = await load(B, `${route}.json`)
  const ra = new Map(fa.requests.map((r) => [r.url, r])), rb = new Map(fb.requests.map((r) => [r.url, r]))
  for (const url of urls) {
    const out = []
    diff(ra.get(url).body, rb.get(url).body, '$', out)
    for (const d of out) all.push({ route, url, ...d, allowed: !!isAllowed(url, d.path) })
  }
}
const decodeEnt = (s) => s.replace(/&amp;/g, '&')
const moveOf = (d) => {
  const hay = decodeEnt(d.path + ' ' + JSON.stringify(d.v ?? '') + ' ' + JSON.stringify(d.w ?? '')).replace(/\\\//g, '/')
  return names.find((n) => hay.includes(n)) || null
}
for (const d of all) {
  if (d.allowed) d.cat = 'allowlisted'
  else if (moveOf(d)) { d.cat = 'spelling-move'; d.move = moveOf(d) }
  else if (/<pubDate>/.test(JSON.stringify(d.v))) d.cat = 'rss-pubDate'
  else if (/\.date$/.test(d.path) || /^\$\.results\[[^\]]+\]\.date$/.test(d.path)) d.cat = 'date-field'
  else d.cat = 'other'
}
const summary = {}
for (const d of all) {
  summary[d.cat] ||= { total: 0, routes: {} }
  summary[d.cat].total++
  summary[d.cat].routes[d.route] = (summary[d.cat].routes[d.route] || 0) + 1
}
console.log(JSON.stringify(summary, null, 2))
await writeFile('scripts/migrate-270/out/triage.json', JSON.stringify(all, null, 1))
