/**
 * Derive a badge variant filename by inserting a suffix before the extension.
 * e.g. badgeVariant('badge.png', 'fail') => 'badge_fail.png'
 */
export const badgeVariant = (filename, suffix) => {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex === -1) return `${filename}_${suffix}`
  return `${filename.slice(0, dotIndex)}_${suffix}${filename.slice(dotIndex)}`
}

/**
 * Determine the page URI to index from badge request parameters.
 * Prefers explicit ?uri= param, falls back to Referer header.
 * Returns null if no valid URL can be determined.
 */
export const determineBadgeUri = (uriParam, referer) => {
  const candidates = [uriParam, referer]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      new URL(candidate)
      return candidate
    } catch (e) {
      continue
    }
  }
  return null
}
