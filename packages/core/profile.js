import Ajv from 'ajv'

// C2 — OP Client Profile loader (#216). Framework-agnostic: takes the already
// -parsed profile object, the schema object, an `instance` value (used to
// resolve `relay`, which the committed profile.json sets to null by C1
// contract), and an optional `env` accessor object for point-of-use
// credential resolution. No fs/path/$env access happens in this module — the
// adapter (src/lib/profile.js) is responsible for reading profile.json and
// injecting process/SvelteKit env, mirroring how src/lib/indexing.js injects
// sparql fns + $env into createIndexer/createClient.

// Defense-in-depth: the committed profile.json must never carry a secret
// -shaped key (C1's contract test already asserts this for the committed
// file); this guard re-checks whatever profile object is actually loaded at
// runtime, in case profile.json drifts or a caller injects a doctored object.
const SECRET_KEY_RE = /key|secret|token|password|credential/i

const assertNoSecrets = (node, path = '') => {
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`))
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const fieldPath = path ? `${path}.${k}` : k
      if (SECRET_KEY_RE.test(k)) {
        throw new Error(
          `Profile contains a secret-shaped key "${fieldPath}" — credentials must live in env and be resolved at point-of-use via getAccountCredentials(), never in profile.json`
        )
      }
      assertNoSecrets(v, fieldPath)
    }
  }
}

const validateAgainstSchema = (profile, schema) => {
  const ajv = new Ajv({ allErrors: true })
  const validate = ajv.compile(schema)
  const ok = validate(profile)
  if (!ok) {
    const details = (validate.errors || [])
      .map((e) => `${e.instancePath || '(root)'} ${e.message}`)
      .join('; ')
    throw new Error(`Profile failed schema validation: ${details}`)
  }
}

// Env naming convention for point-of-use credential resolution (documented
// per #216): given an externalAccounts[] entry's `provider` (e.g.
// "bluesky"), the credential is looked up in the injected env object under
// `<PROVIDER_UPPERCASED>_APP_PASSWORD` (e.g. BLUESKY_APP_PASSWORD). Providers
// that need more than one secret, or a differently-shaped credential, can
// extend this convention later; Rev 1 only needs a single app-password-style
// value per provider.
export const credentialEnvKey = (provider) => `${String(provider).toUpperCase()}_APP_PASSWORD`

/**
 * Creates a validated, framework-agnostic profile accessor.
 * @param {Object} config
 * @param {Object} config.profile - The parsed profile.json contents (relay may be null).
 * @param {Object} config.schema - The parsed profile.schema.json JSON Schema.
 * @param {string} config.instance - This install's canonical instance URL; resolves `relay`.
 * @param {Object} [config.env] - Env accessor object (e.g. flat process.env-shaped object)
 *   used by getAccountCredentials() to resolve provider credentials at point-of-use.
 * @returns {{ getProfile: () => Object, getAccountCredentials: (provider: string) => Object }}
 */
export const createProfile = ({ profile, schema, instance, env = {} } = {}) => {
  if (!profile || typeof profile !== 'object') {
    throw new Error('createProfile requires a `profile` object (the parsed profile.json contents)')
  }
  if (!schema || typeof schema !== 'object') {
    throw new Error('createProfile requires a `schema` object (the parsed profile.schema.json contents)')
  }
  if (!instance) {
    throw new Error('createProfile requires an `instance` value to resolve the profile\'s `relay` field')
  }

  // No-secrets guard runs first and independently of schema validation: it
  // must keep firing with a clear "secret-shaped key" message even if a
  // future schema revision loosens additionalProperties, since this is the
  // defense-in-depth backstop described in #216.
  assertNoSecrets(profile)

  // Validate the profile as committed (relay: null is valid per schema)
  // before resolving relay, so schema errors are reported against the
  // actual file shape.
  validateAgainstSchema(profile, schema)

  // Resolve relay from the injected instance without mutating the caller's
  // profile object.
  const resolved = { ...profile, relay: instance }

  const getProfile = () => resolved

  const getAccountCredentials = (provider) => {
    const account = (resolved.externalAccounts || []).find((a) => a.provider === provider)
    if (!account) {
      throw new Error(`Unknown external account provider: "${provider}" (not declared in profile.externalAccounts)`)
    }
    const credential = env[credentialEnvKey(provider)] ?? null
    return { provider, handle: account.handle, credential }
  }

  return { getProfile, getAccountCredentials }
}
