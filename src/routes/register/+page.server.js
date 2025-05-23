import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { fail, redirect } from '@sveltejs/kit'
import { admin_email } from '$env/static/private'
import { send } from '$lib/mail/send.js'
import { server_name } from '$env/static/private'

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
          <b>${domain}</b> is requesting verification
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

    if (await domainBanned(domain)) {
      return fail(403, { domain, banned: true })
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