import { describe, it, expect, vi } from 'vitest'
import { discoverHarmonizers, validateHarmonizer, createHarmonizerRegistry } from 'octothorpes'

const def = (mode = 'html') => ({
  id: 'https://example.test/harmonizer/demo',
  type: 'harmonizer',
  title: 'Demo',
  mode,
  schema: { subject: { s: 'source', octothorpes: [{ selector: 'a[href]', attribute: 'href' }] } },
})

describe('validateHarmonizer', () => {
  it('accepts a well-formed definition', () => {
    expect(validateHarmonizer(def())).toEqual([])
  })

  it('requires id, title, mode and schema.subject', () => {
    expect(validateHarmonizer({}).length).toBeGreaterThan(0)
    expect(validateHarmonizer({ ...def(), schema: {} })).toContain('missing schema.subject')
    expect(validateHarmonizer({ ...def(), mode: undefined })).toContain('missing mode')
  })

  it('does not require the named mode to be a registered handler', () => {
    // Discovery order between handlers.dir and harmonizers.dir is not
    // guaranteed; an unknown mode falls through to default dispatch.
    expect(validateHarmonizer(def('not-a-registered-mode'))).toEqual([])
  })
})

describe('discoverHarmonizers (#217 wave 5)', () => {
  const base = {
    dir: './harmonizers',
    listEntries: async () => ['csv.json', 'anchors.json', '_draft.json', 'notes.md', 'bad.json', 'invalid.json'],
    readJson: async (dir, file) => {
      if (file === 'bad.json') throw new Error('Unexpected token } in JSON')
      if (file === 'invalid.json') return { title: 'no schema' }
      return def(file === 'csv.json' ? 'csv' : 'html')
    },
  }

  it('registers each definition under its file basename', async () => {
    const { harmonizers } = await discoverHarmonizers(base)
    expect(Object.keys(harmonizers).sort()).toEqual(['anchors', 'csv'])
  })

  it('ignores non-.json files entirely', async () => {
    const { harmonizers, skipped } = await discoverHarmonizers(base)
    expect(harmonizers.notes).toBeUndefined()
    expect(skipped.map((s) => s.name)).not.toContain('notes.md')
  })

  it('skips _-prefixed files silently', async () => {
    const warn = vi.fn()
    const { harmonizers } = await discoverHarmonizers({ ...base, warn })
    expect(harmonizers._draft).toBeUndefined()
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/_draft/)
  })

  it('skips and warns on unparseable JSON', async () => {
    const warn = vi.fn()
    const { skipped } = await discoverHarmonizers({ ...base, warn })
    expect(skipped.map((s) => s.name)).toContain('bad.json')
    expect(warn).toHaveBeenCalled()
  })

  it('skips and warns on a definition that fails validation, naming the problem', async () => {
    const warn = vi.fn()
    const { skipped } = await discoverHarmonizers({ ...base, warn })
    const bad = skipped.find((s) => s.name === 'invalid.json')
    expect(bad.reason).toMatch(/schema\.subject/)
  })

  it('preserves the declared mode — this is the handler reference', async () => {
    const { harmonizers } = await discoverHarmonizers(base)
    expect(harmonizers.csv.mode).toBe('csv')
    expect(harmonizers.anchors.mode).toBe('html')
  })

  it('an unreadable dir yields an empty registry and one warning', async () => {
    const warn = vi.fn()
    const res = await discoverHarmonizers({
      dir: './nope',
      listEntries: async () => { throw new Error('ENOENT') },
      readJson: async () => def(),
      warn,
    })
    expect(res).toEqual({ harmonizers: {}, skipped: [] })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('a null dir is a no-op with no warning', async () => {
    const warn = vi.fn()
    expect(await discoverHarmonizers({ dir: null, listEntries: async () => [], readJson: async () => ({}), warn }))
      .toEqual({ harmonizers: {}, skipped: [] })
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('registry integration', () => {
  it('registers discovered definitions alongside the core locals', async () => {
    const registry = createHarmonizerRegistry('https://example.test/')
    const { harmonizers } = await discoverHarmonizers({
      dir: './harmonizers',
      listEntries: async () => ['anchors.json'],
      readJson: async () => def(),
    })
    for (const [name, d] of Object.entries(harmonizers)) registry.register(name, d)
    expect(registry.listHarmonizers()).toEqual(expect.arrayContaining(['default', 'anchors']))
    expect(await registry.getHarmonizer('anchors')).toMatchObject({ mode: 'html' })
  })
})
