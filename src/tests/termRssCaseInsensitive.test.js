import { describe, it, expect } from 'vitest'
import { termFeedQuery } from '../routes/~/[thorpe]/rss/query.js'
import { caseInsensitiveTermClause } from 'octothorpes'

// #253 follow-up: the RSS feed must return the same result set as the term
// search page (src/routes/~/[thorpe]/load.js) — same case-insensitive clause,
// same full-URL escape hatch for backlink targets.

const INSTANCE = 'https://example.com/'

describe('#253 term RSS query matches the search page', () => {
  it('uses the shared case-insensitive clause for term names', () => {
    const q = termFeedQuery(INSTANCE, 'MyTag')
    expect(q).toContain(caseInsensitiveTermClause(INSTANCE, 'MyTag'))
    expect(q).toContain('LCASE(STR(?term))')
    expect(q).toContain(`"${INSTANCE}~/mytag"`)
    expect(q).not.toContain(`<${INSTANCE}~/MyTag>`)
  })

  it('reads the timestamp off the bound term, not a re-cased IRI', () => {
    const q = termFeedQuery(INSTANCE, 'MyTag')
    expect(q).toContain('optional { ?s ?term ?t . }')
  })

  it('keeps exact matching for full-URL params (backlink targets)', () => {
    const q = termFeedQuery(INSTANCE, 'https://other.site/page')
    expect(q).toContain('?s octo:octothorpes <https://other.site/page> .')
    expect(q).not.toContain('LCASE')
  })
})
