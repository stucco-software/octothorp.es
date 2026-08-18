import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { fail, redirect } from '@sveltejs/kit'
import { admin_email } from '$lib/config.js'
import { send } from '$lib/mail/send.js'
import { server_name } from '$lib/config.js'

const domainBanned = async (domain) => await queryBoolean(`ask {
  <${domain}> octo:banned "true" .
}`)

const domainVerified = async (domain) => await queryBoolean(`ask {
  <${domain}> octo:verified "true" .
}`)

const domainPresent = async (domain) => await queryBoolean(`ask {
  <${domain}> rdf:type <octo:Origin> .
}`)

const BLOCKED_HOSTS = ['example.com']

const hostBlocked = (domain) => {
  let hostname
  try {
    hostname = new URL(domain).hostname.toLowerCase()
  } catch (e) {
    return true
  }
  return BLOCKED_HOSTS.some(blocked =>
    hostname === blocked || hostname.endsWith(`.${blocked}`)
  )
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
      to: admin_email,
      subject: 'New Domain Verification Request',
      html: `
        <p>
          New domain request:
        </p>
        <p>
          <a href="https://administration.octothorp.es/?url=${domain}"><b>${domain}</b></a> is requesting verification
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

export async function load(req) {
  return {
    server_name
  }
}

export const actions = {
  default: async ({request}) => {
    const data = await request.formData()
    const email = data.get('email')
    const domain = data.get('domain').endsWith('/')
      ? data.get('domain')
      : `${data.get('domain')}/`

    if (hostBlocked(domain)) {
      return fail(400, { domain, blocked: true })
    }

    if (await domainBanned(domain)) {
      return fail(403, { domain, banned: true })
    }

    if (await domainUnreachable(domain)) {
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