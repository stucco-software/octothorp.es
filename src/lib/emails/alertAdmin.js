import { send } from '$lib/mail/send.js'
import { instance } from '$env/static/private'

const alertAdmin = async ({s, o}) => {
  let success
  try {
    let success = await send({
      to: 'admin@octothorp.es',
      subject: `New Octothorpe on ${instance}`,
      html: `
        <p>
          <b>${s}</b> created a new octothorpe <a href="${instance}~/${o}"><b>#${o}</b></a>.
        </p>
      `
    })
  } catch (e) {
    console.log(e)
    success = false
  }
  return success
}

export default alertAdmin