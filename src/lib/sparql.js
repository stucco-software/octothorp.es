import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { instance } from '$env/static/private'
import { createSparqlClient, createQueryBuilders, createEnrichBlobjectTargets } from 'octothorpes'

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Returns an empty array if input is false', () => {
    expect('a').toStrictEqual('b')
  })
}

const client = createSparqlClient({
  endpoint: sparql_endpoint,
  user: sparql_user,
  password: sparql_password,
})

export const { queryArray, queryBoolean, query, insert } = client

const builders = createQueryBuilders(instance, queryArray)

export const {
  buildSimpleQuery,
  buildEverythingQuery,
  buildThorpeQuery,
  buildDomainQuery,
  prepEverything,
  testQueryFromMultiPass,
  createDateFilter,
} = builders

export const enrichBlobjectTargets = createEnrichBlobjectTargets(queryArray)
