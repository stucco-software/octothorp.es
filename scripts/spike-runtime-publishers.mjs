#!/usr/bin/env node
/**
 * Verifies (#217 wave 3) that site publishers are framework-agnostic runtime
 * modules: a plain folder of ESM that core walks with real fs, with zero Vite
 * involvement. Loads every publisher in `dir`, prints its resolver metadata,
 * calls render() on a fake item, and reports what discovery skipped.
 *
 *   node scripts/spike-runtime-publishers.mjs [dir]
 *
 * Default dir: static/publishers (the authored path). Run it against
 * build/client/publishers after `npm run build` to prove the BUILT tree — the
 * thing the production image ships — is self-sufficient.
 */
import { readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverPublishers } from '../packages/core/client.js'

const dir = process.argv[2] ?? 'static/publishers'
const absDir = resolve(process.cwd(), dir)

console.log(`\n=== runtime publisher discovery ===`)
console.log(`dir (declared): ${dir}`)
console.log(`dir (resolved): ${absDir}\n`)

const listEntries = async (d) => {
  const entries = await readdir(resolve(process.cwd(), d), { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

const loadPublisher = async (d, name) => {
  const rendererPath = join(resolve(process.cwd(), d), name, 'renderer.js')
  await stat(rendererPath) // clearer error than a bare ERR_MODULE_NOT_FOUND
  const mod = await import(pathToFileURL(rendererPath).href)
  return mod.default
}

const { publishers, skipped } = await discoverPublishers({
  dir,
  listEntries,
  loadPublisher,
  warn: (m) => console.warn(`  ! ${m}`),
})

const names = Object.keys(publishers)
console.log(`discovered: ${names.length ? names.join(', ') : '(none)'}\n`)

const FAKE_ITEMS = [
  {
    url: 'https://example.com/post',
    '@id': 'https://example.com/post',
    title: 'A fake item',
    description: 'payload for the spike',
    createdAt: '2026-09-01T00:00:00Z',
  },
]

for (const [name, p] of Object.entries(publishers)) {
  console.log(`--- ${name} ---`)
  console.log(`  id:          ${p.id}`)
  console.log(`  contentType: ${p.contentType}`)
  console.log(`  meta:        ${JSON.stringify(p.meta)}`)
  console.log(`  schema keys: ${Object.keys(p.schema ?? {}).join(', ')}`)
  if (typeof p.render === 'function') {
    try {
      const out = await p.render(FAKE_ITEMS)
      console.log(`  render():    ${JSON.stringify(out)}`)
    } catch (e) {
      // A render error is fine — LOADING is what this spike proves.
      console.log(`  render() threw (ok for this spike): ${e.message}`)
    }
  } else {
    console.log(`  render():    (no render function)`)
  }
  console.log()
}

console.log(`skipped: ${skipped.length ? JSON.stringify(skipped) : '(none)'}`)
console.log(`\n=== done ===\n`)
