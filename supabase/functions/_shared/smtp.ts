// SMTP transport settings, resolved from the environment. Pure (takes a lookup
// function, no Deno globals) so tests can import it.

const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', 'host.docker.internal', 'inbucket'])

export type SmtpSettings = {
  options: Record<string, unknown>
  /** The from address (SMTP_USER). */
  fromAddress: string
  fromName: string
}

/**
 * Local-only hosts: loopback, the Docker host, and `inbucket` (the Mailpit
 * container's network alias; Deno's resolver rejects the underscores in the
 * container name). Exact matches only.
 */
export function isLocalHost(host: string): boolean {
  return LOCAL_NAMES.has(host.trim().toLowerCase())
}

const LOCAL_STACK_HOSTS = new Set(['kong', 'localhost', '127.0.0.1'])

/**
 * True only inside the local Supabase stack. Supabase refuses user secrets
 * named SUPABASE_*, so a deployed function can never have a local SUPABASE_URL.
 */
export function isLocalStack(supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false
  try {
    return LOCAL_STACK_HOSTS.has(new URL(supabaseUrl).hostname)
  } catch {
    return false
  }
}

export function smtpSettings(get: (name: string) => string | undefined): SmtpSettings {
  const need = (name: string): string => {
    const value = get(name)
    if (value === undefined || value === '') {
      throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
  }
  const host = need('SMTP_HOST')
  // The host that is checked must be the host that is connected to.
  if (/\s/.test(host)) throw new Error('SMTP_HOST must not contain whitespace')
  const portRaw = need('SMTP_PORT')
  const secureRaw = need('SMTP_SECURE')
  const user = need('SMTP_USER')
  const fromName = need('MAIL_FROM_NAME')

  if (!/^\d+$/.test(portRaw)) throw new Error('SMTP_PORT must be an integer')
  const port = Number.parseInt(portRaw, 10)
  if (port < 1 || port > 65535) throw new Error('SMTP_PORT must be between 1 and 65535')

  if (secureRaw !== 'true' && secureRaw !== 'false') {
    throw new Error('SMTP_SECURE must be "true" or "false"')
  }
  const secure = secureRaw === 'true'

  const timeouts = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 }

  // Local plaintext mode (for Mailpit): needs the flag, a local host name AND
  // the local Supabase stack. Otherwise the flag is ignored and TLS stays required.
  if (
    get('SMTP_ALLOW_PLAINTEXT') === 'true' &&
    !secure &&
    isLocalHost(host) &&
    isLocalStack(get('SUPABASE_URL'))
  ) {
    // Mailpit does not advertise AUTH, so no credentials are sent.
    return {
      options: { host, port, secure: false, requireTLS: false, ignoreTLS: true, ...timeouts },
      fromAddress: user,
      fromName,
    }
  }

  const pass = need('SMTP_PASS')
  return {
    options: { host, port, secure, requireTLS: !secure, auth: { user, pass }, ...timeouts },
    fromAddress: user,
    fromName,
  }
}
