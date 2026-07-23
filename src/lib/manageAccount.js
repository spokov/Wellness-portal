import { supabase } from './supabaseClient.js'

const REFRESH_WINDOW_MS = 60_000

async function getAccessToken(forceRefresh = false) {
  const result = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession()

  if (result.error) throw result.error

  const session = result.data.session
  if (!session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.')
  }

  const expiresAtMs = Number(session.expires_at || 0) * 1000
  if (!forceRefresh && expiresAtMs && expiresAtMs - Date.now() < REFRESH_WINDOW_MS) {
    return getAccessToken(true)
  }

  return session.access_token
}

async function requestManageAccount(token, body) {
  let response
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('The account service could not be reached. Check your internet connection.')
  }

  const text = await response.text()
  let payload = {}
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = {}
  }

  return { response, payload, text }
}

function isRetryableAuthError(status, payload, text) {
  if (status !== 401) return false
  const message = String(payload?.error || payload?.message || text || '').toLowerCase()
  return message.includes('jwt') || message.includes('token') || message.includes('authenticated')
}

export async function callManageAccount(body) {
  let token = await getAccessToken()
  let result = await requestManageAccount(token, body)

  // A signing-key rotation can leave an older access token in browser storage.
  // Refresh once and retry; persistent JWT errors then point to Edge Function
  // deployment/configuration rather than to the current user session.
  if (isRetryableAuthError(result.response.status, result.payload, result.text)) {
    token = await getAccessToken(true)
    result = await requestManageAccount(token, body)
  }

  if (!result.response.ok) {
    throw new Error(
      result.payload.error ||
        result.payload.message ||
        `Account service request failed (${result.response.status})`
    )
  }

  return result.payload
}
