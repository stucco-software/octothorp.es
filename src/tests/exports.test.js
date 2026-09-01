import { describe, it, expect } from 'vitest'
import * as core from 'octothorpes'

describe('octothorpes package exports', () => {
  const expected = [
    // existing
    'createClient', 'createSparqlClient', 'createQueryBuilders', 'createApi',
    'buildMultiPass', 'getBlobjectFromResponse', 'createHarmonizerRegistry',
    'parseUri', 'validateSameOrigin', 'getScheme',
    'verifiedOrigin', 'parseBindings', 'deslash', 'getFuzzyTags', 'isSparqlSafe',
    'rss', 'arrayify', 'harmonizeSource',
    'createIndexer', 'resolveSubtype', 'isHarmonizerAllowed',
    'checkIndexingRateLimit', 'checkIndexingPolicy', 'parseRequestBody', 'isURL',
    // newly added
    'badgeVariant', 'determineBadgeUri',
    'remoteHarmonizer', 'mergeSchemas', 'processValue', 'filterValues', 'validators',
    'verifyApprovedDomain',
    'createEnrichBlobjectTargets',
    // utils additions
    'getUnixDateFromString', 'parseDateStrings', 'cleanInputs',
    'areUrlsFuzzy', 'isValidMultipass', 'extractMultipassFromGif',
    'injectMultipassIntoGif', 'getWebrings', 'countWebrings',
    // origin additions
    'verifyWebOfTrust',
    // publisher system (added in Task 2)
    'publish', 'resolve', 'validateResolver', 'loadResolver',
    'createPublisherRegistry',
    'createHandlerRegistry', 'createDefaultHandlerRegistry', 'nullHandler',
    // C2 profile loader (#216)
    'createProfile',
  ]

  it('should export all expected functions', () => {
    for (const name of expected) {
      expect(core[name], `missing export: ${name}`).toBeDefined()
    }
  })
})

describe('#217 profile surface', () => {
  it('exports the profile loader and its constants', () => {
    expect(typeof core.createProfile).toBe('function')
    expect(typeof core.PROFILE_DEFAULTS).toBe('object')
    expect(core.OCTO_VOCABULARY_IRI).toBe('https://vocab.octothorp.es#')
  })

  it('no longer exports the dead credential helpers', () => {
    expect(core.credentialEnvKey).toBeUndefined()
    expect(core.getAccountCredentials).toBeUndefined()
  })
})
