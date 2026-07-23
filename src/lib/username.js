// Supabase Auth always needs an email under the hood, but we don't want
// people to have to type (or mistype) a real email address just to log in.
// So every account gets a synthetic, never-delivered email built from its
// username, e.g. "ivan.petrov" -> "ivan.petrov@clientdb.local". This is
// completely invisible to the person using the app.

export const SYNTHETIC_DOMAIN = 'clientdb.local'

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/

export function isValidUsername(username) {
  return USERNAME_PATTERN.test((username || '').trim())
}

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_DOMAIN}`
}

// Login accepts either a username (new accounts) or a real email
// (accounts created before this feature existed) - if the typed value
// contains "@", treat it as a literal email; otherwise convert it.
export function resolveLoginEmail(identifier) {
  const trimmed = (identifier || '').trim()
  if (trimmed.includes('@')) return trimmed.toLowerCase()
  return usernameToEmail(trimmed)
}

// Bulgarian -> Latin transliteration (official streamlined system used on
// Bulgarian ID documents), so a client's Cyrillic name can become a valid
// username automatically.
const CYRILLIC_TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht',
  ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
}

export function transliterate(text) {
  return (text || '')
    .toLowerCase()
    .split('')
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9.-]/g, '')
}

// Client-side PREVIEW only (shown while typing) - the server is the source
// of truth and will append a number if this exact username is already taken.
export function generateUsernamePreview(firstName, lastName) {
  const first = transliterate(firstName)
  const last = transliterate(lastName)
  return [first, last].filter(Boolean).join('.')
}
