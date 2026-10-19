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
  // domains/posted is single-purpose: the domains posted to this relay (#266).
  // s= is rejected by core, so queries.js builds it subject-less and tags it
  // clean-db-only — on a clean store the result is just the devdemo domain,
  // durable by construction; against a dirty store it is skipped.
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
