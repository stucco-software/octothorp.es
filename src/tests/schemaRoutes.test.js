import { describe, it, expect } from 'vitest'
import profileSchema from 'octothorpes/profile.schema.json' with { type: 'json' }
import harmonizerSchema from 'octothorpes/harmonizer.schema.json' with { type: 'json' }
import { GET as profileRoute } from '../routes/profile.schema.json/+server.js'
import { GET as harmonizerRoute } from '../routes/harmonizer.schema.json/+server.js'

// A schema's `$id` is its published identity, so the relay has to serve each
// file at the URL it names — otherwise an operator authoring a profile outside
// this repo has nothing to point `$schema` at.
const cases = [
  { name: 'profile', route: profileRoute, schema: profileSchema, path: '/profile.schema.json' },
  { name: 'harmonizer', route: harmonizerRoute, schema: harmonizerSchema, path: '/harmonizer.schema.json' },
]

describe('schema documents are served at their $id path', () => {
  for (const { name, route, schema, path } of cases) {
    it(`${name}: $id ends with the route that serves it`, () => {
      expect(new URL(schema.$id).pathname).toBe(path)
    })

    it(`${name}: serves the package's own copy verbatim`, async () => {
      const res = route()
      expect(JSON.parse(await res.text())).toEqual(schema)
    })

    it(`${name}: is JSON and CORS-open, because validators fetch cross-origin`, () => {
      const res = route()
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })
  }

  it('the served profile schema carries the renamed access.allows slot', () => {
    const access = profileSchema.properties.policies.properties.access.properties
    expect(Object.keys(access.allows.properties).sort()).toEqual(['domains', 'schemes', 'terms'])
    expect(access.whitelist).toBeUndefined()
  })
})
