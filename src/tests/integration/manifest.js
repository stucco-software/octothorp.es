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
  return { urls, origin: new URL(urls[0]).origin }
}
