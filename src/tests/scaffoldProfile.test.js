import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { scaffoldProfile } from '../../packages/core/scaffold.js'
import { createProfile } from '../../packages/core/profile.js'
import schema from '../../packages/core/profile.schema.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const binPath = path.resolve(__dirname, '../../packages/core/bin/octothorpes.js')

describe('scaffoldProfile', () => {
  it('emits all seven identity keys with sensible stubs on an instance-only call', () => {
    const profile = scaffoldProfile({ instance: 'https://example.test/' })
    expect(Object.keys(profile.identity).sort()).toEqual(
      ['contact', 'description', 'feeds', 'images', 'instance', 'name', 'terms'].sort()
    )
    expect(profile.identity.instance).toBe('https://example.test/')
    expect(profile.identity.name).toBe('')
    expect(profile.identity.description).toBe('')
    expect(profile.identity.feeds).toEqual({})
    expect(profile.identity.images).toEqual({})
    expect(profile.identity.contact).toEqual({})
    expect(profile.identity.terms).toBe('https://example.test/~/')
  })

  it('round-trips through createProfile without throwing', () => {
    const profile = scaffoldProfile({ instance: 'https://example.test/' })
    expect(() => createProfile({ profile, schema, warn: () => {} })).not.toThrow()
  })

  it('emits blocks/whitelist stubs in the correct shape', () => {
    const profile = scaffoldProfile({ instance: 'https://example.test/' })
    expect(profile.policies.access.blocks).toEqual({ domains: [], terms: [] })
    expect(profile.policies.access.whitelist).toEqual({ domains: [] })
  })

  it('does not leak defaults for unspecified sections', () => {
    const profile = scaffoldProfile({ instance: 'https://example.test/' })
    expect(profile.policies.commercial).toBeUndefined()
    expect(profile.policies.labels).toBeUndefined()
    expect(profile.api).toBeUndefined()
    expect(profile.vocabulary).toBeUndefined()
    expect(profile.federation).toBeUndefined()
  })

  it('only sets registration/indexing when supplied, on the right paths', () => {
    const bare = scaffoldProfile({ instance: 'https://example.test/' })
    expect(bare.policies.access.registration).toBeUndefined()
    expect(bare.policies.indexing).toBeUndefined()

    const withBoth = scaffoldProfile({
      instance: 'https://example.test/',
      registration: 'closed',
      indexing: 'active',
    })
    expect(withBoth.policies.access.registration).toBe('closed')
    expect(withBoth.policies.indexing.mode).toBe('active')
  })

  it('emits all three dir pointers under api joined with the kind name, and omits api otherwise', () => {
    const withDirs = scaffoldProfile({ instance: 'https://example.test/', dirs: './static' })
    expect(withDirs.api.publishers.dir).toBe('./static/publishers')
    expect(withDirs.api.handlers.dir).toBe('./static/handlers')
    expect(withDirs.api.harmonizers.dir).toBe('./static/harmonizers')

    const without = scaffoldProfile({ instance: 'https://example.test/' })
    expect(without.api).toBeUndefined()
  })

  it('handles a dirs base with a trailing slash', () => {
    const withDirs = scaffoldProfile({ instance: 'https://example.test/', dirs: './static/' })
    expect(withDirs.api.publishers.dir).toBe('./static/publishers')
    expect(withDirs.api.handlers.dir).toBe('./static/handlers')
    expect(withDirs.api.harmonizers.dir).toBe('./static/harmonizers')
  })

  it('lets an explicit terms win over the derived one', () => {
    const profile = scaffoldProfile({
      instance: 'https://example.test/',
      terms: 'https://example.test/vocab/',
    })
    expect(profile.identity.terms).toBe('https://example.test/vocab/')
  })

  it('derives terms sensibly when instance has no trailing slash', () => {
    const profile = scaffoldProfile({ instance: 'https://example.test' })
    expect(profile.identity.terms).toBe('https://example.test/~/')
  })
})

describe('octothorpes new (bin)', () => {
  it('prints a valid scaffolded profile with $schema to stdout', () => {
    const result = spawnSync('node', [binPath, 'new', '--instance=https://example.test/', '--stdout'])
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout.toString())
    expect(parsed.$schema).toBeDefined()
    expect(parsed.identity.instance).toBe('https://example.test/')
    expect(parsed.identity.terms).toBe('https://example.test/~/')
  })

  it('warns on stderr for an incoherent closed-registration scaffold', () => {
    const result = spawnSync('node', [
      binPath,
      'new',
      '--instance=https://example.test/',
      '--registration=closed',
      '--stdout',
    ])
    expect(result.status).toBe(0)
    expect(result.stderr.toString()).toMatch(/whitelist/i)
  })
})
