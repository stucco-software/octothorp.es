// Shared test matrix for api-check page and integration tests.
// Both sources must stay in sync — do not duplicate this data elsewhere.

export const whats = ['everything', 'pages', 'thorpes', 'domains']

export const bys = [
  { by: 'thorped',    needsObject: true,  isLinkType: false },
  { by: 'linked',     needsObject: true,  isLinkType: true  },
  { by: 'backlinked', needsObject: true,  isLinkType: true  },
  { by: 'cited',      needsObject: true,  isLinkType: true  },
  { by: 'bookmarked', needsObject: true,  isLinkType: true  },
  { by: 'posted',     needsObject: false, isLinkType: false },
]

export const formats = ['', 'debug', 'rss']

export const extras = [
  {},
  { when: 'recent' },
  { when: 'before-2025-01-01' },
  { when: 'after-2024-01-01' },
  { match: 'all' },
  { limit: '1000' },
  { rt: 'demo' },
]
