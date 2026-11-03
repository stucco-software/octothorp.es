// Classify phase-0 spelling changes by which canonical() rule fired.
import { readFile } from 'node:fs/promises'
const m = JSON.parse(await readFile(process.argv[2], 'utf8'))
const reasons = (from, to) => {
  const r = []
  let u; try { u = new URL(from) } catch { return ['unparseable'] }
  if (u.hash || from.includes('#')) r.push('fragment')
  if (u.hostname.startsWith('www.')) r.push('www')
  if (/^[a-z]+:\/\/[^/]*[A-Z]/.test(from) || /^[A-Z]/.test(from)) r.push('case')
  if (/^[a-z]+:\/\/[^/]*:(80|443)(\/|$|\?)/.test(from)) r.push('default-port')
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) r.push('trailing-slash')
  if (/\/\.\.?(\/|$)/.test(from.split(/[?#]/)[0].replace(/^[a-z]+:\/\//,''))) r.push('dot-segment')
  const q = from.split('#')[0].split('?').slice(1).join('?')
  if (from.split('#')[0].includes('?')) {
    const pairs = q.split('&')
    if (!q || pairs.some((p) => !p)) r.push('empty-query/pair')
    const nonEmpty = pairs.filter(Boolean)
    if (nonEmpty.join('&') !== [...nonEmpty].sort().join('&')) r.push('param-sort')
  }
  if (!r.length) r.push('other(parser:encoding/idn)')
  return r
}
for (const [label, list] of [['SUBJECT', m.subjChanged], ['OBJECT', m.objChanged]]) {
  const hist = {}; const ex = {}
  for (const x of list) for (const k of reasons(x.from, x.to)) { hist[k] = (hist[k] || 0) + x.nodes; (ex[k] ||= []).push(`${x.from} -> ${x.to}`) }
  console.log(label, list.length, 'keys', list.reduce((a, x) => a + x.nodes, 0), 'closures')
  console.log(hist)
  for (const k of Object.keys(ex)) console.log(' ', k, 'e.g.', ex[k].slice(0, 3))
}
const distinctObj = new Set(m.objChanged.map((x) => x.from))
console.log('distinct object URLs changing:', distinctObj.size, ' distinct canonical targets:', new Set(m.objChanged.map((x) => x.to)).size)
console.log('distinct subject URLs changing:', new Set(m.subjChanged.map((x) => x.from)).size)
