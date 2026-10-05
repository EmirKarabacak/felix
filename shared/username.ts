// Felix signs people in by username. Supabase identifies accounts by email,
// so each username maps to a private address that never receives mail.
export const LOGIN_DOMAIN = 'felix.local'

const TR: Record<string, string> = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
}

/** Turns anything typed into a valid username: lowercase ascii, digits, . _ - */
export function normalizeUsername(input: string): string {
  return input
    .trim()
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => TR[c] ?? c)
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40)
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]{3,40}$/.test(username)
}

export function usernameToEmail(username: string): string {
  return `${username}@${LOGIN_DOMAIN}`
}

/** What the sign-in form sends: a real email as typed, or a username mapped to its address. */
export function loginIdToEmail(typed: string): string {
  const value = typed.trim()
  return value.includes('@') ? value.toLowerCase() : usernameToEmail(normalizeUsername(value))
}

export const MIN_PASSWORD_LENGTH = 6

/**
 * Supabase's dashboard shows the project address in several forms, some with
 * "/rest/v1/" on the end. The client needs only the base address, so anything
 * after the host is dropped.
 */
export function baseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).origin
  } catch {
    return trimmed
  }
}
