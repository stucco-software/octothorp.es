#!/usr/bin/env node
//
// One retraction sweep for data the code fixes stopped writing but never
// retracted (#364). Rulesets (see scripts/cleanup-sweep/rulesets.js):
//
//   url-terms       #361  Term nodes minted as page IRIs (`<instance>~/https://...`)
//   malformed-iris  #358  IRIs holding a character canonical() now refuses
//   flydev-iris     #356  `octothorpes.fly.dev` IRIs (relative hrefs resolved by the store)
//   origins         #277/#305  non-canonical/www octo:Origin spellings (calls
//                   scripts/canonicalize-origins.js; rewrites rather than retracts)
//   stale-thorpes   #322  pages not re-indexed since the reconcile shipped: fetch,
//                   harvest, diff against the store, retract what the page dropped.
//                   FETCHES EVERY CANDIDATE PAGE, so it only runs when named
//                   (or with --class all).
//
// Dry run by default; --write applies. Idempotent: a second run reports 0.
// Counts per class are printed before and after, so "nothing matched" reads
// differently from "the query is wrong" (pattern rulesets also re-check every
// matched node in JS and refuse to write on a disagreement).
//
// The store comes from the environment (.env: sparql_endpoint, sparql_user,
// sparql_password, instance) or flags. No endpoint is built in. Basic auth:
// sparql_user + sparql_password, or CLEANUP_AUTH=user:pass, or --auth user:pass.
//
//   node scripts/cleanup-sweep.js                          # dry run, store-only classes
//   node scripts/cleanup-sweep.js --class url-terms,flydev-iris
//   node scripts/cleanup-sweep.js --class stale-thorpes --stale-before 2026-11-04 --limit 50
//   node scripts/cleanup-sweep.js --class all --write
//
// Flags:
//   --class a,b      ruleset ids, or `all` (default: every class except stale-thorpes)
//   --write          apply (default: dry run)
//   --endpoint URL   SPARQL base URL (/query and /update appended); overrides sparql_endpoint
//   --auth u:p       basic auth; overrides CLEANUP_AUTH and sparql_user/sparql_password
//   --instance URL   instance the term IRIs were minted under (stale-thorpes); overrides instance
//   --stale-before D only pages last indexed before D (ISO date or ms epoch)
//   --limit N        at most N stale-thorpes candidate pages
//   --harmonizer H   harmonizer for stale-thorpes harvests (default: default)
//   --dead-mode M    soft|hard for pages answering 404/410 (default: soft)
//
// Operator note (#364): never run against a remote store automatically. Local
// first, then next, then prod, each as a deliberate action.
//
import 'dotenv/config'
import { createSparqlClient, createDeleter, createClient } from 'octothorpes'
import { selectRulesets, parseCutoff, RUNNERS } from './cleanup-sweep/rulesets.js'

const argv = process.argv.slice(2)
const flag = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`)
  if (i !== -1 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) return argv[i + 1]
  const eq = argv.find((a) => a.startsWith(`--${name}=`))
  return eq ? eq.slice(name.length + 3) : fallback
}

const WRITE = argv.includes('--write')
const endpoint = (flag('endpoint') || process.env.sparql_endpoint || '').replace(/\/$/, '')
if (!endpoint) {
  console.error('ABORT: no SPARQL endpoint. Set sparql_endpoint in .env or pass --endpoint.')
  process.exit(1)
}
const auth = flag('auth') || process.env.CLEANUP_AUTH ||
  (process.env.sparql_user && process.env.sparql_password ? `${process.env.sparql_user}:${process.env.sparql_password}` : '')
const sep = auth.indexOf(':')
const user = auth ? auth.slice(0, sep) : undefined
const password = auth ? auth.slice(sep + 1) : undefined
const instance = flag('instance') || process.env.instance || ''

let rulesets, options
try {
  rulesets = selectRulesets(flag('class'))
  const deadMode = flag('dead-mode', 'soft')
  if (deadMode !== 'soft' && deadMode !== 'hard') throw new Error(`--dead-mode must be soft or hard, got ${deadMode}`)
  options = {
    cutoff: parseCutoff(flag('stale-before')),
    limit: flag('limit') ? Number(flag('limit')) : null,
    harmonizer: flag('harmonizer', 'default'),
    deadMode,
  }
} catch (e) {
  console.error(`ABORT: ${e.message}`)
  process.exit(1)
}

const sparql = createSparqlClient({ endpoint, user, password })
const deleter = createDeleter({ query: sparql.query, queryArray: sparql.queryArray, queryBoolean: sparql.queryBoolean, instance })
// Harvest-only use: client.harmonize never touches the store. Built lazily so
// store-only classes never construct a client.
let client
const harmonize = (content, name, opts) =>
  (client ??= createClient({ instance, sparql: { endpoint, user, password } })).harmonize(content, name, opts)

console.log(`endpoint: ${endpoint}${user ? ` (basic auth as ${user})` : ''}`)
console.log(`instance: ${instance || '(unset)'}`)
console.log(WRITE ? 'mode: WRITE (changes will be applied)' : 'mode: dry run (no changes)')
console.log(`classes: ${rulesets.map((r) => r.id).join(', ')}`)

if (rulesets.some((r) => r.kind === 'stale') && !instance) {
  console.error('ABORT: stale-thorpes needs the instance its term IRIs were minted under (instance in .env or --instance).')
  process.exit(1)
}

const log = (s) => console.log(s)
const summary = []
for (const rs of rulesets) {
  console.log(`\n== ${rs.id} (#${rs.issue}): ${rs.title}`)
  try {
    const result = await RUNNERS[rs.kind](rs, { sparql, write: WRITE, log, instance, deleter, harmonize, options })
    summary.push({ id: rs.id, ...result })
  } catch (e) {
    console.error(`  FAILED: ${e.message}`)
    summary.push({ id: rs.id, before: null, after: null, error: e.message })
  }
}

console.log('\n== summary (before = statements/items to retract; after = re-counted post-write)')
for (const r of summary) {
  const before = r.error ? 'ERROR' : r.before === null ? 'n/a' : r.before
  const after = r.error || r.before === null ? ''
    : r.details?.disagree ? 'NOT WRITTEN (SPARQL/JS pattern disagreement)'
    : r.after === null ? (WRITE ? '0 (nothing to do)' : '(dry run)') : r.after
  console.log(`  ${r.id.padEnd(15)} before: ${String(before).padEnd(8)} after: ${after}`)
}
if (!WRITE) console.log('\nDry run only. Re-run with --write to apply.')
if (summary.some((r) => r.error)) process.exit(1)
