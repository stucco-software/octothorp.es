import { queryBoolean } from '$lib/sparql.js'

export const getAlias = (origin) => {
  let alias
  if (origin.startsWith('https')) {
    alias = origin.startsWith('https://www.')
        ? origin.replace('https://www.', 'https://')
        : origin.replace('https://', 'https://www.')
  } else {
    alias = origin.startsWith('http://www.')
      ? origin.replace('http://www.', 'http://')
      : origin.replace('http://', 'http://www.')
  }
  return alias
}

export const verifiedOrigin = async (origin) => {
  let alias = getAlias(origin)

  let originVerified = await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)
  let aliasVerified = await queryBoolean(`
    ask {
      <${alias}> octo:verified "true" .
    }
  `)
  return originVerified || aliasVerified
}