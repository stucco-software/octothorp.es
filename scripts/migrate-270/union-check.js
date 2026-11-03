// For paginated unfiltered routes: compare the UNION of (role, uri) across all
// pages, before vs after, with moved spellings mapped to canonical.
import { readFile, readdir } from 'node:fs/promises'
const moves = JSON.parse(await readFile(process.argv[2], 'utf8'))
const map = new Map(moves.map((m) => [m.from, m.to]))
const norm = (u) => map.get(u) ?? u
const load = async (l, f) => JSON.parse(await readFile(`scripts/equivalence/captures/${l}/${f}`, 'utf8'))
const files = (await readdir('scripts/equivalence/captures/after-270')).filter((f) => f.includes('__') && !f.includes('rss'))
for (const f of files.sort()) {
  const sets = {}
  for (const l of ['before-270', 'after-270']) {
    const j = await load(l, f)
    const s = new Set()
    for (const r of j.requests.filter((r) => /[?&]offset=/.test(r.url) && !/[?&][so]=/.test(r.url))) {
      for (const x of r.body?.results || []) s.add(`${x.role || ''}|${norm(x.uri || x['@id'] || x.term || '')}`)
    }
    sets[l] = s
  }
  const lost = [...sets['before-270']].filter((x) => !sets['after-270'].has(x))
  const gained = [...sets['after-270']].filter((x) => !sets['before-270'].has(x))
  if (lost.length || gained.length) console.log(f, `before=${sets['before-270'].size} after=${sets['after-270'].size} lost=${lost.length} gained=${gained.length}`, lost.slice(0, 5), gained.slice(0, 5))
}
