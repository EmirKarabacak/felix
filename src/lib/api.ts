import { supabase } from './supabase'

/** Calls one of Felix's own server endpoints as the signed-in person. */
export async function callApi(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  let payload: Record<string, unknown> = {}
  try {
    payload = await response.json()
  } catch {
    // A non-JSON reply means the endpoint itself is missing or crashed.
  }
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string' ? payload.error : `Sunucu hatası (${response.status}).`,
    )
  }
  return payload
}
