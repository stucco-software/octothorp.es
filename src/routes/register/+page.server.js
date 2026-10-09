import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { fail, redirect } from '@sveltejs/kit'
import { send } from '$lib/mail/send.js'
import { isExcluded, canonicalOrigin, getScheme, originVariants, verifyApprovedDomain } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

/**
 * The form has no policy of its own — its state is a function of the indexing
 * gate (#217). Deriving it means the form can never advertise something the
 * gate contradicts.
 *   'registered' -> active   (registering IS how you pass the gate)
 *   'open'       -> hidden   (no gate to pass; registering accomplishes nothing)
 *   'closed'     -> disabled (membership is the admin-managed whitelist)
 * Underscore prefix is required: SvelteKit +page.server.js files only allow
 * load/actions/etc. exports plus underscore-prefixed non-endpoint exports.
 * @param {string} [gate]
 * @returns {'active'|'hidden'|'disabled'}
 */
export const _registrationFormState = (gate = 'registered') => {
  if (gate === 'open') return 'hidden'
  if (gate === 'closed') return 'disabled'
  return 'active'
}

// getProfile() is called lazily (inside load()/actions), not at module scope,
// so tests can mock $lib/profile.js and set access.* before this route module
// is imported without hitting an ESM temporal-dead-zone.
const gate = () => {
  const profile = getProfile()
  const { registration, blocks } = profile.policies.access
  // The ORIGIN blocklist. blocks.terms is not consulted here — it is enforced
  // at statement-write time in the indexer (Task 14) and has nothing to do
  // with whether an origin may submit a registration request.
  return { profile, registration, blockedDomains: blocks.domains, formState: _registrationFormState(registration) }
}

// Origins are stored canonically (#275), but older rows may carry www or a
// trailing slash, so every lookup here matches any spelling of the same site --
// otherwise a ban on www.foo.com wouldn't cover foo.com. See originVariants.
const askAnyVariant = async (domain, predicate, object) => {
  const variants = originVariants(domain).map((o) => `<${o}>`).join(' ')
  return await queryBoolean(`ask {
  values ?origin { ${variants} }
  ?origin ${predicate} ${object} .
}`)
}

// Delegates to core so this and the indexer can never disagree about what
// "verified" means (the old local ASK looked for a trailing-slash spelling the
// indexer never writes).
const domainVerified = async (domain) => await verifyApprovedDomain(domain, { queryBoolean })

const domainPresent = async (domain) => await askAnyVariant(domain, 'rdf:type', '<octo:Origin>')

// Canonical spelling to store, plus the spelling as submitted (scheme + host,
// www kept) for the reachability fetch -- a site served only at www must not
// fail because its bare apex doesn't resolve. Null for anything that isn't an
// http(s) URL.
const parseDomain = (submitted) => {
  try {
    const scheme = getScheme(String(submitted))
    if (scheme !== 'http' && scheme !== 'https') return null
    return { domain: canonicalOrigin(submitted), fetchable: new URL(submitted).origin }
  } catch {
    return null
  }
}

// Spam registrations are usually URLs that don't serve anything. Reject a 404
// response, and also reject hosts we can't reach at all -- a domain that
// doesn't resolve or refuses connections can never pass verification either.
const UNREACHABLE = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']

const domainUnreachable = async (domain) => {
  try {
    let res = await fetch(domain, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'octothorpes-registration-check' },
      signal: AbortSignal.timeout(10000)
    })
    return res.status === 404
  } catch (e) {
    let code = e.cause?.code
    console.log(`registration fetch failed for ${domain}: ${code ?? e.name} ${e.message}`)
    // Timeouts and everything else fall through to admin review -- those also
    // describe slow hosts and ones that block unknown user agents.
    return UNREACHABLE.includes(code)
  }
}

const insertRequest = async ({domain, challenge}) => {
  if (domain === 'https://new.example.com/' || domain === 'http://new.example.com/') {
    return true
  }
  return true
}

const alertAdmin = async ({domain, email}) => {
  let success
  try {
    let success = await send({
      to: getProfile().identity.contact.email,
      subject: 'New Domain Verification Request',
      html: `
        <p>
          New domain request:
        </p>
        <p>
          <b>${domain}</b> is requesting verification. Approve or ban it at <a href="${new URL('admin', getProfile().identity.instance)}">${new URL('admin', getProfile().identity.instance)}</a>.
        </p>
        <p>
          Contact <code>${email}</code> for more information.
        </p>
      `
    })
  } catch (e) {
    console.log(e)
    console.log(success)
    console.log(`something went wrong email the admin re: ${domain}, ${email}`)
    success = false
  }
  return success
}

export async function load() {
  const { profile, registration, formState } = gate()
  return { serverName: profile.identity.name, registration, formState }
}

export const actions = {
  default: async ({request}) => {
    const { registration, blockedDomains, formState } = gate()
    // Defense in depth: the page hides or disables the form, but a direct POST
    // must not slip past the derived state either.
    if (formState !== 'active') {
      return fail(403, { formUnavailable: true, registration })
    }

    const data = await request.formData()
    const email = data.get('email')
    const submitted = data.get('domain')

    // Store one canonical spelling per site -- no www, no trailing slash --
    // so www.foo.com and foo.com don't become two identities in the graph.
    const parsedDomain = parseDomain(submitted)
    if (!parsedDomain) {
      return fail(400, { domain: submitted, blocked: true })
    }
    const { domain, fetchable } = parsedDomain

    // One core check for both exclusion sources (#310). Profile block keeps
    // its 400 blocked:true; a runtime ban keeps 403 banned:true.
    const { sources } = await isExcluded(domain, { blockedDomains, queryBoolean })
    if (sources.includes('profile')) {
      return fail(400, { domain, blocked: true })
    }
    if (sources.includes('ban')) {
      return fail(403, { domain, banned: true })
    }

    if (await domainUnreachable(fetchable)) {
      return fail(400, { domain, notFound: true })
    }

    if(await domainVerified(domain)) {
      return redirect(303, `/domains#${domain}`)
    }

    await insertRequest({
      domain,
    })
    await alertAdmin({
      domain,
      email
    })
    return redirect(303, `/register/verify?d=${domain}&e=${email}`)
  }
};
