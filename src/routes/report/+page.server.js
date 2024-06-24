import { fail, redirect } from '@sveltejs/kit'
import { send } from '$lib/mail/send.js'

const alertAdmin = async ({url}) => {
  let success
  try {
    let success = await send({
      to: 'admin@octothorp.es',
      subject: 'New Report',
      html: `
        <p>
          New report against:
        </p>
        <p>
          <b>${url}</b> is awaiting moderation.
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
    const url = data.get('url')

    await alertAdmin({
      url
    })
    return redirect(303, `/report/confirmed?u=${url}`)
  }
};