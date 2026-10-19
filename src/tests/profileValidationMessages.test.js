import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createProfile } from 'octothorpes'

// #287: profile schema failures speak to the author, not in raw ajv output.
// Each hard-failure message names the offending value, the permitted values,
// and (for the hand-written fields) a one-line why — the same standard the
// coherence warnings in profile.js already meet.

const here = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(
  readFileSync(resolve(here, '../../packages/core/profile.schema.json'), 'utf8')
)

const env = { instance: 'https://x.test/' }
const load = (profile) => createProfile({ profile, schema, env }).getProfile()
const errorOf = (profile) => {
  try {
    load(profile)
  } catch (e) {
    return e.message
  }
  throw new Error('expected profile to fail validation')
}

describe('#287 hand-written schema error messages', () => {
  it('registration: names the bad value, the allowed set, and the why', () => {
    const msg = errorOf({ policies: { access: { registration: 'invite' } } })
    expect(msg).toMatch(/schema validation/)
    expect(msg).toContain('policies.access.registration')
    expect(msg).toContain('"invite"')
    expect(msg).toContain('"registered"')
    expect(msg).toContain('"open"')
    expect(msg).toContain('"closed"')
    // the why: invite was dropped because closed + whitelist IS invite-only
    expect(msg).toMatch(/invite-only/)
  })

  it('indexing mode: names value and allowed set, and points at the other axis', () => {
    const msg = errorOf({ policies: { indexing: { mode: 'on-request' } } })
    expect(msg).toContain('policies.indexing.mode')
    expect(msg).toContain('"on-request"')
    expect(msg).toContain('"request"')
    expect(msg).toContain('"active"')
    expect(msg).toContain('registration')
  })

  it('identity.terms: explains the Term-prefix convention, never ToS', () => {
    const msg = errorOf({ identity: { terms: 'not a uri reference' } })
    expect(msg).toContain('identity.terms')
    expect(msg).toContain('"not a uri reference"')
    expect(msg).toMatch(/prefix/)
    expect(msg).toContain('identity.rules')
  })

  it('generic enum fields surface value, allowed set and schema description', () => {
    const msg = errorOf({ api: { documentRecord: [{ predicate: 'x', range: 'blob' }] } })
    expect(msg).toContain('"blob"')
    expect(msg).toContain('"literal"')
    expect(msg).toContain('"timestamp"')
  })

  it('required blocks name the missing property and its description', () => {
    const msg = errorOf({ policies: { labels: [{ id: 'nsfw' }] } })
    expect(msg).toMatch(/schema validation/)
    expect(msg).toContain('policies.labels[0]')
    expect(msg).toContain('"name"')
    const msg2 = errorOf({ vocabulary: { namespaces: [{ prefix: 'skos' }] } })
    expect(msg2).toContain('"iri"')
  })

  it('unknown keys are named, with their location', () => {
    const msg = errorOf({ nonsense: true })
    expect(msg).toContain('"nonsense"')
  })

  it('array-or-path slots get one message, not a branch dump', () => {
    const msg = errorOf({ policies: { access: { blocks: { domains: [1] } } } })
    expect(msg).toContain('policies.access.blocks.domains')
    // one problem reported for the slot, not three oneOf branch errors
    expect(msg.split(';').length).toBe(1)
  })

  it('fields without special handling still fall back to ajv text', () => {
    const msg = errorOf({ policies: { commercial: 'yes' } })
    expect(msg).toContain('policies.commercial')
    expect(msg).toMatch(/boolean/)
  })
})
