// Writes scripts/equivalence/allowlist.json for the #270 before/after diff:
//   - date intended diffs (blobject + pages-mode max-date, RSS pubDate lines)
//   - exact per-URL entries for each node spelling move the migration made,
//     in path, request-URL and value positions (see diff.js header for the
//     shallow value text the `value` regex sees).
// Also removes blobject-date-tiebreak from known-nondeterminism.json.
//   node scripts/migrate-270/allowlist-gen.js <moves.json>
import { readFile, writeFile } from 'node:fs/promises'

const [movesFile] = process.argv.slice(2)
const moves = JSON.parse(await readFile(movesFile, 'utf8'))
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const xml = (s) => s.replace(/&/g, '&amp;')

const BLOBJECT_WHATS = 'everything|blobjects|whatever'
const PAGES_WHATS = 'pages|links|mentions|backlinks|citations|bookmarks'
const DATE_PATH = '^\\$\\.results\\[[^\\]]+\\]\\.date$'

const patterns = [
  {
    id: 'blobject-date-tiebreak',
    url: `/get/(${BLOBJECT_WHATS})/`,
    path: DATE_PATH,
    reason: 'INTENDED (#270): blobject date is now the deterministic MAX of the page\'s ?date candidates (getBlobjectFromResponse). The baseline holds an arbitrary tied first-row value, so blobject .date may differ once, stably. Was known-nondeterminism: ORDER BY DESC(COALESCE(?postDate, ?date)) ties when postDate is present.',
  },
  {
    id: 'pages-date-tiebreak',
    url: `/get/(${PAGES_WHATS})/`,
    path: DATE_PATH,
    reason: 'INTENDED (#270 read-path ruling): pages-mode (parseBindings links mode) subject date gets the same max-date + stable ORDER BY treatment as blobjects. Baseline held the arbitrary first-row ?date of a tie.',
  },
  {
    id: 'rss-pubdate-maxdate',
    url: `/get/(${BLOBJECT_WHATS}|${PAGES_WHATS})/[^/?]+/rss`,
    path: '^\\$<lines>\\[\\]$',
    value: '^\\s*<pubDate>[^<]*</pubDate>$',
    reason: 'INTENDED (#270): the same max-date change surfacing as RSS item <pubDate> lines. Matches pubDate lines only; title/link/guid lines of an added or removed item are still reported.',
  },
  {
    id: 'blobject-relationterm-false-positive',
    url: '/get/(everything|blobjects|whatever)/in-webring\\?',
    path: '^\\$\\.results\\[@id=https://octothorpes\\.bearblog\\.dev/how-to-hashtag-your-bear-blog\\]\\.octothorpes\\[\\]$',
    value: '^\\{("terms":\\["demo"\\],)?"type":"Link","uri":"https://bearblog\\.octothorp\\.es/~/demo"\\}$',
    reason: 'INTENDED BUG FIX (#270, ruled 2026-10-30): the old blank-node read path treated any ?blankNodeObj containing /~/ as a relationship term, including the closure\'s own octo:url target, so a Link TO the term IRI bearblog.octothorp.es/~/demo reported terms:["demo"]. The source closure had no terms; the predicate-based reifier read drops the false term.',
  },
  {
    id: 'pages-bookmarked-rss-window-ties',
    url: '/get/pages/bookmarked/rss\\?limit=100$',
    path: '^\\$<lines>\\[\\]$',
    reason: 'INTENDED (#270, ruled conditionally 2026-10-30, proof passed): the single 100-row window\'s membership changed only by tie reordering. scripts/migrate-270/tie-proof.js runs the route query unbounded on the bed: K = COALESCE(?postDate, ?date) at row 100 is 1688040000000, 35 rows sit above it and a 299-row tie cohort spans the cutoff; all 98 movers (49 left, 49 entered) have every row in that cohort and none above it. The old ORDER BY left the cohort in arbitrary order; the new one adds DESC(?date) ?s ?o.',
  },
]

for (const { from, to } of moves) {
  const names = `(${[from, to].map(esc).join('|')})`
  const xmlNames = `(${[from, to].map((n) => esc(xml(n))).join('|')})`
  patterns.push({
    id: `270-spelling-path:${from}`,
    path: `=${names}(\\||\\])`,
    reason: `#270 node spelling move ${from} -> ${to}: diff path keyed on either spelling`,
  })
  patterns.push({
    id: `270-spelling-req:${from}`,
    url: `[?&][so]=${esc(encodeURIComponent(from))}(&|$)`,
    reason: `#270 node spelling move ${from} -> ${to}: request filters on the old spelling`,
  })
  patterns.push({
    id: `270-spelling-value:${from}`,
    value: [
      `"(uri|@id|url)":"${names}"[,}]`, // added/removed object identified by the URL
      `^${names}$`, // bare string element
      `>${xmlNames}</`, // RSS <title>/<link>/<guid> line
      `^"${names}" -> |-> "${names}"$`, // changed scalar
    ].join('|'),
    reason: `#270 node spelling move ${from} -> ${to}: value identified by either spelling (unkeyed arrays, RSS lines, scalars)`,
  })
}

await writeFile('scripts/equivalence/allowlist.json', JSON.stringify({ patterns }, null, 2) + '\n')
const ndPath = 'scripts/equivalence/known-nondeterminism.json'
const nd = JSON.parse(await readFile(ndPath, 'utf8'))
nd.patterns = nd.patterns.filter((p) => p.id !== 'blobject-date-tiebreak')
await writeFile(ndPath, JSON.stringify(nd, null, 2) + '\n')
console.log(`allowlist: ${patterns.length} patterns (${moves.length} moves x 3 + 5 static); known-nondeterminism: ${nd.patterns.length}`)
