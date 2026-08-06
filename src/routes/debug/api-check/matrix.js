// Shared test matrix for api-check page and integration tests.
// Both sources must stay in sync — do not duplicate this data elsewhere.

export const whats = ['everything', 'pages', 'thorpes', 'domains']

export const bys = [
  // thorpes/thorped is degenerate: o= is itself a term, so it just echoes that
  // term once per posting page. Excluded rather than blocked at the route.
  { by: 'thorped',    needsObject: true,  isLinkType: false, excludeWhats: ['thorpes'] },
  { by: 'linked',     needsObject: true,  isLinkType: true,  excludeWhats: ['thorpes'] },
  { by: 'backlinked', needsObject: true,  isLinkType: true,  excludeWhats: ['thorpes'] },
  { by: 'cited',      needsObject: true,  isLinkType: true,  excludeWhats: ['thorpes'] },
  { by: 'bookmarked', needsObject: true,  isLinkType: true,  excludeWhats: ['thorpes'] },
  { by: 'posted',     needsObject: false, isLinkType: false },
  { by: 'in-webring', needsObject: false, isLinkType: false, excludeWhats: ['thorpes', 'domains'] },
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
