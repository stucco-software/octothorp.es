import { fastmail_password } from '$env/static/private'
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
  host: "smtp.fastmail.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'hello@nikolas.ws',
    pass: fastmail_password
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
    from: '"Octothorpes Robot" robot@octothorp.es',
    to: to,
    subject: subject,
    text: text,
    html: html
  };
  return await transport.sendMail(mailOptions);
}