import { send } from '$lib/mail/send.js'
import { instance, admin_email } from '$env/static/private'

const alertAdmin = async ({s, o}) => {
  let success
  try {
    let success = await send({
      to: admin_email,
      subject: `New Octothorpe on ${instance}`,
      html: `
        <p>
          <b>${s}</b> created a new octothorpe <a href="${o}"><b>${o}</b></a>.
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