import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  createHarmonizerRegistry,
  createDefaultHandlerRegistry,
  harmonizeSource,
  interpolateInstance,
  BUILTIN_HARMONIZERS,
  validateHarmonizer,
  resolveProfile,
} from 'octothorpes'
// Captured from the pre-#296 inline-object registry (commit d743d0f) with
// instance 'https://op.test/'. The flat-file builtins must reproduce it.
import legacyRegistry from './fixtures/builtin-harmonizers.op-test.json' with { type: 'json' }
import legacyExtraction from './fixtures/builtin-harmonizers-extraction.op-test.json' with { type: 'json' }
import profile from '../../octothorpes.json' with { type: 'json' }

const INSTANCE = 'https://op.test/'
const builtinsDir = fileURLToPath(new URL('../../packages/core/harmonizers', import.meta.url))

describe('#296 builtin harmonizers as flat JSON files', () => {
  it('ships one JSON file per legacy builtin, keyed by basename', () => {
    const files = readdirSync(builtinsDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    expect(files.sort()).toEqual(Object.keys(legacyRegistry).sort())
    expect(Object.keys(BUILTIN_HARMONIZERS).sort()).toEqual(Object.keys(legacyRegistry).sort())
  })

  it('every builtin file validates against harmonizer.schema.json', () => {
    for (const file of readdirSync(builtinsDir).filter((f) => f.endsWith('.json'))) {
      const definition = JSON.parse(readFileSync(path.join(builtinsDir, file), 'utf8'))
      expect(validateHarmonizer(definition), `${file}: ${validateHarmonizer(definition).join('; ')}`).toEqual([])
    }
  })

  it('registry parity: flat files + {{instance}} reproduce the legacy inline objects', () => {
    const registered = createHarmonizerRegistry(INSTANCE).list()
    for (const [name, legacy] of Object.entries(legacyRegistry)) {
      // The schema requires schema.subject; builtins that had none now carry an
      // EMPTY subject, which the handlers treat identically (extraction parity
      // is pinned separately below).
      const expected = { ...legacy, schema: { subject: {}, ...legacy.schema } }
      expect(registered[name], name).toEqual(expected)
    }
  })

  it('extraction parity: harmonize output matches pre-#296 captures', async () => {
    const html = readFileSync(fileURLToPath(new URL('./fixtures/builtin-harmonizers-sample.html', import.meta.url)), 'utf8')
    const registry = createHarmonizerRegistry(INSTANCE)
    const handlerRegistry = createDefaultHandlerRegistry({})
    for (const [name, expected] of Object.entries(legacyExtraction)) {
      const out = await harmonizeSource(html, name, {
        handlerRegistry,
        getHarmonizer: registry.getHarmonizer,
        instance: INSTANCE,
      })
      expect(out, name).toEqual(expected)
    }
  })
})

describe('#296 {{instance}} interpolation', () => {
  it('replaces the token in nested strings, arrays, and keys stay untouched', () => {
    const def = {
      id: '{{instance}}harmonizer/x',
      schema: { subject: { rules: [{ selector: "a[href*='{{instance}}~/']" }] } },
      n: 7,
    }
    expect(interpolateInstance(def, 'https://op.test/')).toEqual({
      id: 'https://op.test/harmonizer/x',
      schema: { subject: { rules: [{ selector: "a[href*='https://op.test/~/']" }] } },
      n: 7,
    })
  })

  it('register() resolves {{instance}} in site harmonizer files too', async () => {
    const registry = createHarmonizerRegistry(INSTANCE)
    registry.register('site-x', {
      id: '{{instance}}harmonizer/site-x',
      title: 'x',
      mode: 'html',
      schema: { subject: {} },
    })
    expect((await registry.getHarmonizer('site-x')).id).toBe('https://op.test/harmonizer/site-x')
  })
})

describe('#296 site file overrides a builtin by name', () => {
  const siteDefault = { id: 'site', title: 'Site default', mode: 'html', schema: { subject: {} } }

  it('replaces the builtin and warns once at boot', async () => {
    const warn = vi.fn()
    const registry = createHarmonizerRegistry(INSTANCE, { warn })
    registry.register('default', siteDefault)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('site harmonizer `default` replaces builtin')
    expect((await registry.getHarmonizer('default')).title).toBe('Site default')
  })

  it('a second registration under the same name still throws (site-vs-site collision)', () => {
    const registry = createHarmonizerRegistry(INSTANCE, { warn: () => {} })
    registry.register('default', siteDefault)
    expect(() => registry.register('default', siteDefault)).toThrow('already exists')
  })

  it('marks the replaced builtin as declared in listHarmonizerEntries', () => {
    const registry = createHarmonizerRegistry(INSTANCE, { warn: () => {} })
    registry.register('default', siteDefault)
    registry.register('anchors', { ...siteDefault, id: 'anchors' })
    const entries = Object.fromEntries(registry.listHarmonizerEntries().map((e) => [e.name, e.source]))
    expect(entries.default).toBe('declared')
    expect(entries.anchors).toBe('declared')
    expect(entries.openGraph).toBe('builtin')
  })
})

describe('#296 resolved profile marks harmonizer sources', () => {
  it('api.harmonizers.available entries carry source: builtin | declared', () => {
    const registry = createHarmonizerRegistry(INSTANCE, { warn: () => {} })
    registry.register('anchors', { id: 'a', title: 'a', mode: 'html', schema: { subject: {} } })
    const resolved = resolveProfile({ profile, harmonizerNames: registry.listHarmonizerEntries() })
    const available = resolved.api.harmonizers.available
    expect(available).toContainEqual({ name: 'default', source: 'builtin' })
    expect(available).toContainEqual({ name: 'anchors', source: 'declared' })
  })
})
