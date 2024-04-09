import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { fail, redirect } from '@sveltejs/kit'
import { send } from '$lib/mail/send.js'

const domainBanned = async (domain) => await queryBoolean(`ask {
  <${domain}> octo:banned "true" .
}`)

const domainVerified = async (domain) => await queryBoolean(`ask {
  <${domain}> octo:verified "true" .
}`)

const domainPresent = async (domain) => await queryBoolean(`ask {
  <${domain}> rdf:type <octo:Origin> .
}`)

const insertRequest = async ({domain, challenge}) => {
  console.log('insert new domain verifiction request')
  if (domain === 'https://new.example.com/' || domain === 'http://new.example.com/') {
    return true
  }
  console.log('this is not a drill')
  console.log(domain, challenge)
  return true
}

const alertAdmin = async ({domain, challenge}) => {
  let success
  try {
    let success = await send({
      to: 'admin@octothorp.es',
      subject: 'New Domain Verification Request',
      html: `
        <p>
          New domain request:
        </p>
        <p>
          <b>${domain}</b> is requesting verification.
        </p>
        <p>
          <code>${challenge}</code>
        </p>
      `
    })
  } catch (e) {
    console.log(e)
    success = false
  }
  return success
}

export const actions = {
  default: async ({request}) => {
    const data = await request.formData();
    const domain = data.get('domain').endsWith('/')
      ? data.get('domain')
      : `${data.get('domain')}/`

    if (await domainBanned(domain)) {
      return fail(403, { domain, banned: true })
    }

    if(await domainVerified(domain)) {
      return redirect(303, `/domains#${domain}`)
    }

    let challenge
    if(await domainPresent(domain)) {
      const response = await queryArray(`select ?c {
        <${domain}> octo:challenge ?c
      }`)
      challenge = response.results.bindings[0].c.value
      return redirect(303, `/register/verify?d=${domain}&c=${challenge}`)
    }

    challenge = crypto.randomUUID()

    await insertRequest({
      domain,
      challenge
    })
    await alertAdmin({
      domain,
      challenge
    })
    return redirect(303, `/register/verify?d=${domain}&c=${challenge}`)
  }
};