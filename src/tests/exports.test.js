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
    'remoteHarmonizer',
    'verifyApprovedDomain',
    'createEnrichBlobjectTargets',
    // utils additions
    'getUnixDateFromString', 'parseDateStrings', 'cleanInputs',
    'areUrlsFuzzy', 'isValidMultipass', 'extractMultipassFromGif',
    'injectMultipassIntoGif', 'getWebrings', 'countWebrings',
    // origin additions
    'verifiyContent', 'verifyWebOfTrust',
    // publisher system (added in Task 2)
    'publish', 'resolve', 'validateResolver', 'loadResolver',
    'createPublisherRegistry',
  ]

  it('should export all expected functions', () => {
    for (const name of expected) {
      expect(core[name], `missing export: ${name}`).toBeDefined()
    }
  })
})
