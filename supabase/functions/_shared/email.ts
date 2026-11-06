import nodemailer from 'npm:nodemailer@10'

export type EmailMessage = { to: string; subject: string; text: string }

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/** Sends one plain-text email over SMTP. Throws on any failure. */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const host = requireEnv('SMTP_HOST')
  const portRaw = requireEnv('SMTP_PORT')
  const secureRaw = requireEnv('SMTP_SECURE')
  const user = requireEnv('SMTP_USER')
  const pass = requireEnv('SMTP_PASS')
  const fromName = requireEnv('MAIL_FROM_NAME')

  if (!/^\d+$/.test(portRaw)) throw new Error('SMTP_PORT must be an integer')
  const port = Number.parseInt(portRaw, 10)
  if (port < 1 || port > 65535) throw new Error('SMTP_PORT must be between 1 and 65535')

  if (secureRaw !== 'true' && secureRaw !== 'false') {
    throw new Error('SMTP_SECURE must be "true" or "false"')
  }
  const secure = secureRaw === 'true'

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })

  try {
    await transport.sendMail({
      from: { name: fromName, address: user },
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    })
  } finally {
    transport.close()
  }
}
