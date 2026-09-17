import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

// packages/core is published standalone, but it is developed inside a monorepo
// whose ROOT package.json also has node_modules. A bare import that core forgets
// to declare therefore resolves fine here and in the SvelteKit app, and only
// fails for someone doing a fresh `npm install octothorpes`.
//
// That is exactly how fast-xml-parser shipped undeclared in 0.4.0: handlers/xml
// imported it, only the root declared it, every test passed, and the published
// package crashed on first import. This suite is the guard.

const here = dirname(fileURLToPath(import.meta.url))
const coreDir = resolve(here, '../../packages/core')
const corePkg = JSON.parse(readFileSync(join(coreDir, 'package.json'), 'utf8'))

const walk = (dir) => {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.js')) out.push(full)
  }
  return out
}

// Statement-anchored on purpose: a loose /from\s*['"]/ also matches string
// literals mid-expression (`if ('from' in def)` in publish.js is a real
// example), which produces garbage "package names".
const SPECIFIER_PATTERNS = [
  /^\s*import\s+[^'"]*?from\s*['"]([^'"]+)['"]/gm, // import x from 'pkg'
  /^\s*import\s*['"]([^'"]+)['"]/gm, // import 'pkg'  (side effect)
  /^\s*export\s+[^'"]*?from\s*['"]([^'"]+)['"]/gm, // export … from 'pkg'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // await import('pkg') — may be nested
]

/** 'lodash/fp' -> 'lodash'; '@scope/pkg/sub' -> '@scope/pkg' */
const packageNameOf = (specifier) => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const isBare = (specifier) =>
  !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:')

describe('packages/core declares every package it imports', () => {
  const declared = new Set([
    ...Object.keys(corePkg.dependencies ?? {}),
    ...Object.keys(corePkg.peerDependencies ?? {}),
  ])

  const imported = new Map() // package name -> first file that imports it
  for (const file of walk(coreDir)) {
    const source = readFileSync(file, 'utf8')
    for (const pattern of SPECIFIER_PATTERNS) {
      for (const [, specifier] of source.matchAll(pattern)) {
        if (!isBare(specifier)) continue
        const name = packageNameOf(specifier)
        if (!imported.has(name)) imported.set(name, file.slice(coreDir.length + 1))
      }
    }
  }

  it('imports at least the known runtime packages (the scan actually works)', () => {
    // A guard on the guard: if the regex silently stops matching, the real
    // assertion below would pass vacuously.
    expect(imported.has('ajv')).toBe(true)
    expect(imported.size).toBeGreaterThan(2)
  })

  it('declares every bare specifier it imports', () => {
    const undeclared = [...imported.entries()]
      .filter(([name]) => !declared.has(name))
      .map(([name, file]) => `${name} (imported by ${file})`)
    expect(undeclared).toEqual([])
  })

})
