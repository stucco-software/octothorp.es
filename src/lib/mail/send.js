import {
  smtp_host,
  smtp_port,
  smtp_secure,
  smtp_user,
  smtp_password,
  robot_email
} from '$env/static/private'
import nodemailer from 'nodemailer'

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('TK', () => {
    // TEST TK: Unsure if this needs to be tested. Maybe failure cases?
    expect('a').toStrictEqual('b')
  })
}
// TK: This does need to be refacted to accept:
//     mail_host
//     mail_port
//     mail_user
//     mail_pass
const transport = nodemailer.createTransport({
  host: smtp_host,
  port: smtp_port,
  secure: false, // true for 465, false for other ports
  auth: {
    user: smtp_user,
    pass: smtp_password
  }
})

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('TK', () => {
    // TEST TK: Unsure how to test. The composition is _very_ basic 
    //          and the rest is a side effect.
    expect('a').toStrictEqual('b')
  })
}
// TK: This does need to be refacted to:
//     send emails from robot @ instance host
export const send = async ({to, subject, text, html}) => {
  const mailOptions = {
    from: `"Octothorpes Robot" ${robot_email}`,
    to: to,
    subject: subject,
    text: text,
    html: html
  };
  console.log(smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password)
  console.log(mailOptions)
  return await transport.sendMail(mailOptions);
}