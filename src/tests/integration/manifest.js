import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_YAML = join(__dirname, '../../routes/debug/index-check/test-urls.yaml')
const DEMO_HOST = 'nimdaghlian.github.io'

// Recursively collect every string that looks like an http(s) URL.
const collectUrls = (node, out) => {
  if (typeof node === 'string') {
    if (/^https?:\/\//.test(node)) out.push(node)
  } else if (Array.isArray(node)) {
    for (const x of node) collectUrls(x, out)
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectUrls(v, out)
  }
}

// Secondary origins (#334): fixtures on origins other than the primary devdemo
// one, seeded so cross-origin state (endorsed Backlinks #213, webring
// membership) survives a wipe. ORDER IS LOAD-BEARING in two ways:
//  - the array is indexed in order, and urls within an entry too: the webring
//    index page must exist before the member page that links it.
//  - the whole section is indexed AFTER the primary origin. Indexing any
//    devdemo page records `<primary> octo:endorses <neocities>`; neocities'
//    link to devdemo is only written as a Backlink if that triple already
//    exists (checkEndorsement). A pair first written as a plain Link never
//    upgrades (#331), so neocities must be wiped and indexed after devdemo.
// Only the listed pages are indexed; never bulk-index these domains.
export const SECONDARY_ORIGINS = [
  // `expects`: substrings each fixture page's source must contain; preflight
  // aborts if the live markup no longer carries the relationship under test.
  { origin: 'https://demo.ideastore.dev',        urls: ['https://demo.ideastore.dev/demo-webring'],  expects: ['octothorpes.neocities.org'] },
  { origin: 'https://octothorpes.neocities.org', urls: ['https://octothorpes.neocities.org/'],       expects: ['nimdaghlian.github.io/devdemo'] },
]

export const loadManifest = (yamlPath = DEFAULT_YAML) => {
  const doc = yaml.load(readFileSync(yamlPath, 'utf-8'))
  const raw = []
  collectUrls(doc, raw)
  const urls = [...new Set(raw)]
    .filter((u) => {
      try { return new URL(u).host === DEMO_HOST } catch { return false }
    })
    .sort()
  if (urls.length === 0) throw new Error(`No devdemo URLs found in ${yamlPath}`)
  return { urls, origin: new URL(urls[0]).origin, secondaryOrigins: SECONDARY_ORIGINS }
}
