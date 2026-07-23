import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { callManageAccount } from './manageAccount.js'

const BUCKET = 'client-photos'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const signedUrlCache = new Map()

export function validateClientPhoto(file) {
  if (!file) return null
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return 'type'
  if (file.size > MAX_IMAGE_BYTES) return 'size'
  return null
}

function extensionFor(file) {
  const byType = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  return byType[file.type] || 'jpg'
}

export async function uploadClientPhoto(clientId, file) {
  const path = `${clientId}/${crypto.randomUUID()}.${extensionFor(file)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function removeClientPhoto(path) {
  if (!path) return
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
  signedUrlCache.delete(path)
}

export async function removeManagedClientPhoto(clientId, path) {
  if (!clientId || !path) return
  await callManageAccount({
    action: 'delete_client_photo',
    client_id: clientId,
    photo_path: path,
  })
  signedUrlCache.delete(path)
}

async function createSignedPhotoUrl(path) {
  const cached = signedUrlCache.get(path)
  if (cached && cached.expiresAt > Date.now()) return cached.url

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error) throw error

  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + 50 * 60 * 1000,
  })
  return data.signedUrl
}

export function useClientPhotoUrl(client) {
  const [url, setUrl] = useState(client?.photo_path ? null : client?.photo_url || null)

  useEffect(() => {
    let active = true
    const path = client?.photo_path

    if (!path) {
      setUrl(client?.photo_url || null)
      return () => {
        active = false
      }
    }

    setUrl(null)
    createSignedPhotoUrl(path)
      .then((signedUrl) => {
        if (active) setUrl(signedUrl)
      })
      .catch(() => {
        if (active) setUrl(client?.photo_url || null)
      })

    return () => {
      active = false
    }
  }, [client?.photo_path, client?.photo_url])

  return url
}
