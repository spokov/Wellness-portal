import { supabase } from './supabaseClient.js'

export async function callManageAccount(body) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError

  const token = sessionData.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')

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

  if (!response.ok) {
    throw new Error(payload.error || `Account service request failed (${response.status})`)
  }

  return payload
}
