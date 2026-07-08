import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Ajv from 'ajv'

// C1: freeze the OP Client Profile shared contract (#215/#216).
// This test validates the committed repo-root profile.json against
// packages/core/profile.schema.json, so downstream chunks (C2 loader,
// C5-C7 documentRecord projection, C9 subtype paths) build on a fixed shape.

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

const schema = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/core/profile.schema.json'), 'utf8')
)
const profile = JSON.parse(
  readFileSync(resolve(repoRoot, 'profile.json'), 'utf8')
)

// $schema is a local authoring pointer for editors; strip before validating
// against the meta-schema so ajv does not try to resolve it as a $ref target.
const { $schema, ...profileForValidation } = profile

describe('OP Client Profile schema (C1 contract)', () => {
  const ajv = new Ajv({ allErrors: true })
  const validate = ajv.compile(schema)

  it('committed profile.json validates against profile.schema.json', () => {
    const ok = validate(profileForValidation)
    if (!ok) {
      // surface ajv errors on failure for a useful diff
      console.error(validate.errors)
    }
    expect(ok).toBe(true)
  })

  it('relay is loader-resolved (null in the committed file, filled from .env)', () => {
    expect(profile.relay).toBeNull()
  })

  it('declares vocabulary.documentRecord entries with {predicate, namespace, range}', () => {
    expect(Array.isArray(profile.vocabulary.documentRecord)).toBe(true)
    expect(profile.vocabulary.documentRecord.length).toBeGreaterThan(0)
    const ranges = new Set(['literal', 'uri', 'timestamp', 'number', 'boolean'])
    for (const dr of profile.vocabulary.documentRecord) {
      expect(dr).toHaveProperty('predicate')
      expect(dr).toHaveProperty('namespace')
      expect(ranges.has(dr.range)).toBe(true)
    }
  })

  it('declares vocabulary.relationshipSubtypes entries with {type, label, path}', () => {
    expect(Array.isArray(profile.vocabulary.relationshipSubtypes)).toBe(true)
    for (const st of profile.vocabulary.relationshipSubtypes) {
      expect(st).toHaveProperty('type')
      expect(st).toHaveProperty('label')
      expect(st).toHaveProperty('path')
    }
  })

  // No-secrets shape check: the committed profile must never carry a
  // secret-shaped KEY (defense-in-depth; the full point-of-use guard is C2's job).
  it('contains no secret-shaped keys', () => {
    const secretKey = /key|secret|token|password/i
    const offenders = []
    const walk = (node, path = '') => {
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${path}[${i}]`))
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (secretKey.test(k)) offenders.push(`${path}.${k}`)
          walk(v, `${path}.${k}`)
        }
      }
    }
    walk(profileForValidation)
    expect(offenders).toEqual([])
  })
})
