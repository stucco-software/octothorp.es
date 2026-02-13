/**
 * Validates a blobject for structural correctness before feeding
 * into the recording pipeline. Used by the as=blobject passthrough
 * harmonizer mode on the index endpoint.
 *
 * @param {*} blobject - Data to validate
 * @returns {{valid: true}|{valid: false, error: string}}
 */
export function validateBlobject(blobject) {
  if (!blobject || typeof blobject !== 'object' || Array.isArray(blobject)) {
    return { valid: false, error: 'Blobject must be a JSON object' }
  }

  // Validate @id is a valid HTTP(S) URL
  const id = blobject['@id']
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'Blobject must have an @id string' }
  }

  try {
    const parsed = new URL(id)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Blobject @id must be an HTTP(S) URL' }
    }
  } catch (e) {
    return { valid: false, error: 'Blobject @id must be a valid URL' }
  }

  // Validate octothorpes array
  if (!Array.isArray(blobject.octothorpes)) {
    return { valid: false, error: 'Blobject must have an octothorpes array' }
  }

  // Validate each octothorpe entry
  for (const entry of blobject.octothorpes) {
    if (typeof entry === 'string') continue

    if (typeof entry === 'object' && entry !== null) {
      if (!entry.type || typeof entry.type !== 'string') {
        return { valid: false, error: 'Typed octothorpe must have a type string' }
      }
      if (!entry.uri || typeof entry.uri !== 'string') {
        return { valid: false, error: 'Typed octothorpe must have a uri string' }
      }
      try {
        const parsed = new URL(entry.uri)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { valid: false, error: 'Typed octothorpe uri must be an HTTP(S) URL' }
        }
      } catch (e) {
        return { valid: false, error: 'Typed octothorpe uri must be a valid URL' }
      }
    } else {
      return { valid: false, error: 'Each octothorpe must be a string or {type, uri} object' }
    }
  }

  return { valid: true }
}
