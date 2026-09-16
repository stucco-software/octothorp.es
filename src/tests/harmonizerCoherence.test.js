import { describe, it, expect } from 'vitest'
import { createClient, createProfile, resolveProfile } from 'octothorpes'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// #293: the profile declares the query word / predicate, a harmonizer declares
// the markup, and they meet on a name. These tests pin the GENTLE check that
// notices when they fail to meet — warn, never throw, one line per kind.

const here = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(readFileSync(resolve(here, '../../packages/core/profile.schema.json'), 'utf8'))
const repoProfileSource = JSON.parse(readFileSync(resolve(here, '../../octothorpes.json'), 'utf8'))

const instance = 'https://x.test/'

// A client never touches SPARQL during construction, so a bare endpoint is enough.
const build = ({ api = {}, harmonizers, warn }) =>
  createClient({
    instance,
    sparql: { endpoint: 'http://localhost:9999/sparql' },
    harmonizers,
    warn,
    profile: createProfile({ profile: { identity: { instance }, api }, schema }).getProfile(),
  })

const capture = () => {
  const lines = []
  return { warn: (m) => lines.push(m), lines }
}

const coherenceLines = (lines) => lines.filter((l) => l.startsWith('[profile] '))

const reviewHarmonizer = (sectionKey) => ({
  id: 'harmonizer/site-x',
  type: 'harmonizer',
  mode: 'html',
  schema: {
    subject: { s: 'source' },
    [sectionKey]: { s: 'source', o: [{ selector: "[rel~='octo:reviews']", attribute: 'href' }] },
  },
})

describe('(a) declared link types with no harmonizer that writes their subtype', () => {
  it('warns, naming the by word and the subtype', () => {
    const { warn, lines } = capture()
    build({ api: { linkTypes: [{ by: 'reviewed', subtype: 'Review' }] }, warn })
    expect(coherenceLines(lines)).toEqual([
      '[profile] custom link types found (reviewed -> octo:Review); these must be captured by a custom harmonizer before OP will record them',
    ])
  })

  it('is silent when a site harmonizer has a matching `review` section key', () => {
    const { warn, lines } = capture()
    build({
      api: { linkTypes: [{ by: 'reviewed', subtype: 'Review' }] },
      harmonizers: { 'site-x': reviewHarmonizer('review') },
      warn,
    })
    expect(coherenceLines(lines)).toEqual([])
  })

  it('honours the resolveSubtype capitalisation rule (a `Review` section key also matches)', () => {
    const { warn, lines } = capture()
    build({
      api: { linkTypes: [{ by: 'reviewed', subtype: 'Review' }] },
      harmonizers: { 'site-x': reviewHarmonizer('Review') },
      warn,
    })
    expect(coherenceLines(lines)).toEqual([])
  })

  it('lists several uncaptured types on ONE line', () => {
    const { warn, lines } = capture()
    build({
      api: {
        linkTypes: [
          { by: 'reviewed', subtype: 'Review' },
          { by: 'quoted', subtype: 'Quote' },
        ],
      },
      warn,
    })
    expect(coherenceLines(lines)).toEqual([
      '[profile] custom link types found (reviewed -> octo:Review, quoted -> octo:Quote); these must be captured by a custom harmonizer before OP will record them',
    ])
  })

  it('never warns about builtin link types', () => {
    const { warn, lines } = capture()
    build({ api: {}, warn })
    expect(coherenceLines(lines).filter((l) => l.includes('custom link types'))).toEqual([])
  })
})

describe('(b) declared documentRecord predicates no harmonizer extracts', () => {
  it('warns when nothing extracts the predicate', () => {
    const { warn, lines } = capture()
    build({ api: { documentRecord: [{ predicate: 'wordCount', range: 'literal' }] }, warn })
    expect(coherenceLines(lines)).toContain(
      '[profile] custom documentRecord predicates found (wordCount); these must be extracted by a custom harmonizer before OP will record them'
    )
  })

  it('is silent when a harmonizer schema.documentRecord extracts it', () => {
    const { warn, lines } = capture()
    build({
      api: { documentRecord: [{ predicate: 'wordCount', range: 'literal' }] },
      harmonizers: {
        'site-x': {
          id: 'harmonizer/site-x',
          mode: 'html',
          schema: { documentRecord: { wordCount: [{ selector: 'article', attribute: 'textContent' }] } },
        },
      },
      warn,
    })
    expect(coherenceLines(lines)).toEqual([])
  })
})

