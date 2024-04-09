import { fastmail_password } from '$env/static/private'
import nodemailer from 'nodemailer'

const transport = nodemailer.createTransport({
  host: "smtp.fastmail.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: 'hello@nikolas.ws',
    pass: fastmail_password
  }
})

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