import nodemailer from 'npm:nodemailer@10.6.0'
import { smtpSettings } from './smtp.ts'

export type EmailMessage = { to: string; subject: string; text: string }

/** Sends one plain-text email over SMTP. Throws on any failure. */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const { options, fromAddress, fromName } = smtpSettings((name) => Deno.env.get(name))
  const transport = nodemailer.createTransport(options)

  try {
    await transport.sendMail({
      from: { name: fromName, address: fromAddress },
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    })
  } finally {
    transport.close()
  }
}