describe("(a') a harmonizer subtype no link type queries", () => {
  it('warns, pointing at api.linkTypes', () => {
    const { warn, lines } = capture()
    build({ api: {}, harmonizers: { 'site-x': reviewHarmonizer('review') }, warn })
    expect(coherenceLines(lines)).toEqual([
      '[profile] harmonizer "site-x" writes relationship subtype octo:Review that no link type queries; declare it in api.linkTypes to make it reachable',
    ])
  })

  it('exempts link, button, endorse and hashtag sections', () => {
    const { warn, lines } = capture()
    build({
      api: {},
      harmonizers: {
        'site-x': {
          id: 'harmonizer/site-x',
          mode: 'html',
          schema: {
            subject: { s: 'source' },
            hashtag: { o: [{ selector: 'a', attribute: 'href' }] },
            link: { o: [{ selector: 'a', attribute: 'href' }] },
            button: { o: [{ selector: 'a', attribute: 'href' }] },
            endorse: { o: [{ selector: 'a', attribute: 'href' }] },
          },
        },
      },
      warn,
    })
    expect(coherenceLines(lines)).toEqual([])
  })

  it('is silent for a builtin subtype like bookmark', () => {
    const { warn, lines } = capture()
    build({
      api: {},
      harmonizers: {
        'site-x': {
          id: 'harmonizer/site-x',
          mode: 'html',
          schema: { bookmark: { o: [{ selector: 'a', attribute: 'href' }] } },
        },
      },
      warn,
    })
    expect(coherenceLines(lines)).toEqual([])
  })
})

describe("(b') a harmonizer documentRecord key the profile never declared", () => {
  it('warns that the keys are dropped at write time', () => {
    const { warn, lines } = capture()
    build({
      api: {},
      harmonizers: {
        'site-x': {
          id: 'harmonizer/site-x',
          mode: 'html',
          schema: { documentRecord: { foo: [{ selector: 'article', attribute: 'textContent' }] } },
        },
      },
      warn,
    })
    expect(coherenceLines(lines)).toEqual([
      '[profile] harmonizer "site-x" extracts documentRecord keys (foo) not declared in api.documentRecord; they are dropped at write time',
    ])
  })
})

describe('builtins alone are coherent', () => {
  it('a client with no declarations and no site harmonizers warns about nothing', () => {
    const { warn, lines } = capture()
    build({ api: {}, warn })
    expect(coherenceLines(lines)).toEqual([])
  })

  it('the repo profile produces no link-type or reverse warnings', () => {
    const { warn, lines } = capture()
    createClient({
      instance,
      sparql: { endpoint: 'http://localhost:9999/sparql' },
      warn,
      profile: createProfile({ profile: repoProfileSource, schema }).getProfile(),
    })
    // The only thing the repo profile can be incoherent about is its declared
    // `richContent` documentRecord predicate, which arrives by direct blobject
    // POST rather than from a harmonizer — an advisory, not an error.
    expect(coherenceLines(lines).filter((l) => !l.includes('documentRecord'))).toEqual([])
  })
})

describe('api.coherence is a projection', () => {
  it('appears on the resolved profile with the four lists', () => {
    const client = build({
      api: { linkTypes: [{ by: 'reviewed', subtype: 'Review' }] },
      warn: () => {},
    })
    expect(client.resolvedProfile().api.coherence).toEqual({
      uncapturedLinkTypes: [expect.objectContaining({ by: 'reviewed', subtype: 'Review' })],
      uncapturedDocumentRecord: [],
      unqueriedSubtypes: [],
      undeclaredDocumentRecord: [],
    })
  })

  it('is absent when resolveProfile is called without one', () => {
    const profile = createProfile({ profile: { identity: { instance }, api: {} }, schema }).getProfile()
    expect('coherence' in resolveProfile({ profile }).api).toBe(false)
  })

  it('cannot be AUTHORED — api is a closed schema', () => {
    expect(() =>
      createProfile({
        profile: { identity: { instance }, api: { coherence: { uncapturedLinkTypes: [] } } },
        schema,
      })
    ).toThrow()
  })
})
