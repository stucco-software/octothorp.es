// Re-exported from the indexing adapter so harmonizer lookups (the
// /harmonizer/[id] route, orchestra-pit) resolve against the same registry the
// indexing path uses: builtins plus the site harmonizers discovered from the
// profile's api.harmonizers.dir. A builtins-only registry here left
// /harmonizer/sitemap (and every other site harmonizer) unreachable.
export { getHarmonizer } from '$lib/indexing.js'
