import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SYNTHETIC_DOMAIN = 'clientdb.local'
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/
const MIN_PASSWORD_LENGTH = 8

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht',
  ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
}

function corsHeaders(req: Request) {
  const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*'
  const requestOrigin = req.headers.get('Origin') || '*'
  const origin = allowedOrigin === '*' || allowedOrigin === requestOrigin ? requestOrigin : allowedOrigin

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function transliterate(text: string) {
  return (text || '')
    .toLowerCase()
    .split('')
    .map((character) => CYRILLIC_TO_LATIN[character] ?? character)
    .join('')
    .replace(/[^a-z0-9.-]/g, '')
}

function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_DOMAIN}`
}

async function generateUniqueUsername(adminClient: any, firstName: string, lastName: string) {
  const first = transliterate(firstName)
  const last = transliterate(lastName)
  const base = [first, last].filter(Boolean).join('.').slice(0, 34) || 'client'

  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}${suffix}`
    const { data, error } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('username', candidate)
      .maybeSingle()

    if (error) throw error
    if (!data) return candidate
  }

  throw new Error('Could not generate a unique username')
}

async function isAncestor(adminClient: any, callerId: string, targetId: string) {
  const { data, error } = await adminClient.rpc('is_ancestor_of', {
    ancestor: callerId,
    target: targetId,
  })
  if (error) throw error
  return Boolean(data)
}

async function canManageAccount(
  adminClient: any,
  callerRole: string,
  callerId: string,
  targetUserId: string
) {
  if (callerRole === 'admin') return true
  if (targetUserId === callerId) return true
  return isAncestor(adminClient, callerId, targetUserId)
}

async function canManageClient(
  adminClient: any,
  callerRole: string,
  callerId: string,
  ownerId: string | null
) {
  if (callerRole === 'admin' || ownerId === callerId) return true
  if (!ownerId) return false
  return isAncestor(adminClient, callerId, ownerId)
}

async function prepareAccountDeletion(
  adminClient: any,
  targetUserId: string,
  fallbackOwnerId: string,
  linkedClientId?: string | null
) {
  const { error: clientsError } = await adminClient
    .from('clients')
    .update({ owner_id: fallbackOwnerId })
    .eq('owner_id', targetUserId)
  if (clientsError) throw clientsError

  const { error: hierarchyError } = await adminClient
    .from('profiles')
    .update({ created_by: fallbackOwnerId })
    .eq('created_by', targetUserId)
  if (hierarchyError) throw hierarchyError

  let unlinkQuery = adminClient.from('clients').update({ user_id: null }).eq('user_id', targetUserId)
  if (linkedClientId) unlinkQuery = unlinkQuery.eq('id', linkedClientId)
  const { error: unlinkError } = await unlinkQuery
  if (unlinkError) throw unlinkError
}


const BACKUP_FORMAT = 'wellness-portal-backup'
const BACKUP_VERSION = 1
const PAGE_SIZE = 1000

async function fetchAllRows(adminClient: any, table: string) {
  const rows: any[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await adminClient
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

async function upsertRows(adminClient: any, table: string, rows: any[]) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const batch = rows.slice(offset, offset + 500)
    if (!batch.length) continue
    const { error } = await adminClient.from(table).upsert(batch)
    if (error) throw error
  }
}

async function deleteAllRows(adminClient: any, table: string) {
  const { error } = await adminClient.from(table).delete().not('id', 'is', null)
  if (error) throw error
}

async function listAllAuthUsers(adminClient: any) {
  const users: any[] = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw error
    const batch = data?.users || []
    users.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return users
}

async function listStorageObjects(adminClient: any, prefix = ''): Promise<any[]> {
  const objects: any[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await adminClient.storage
      .from('client-photos')
      .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    const batch = data || []

    for (const item of batch) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id) {
        objects.push({ path, metadata: item.metadata || {} })
      } else {
        objects.push(...await listStorageObjects(adminClient, path))
      }
    }

    if (batch.length < PAGE_SIZE) break
  }
  return objects
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function backupPhotos(adminClient: any) {
  const objects = await listStorageObjects(adminClient)
  const photos: any[] = []

  for (const object of objects) {
    const { data, error } = await adminClient.storage.from('client-photos').download(object.path)
    if (error) throw error
    const bytes = new Uint8Array(await data.arrayBuffer())
    photos.push({
      path: object.path,
      content_type: data.type || object.metadata?.mimetype || 'application/octet-stream',
      base64: bytesToBase64(bytes),
    })
  }

  return photos
}

function makeTemporaryPassword() {
  const random = crypto.getRandomValues(new Uint8Array(18))
  return `Wp!${bytesToBase64(random).replace(/[^a-zA-Z0-9]/g, '').slice(0, 22)}9a`
}

function sanitizeAuthUser(user: any) {
  return {
    id: user.id,
    email: user.email || null,
    phone: user.phone || null,
    app_metadata: user.app_metadata || {},
    user_metadata: user.user_metadata || {},
    email_confirmed_at: user.email_confirmed_at || null,
    phone_confirmed_at: user.phone_confirmed_at || null,
    banned_until: user.banned_until || null,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
  }
}

async function createFullBackup(adminClient: any) {
  const [authUsers, profiles, clients, parameters, entries, photos] = await Promise.all([
    listAllAuthUsers(adminClient),
    fetchAllRows(adminClient, 'profiles'),
    fetchAllRows(adminClient, 'clients'),
    fetchAllRows(adminClient, 'parameters'),
    fetchAllRows(adminClient, 'parameter_entries'),
    backupPhotos(adminClient),
  ])

  const profileIds = new Set(profiles.map((profile: any) => profile.id))

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app_version: '2.5.0',
    created_at: new Date().toISOString(),
    auth_users: authUsers.filter((user: any) => profileIds.has(user.id)).map(sanitizeAuthUser),
    tables: {
      profiles,
      clients,
      parameters,
      parameter_entries: entries,
    },
    storage: {
      client_photos: photos,
    },
    password_note: 'Password hashes are not exposed by the Supabase Admin API. Existing accounts keep their passwords when restored in the same project; missing accounts receive temporary passwords.',
  }
}

async function restoreFullBackup(
  adminClient: any,
  backup: any,
  callerId: string,
  replaceAccounts: boolean
) {
  if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
    throw new Error('Invalid or unsupported Wellness Portal backup file')
  }

  const authUsers = Array.isArray(backup.auth_users) ? backup.auth_users : []
  const profiles = Array.isArray(backup.tables?.profiles) ? backup.tables.profiles : []
  const clients = Array.isArray(backup.tables?.clients) ? backup.tables.clients : []
  const parameters = (Array.isArray(backup.tables?.parameters) ? backup.tables.parameters : [])
    .map((parameter: any) => ({
      ...parameter,
      name_en: String(parameter?.name_en || parameter?.name || '').trim(),
    }))
  const entries = Array.isArray(backup.tables?.parameter_entries) ? backup.tables.parameter_entries : []
  const photos = Array.isArray(backup.storage?.client_photos) ? backup.storage.client_photos : []

  if (!profiles.length || !authUsers.length) throw new Error('The backup does not contain account data')

  const authIds = new Set(authUsers.map((user: any) => user.id))
  const profileIds = new Set(profiles.map((profile: any) => profile.id))
  const clientIds = new Set(clients.map((client: any) => client.id))
  const parameterIds = new Set(parameters.map((parameter: any) => parameter.id))

  if (profiles.some((profile: any) => !authIds.has(profile.id))) {
    throw new Error('The backup contains a profile without a matching Auth account')
  }
  if (profiles.some((profile: any) => profile.created_by && !profileIds.has(profile.created_by))) {
    throw new Error('The backup contains an invalid account hierarchy')
  }
  if (clients.some((client: any) =>
    (client.owner_id && !profileIds.has(client.owner_id))
    || (client.user_id && !profileIds.has(client.user_id))
  )) {
    throw new Error('The backup contains invalid client-account links')
  }
  if (entries.some((entry: any) =>
    !clientIds.has(entry.client_id) || !parameterIds.has(entry.parameter_id)
  )) {
    throw new Error('The backup contains invalid measurement links')
  }
  if (photos.some((photo: any) =>
    typeof photo?.path !== 'string'
    || photo.path.includes('..')
    || typeof photo?.base64 !== 'string'
  )) {
    throw new Error('The backup contains an invalid photo entry')
  }

  const currentUsers = await listAllAuthUsers(adminClient)
  const currentProfiles = await fetchAllRows(adminClient, 'profiles')
  const currentById = new Map(currentUsers.map((user: any) => [user.id, user]))
  const currentByEmail = new Map(
    currentUsers
      .filter((user: any) => user.email)
      .map((user: any) => [String(user.email).toLowerCase(), user])
  )
  const oldProfileById = new Map(profiles.map((profile: any) => [profile.id, profile]))
  const idMap = new Map<string, string>()
  const generatedCredentials: any[] = []
  const callerUser = currentById.get(callerId)
  const callerIsInBackup = authUsers.some((oldUser: any) =>
    oldUser.id === callerId
    || (callerUser?.email && oldUser.email && String(callerUser.email).toLowerCase() === String(oldUser.email).toLowerCase())
  )
  if (!callerIsInBackup) throw new Error('The current administrator is not present in this backup')

  for (const oldUser of authUsers) {
    const existing = currentById.get(oldUser.id)
      || (oldUser.email ? currentByEmail.get(String(oldUser.email).toLowerCase()) : null)

    if (existing) {
      idMap.set(oldUser.id, existing.id)
      const safeAppMetadata = { ...(oldUser.app_metadata || {}) }
      delete safeAppMetadata.provider
      delete safeAppMetadata.providers
      const updateAttributes: any = {
        user_metadata: oldUser.user_metadata || {},
      }
      if (Object.keys(safeAppMetadata).length) {
        updateAttributes.app_metadata = { ...(existing.app_metadata || {}), ...safeAppMetadata }
      }
      const { error: updateExistingError } = await adminClient.auth.admin.updateUserById(
        existing.id,
        updateAttributes
      )
      if (updateExistingError) throw updateExistingError
      continue
    }

    const temporaryPassword = makeTemporaryPassword()
    const attributes: any = {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: oldUser.user_metadata || {},
    }
    if (oldUser.email) attributes.email = oldUser.email
    else if (oldUser.phone) {
      attributes.phone = oldUser.phone
      attributes.phone_confirm = true
    } else {
      throw new Error(`Cannot restore account ${oldUser.id}: no email or phone`)
    }

    const { data, error } = await adminClient.auth.admin.createUser(attributes)
    if (error) throw error
    const newUser = data.user
    idMap.set(oldUser.id, newUser.id)

    if (oldUser.app_metadata && Object.keys(oldUser.app_metadata).length) {
      const safeAppMetadata = { ...oldUser.app_metadata }
      delete safeAppMetadata.provider
      delete safeAppMetadata.providers
      if (Object.keys(safeAppMetadata).length) {
        const { error: metadataError } = await adminClient.auth.admin.updateUserById(newUser.id, {
          app_metadata: safeAppMetadata,
        })
        if (metadataError) throw metadataError
      }
    }

    const oldProfile = oldProfileById.get(oldUser.id)
    generatedCredentials.push({
      username: oldProfile?.username || oldUser.email || oldUser.phone,
      email: oldUser.email || null,
      temporary_password: temporaryPassword,
    })
  }

  const mappedCaller = idMap.get(callerId) || callerId
  const restoredUserIds = new Set(Array.from(idMap.values()))
  if (!restoredUserIds.has(mappedCaller)) {
    throw new Error('The current administrator could not be mapped to the backup')
  }

  const usersToDelete: string[] = []
  if (replaceAccounts) {
    const currentAppProfileIds = new Set(currentProfiles.map((profile: any) => profile.id))
    for (const currentUser of currentUsers) {
      if (
        currentUser.id !== callerId
        && currentAppProfileIds.has(currentUser.id)
        && !restoredUserIds.has(currentUser.id)
      ) {
        usersToDelete.push(currentUser.id)
      }
    }
  }

  await deleteAllRows(adminClient, 'parameter_entries')
  await deleteAllRows(adminClient, 'clients')
  await deleteAllRows(adminClient, 'profiles')
  await deleteAllRows(adminClient, 'parameters')

  for (const userId of usersToDelete) {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) throw error
  }

  const mappedProfiles = profiles.map((profile: any) => ({
    ...profile,
    id: idMap.get(profile.id) || profile.id,
    created_by: null,
  }))
  await upsertRows(adminClient, 'profiles', mappedProfiles)

  for (const profile of profiles) {
    if (!profile.created_by) continue
    const mappedId = idMap.get(profile.id) || profile.id
    const mappedParent = idMap.get(profile.created_by) || profile.created_by
    const { error } = await adminClient.from('profiles').update({ created_by: mappedParent }).eq('id', mappedId)
    if (error) throw error
  }

  await upsertRows(adminClient, 'parameters', parameters)

  const mappedClients = clients.map((client: any) => ({
    ...client,
    owner_id: client.owner_id ? (idMap.get(client.owner_id) || client.owner_id) : null,
    user_id: client.user_id ? (idMap.get(client.user_id) || client.user_id) : null,
  }))
  await upsertRows(adminClient, 'clients', mappedClients)
  await upsertRows(adminClient, 'parameter_entries', entries)

  const existingObjects = await listStorageObjects(adminClient)
  for (let offset = 0; offset < existingObjects.length; offset += 100) {
    const paths = existingObjects.slice(offset, offset + 100).map((item: any) => item.path)
    if (!paths.length) continue
    const { error } = await adminClient.storage.from('client-photos').remove(paths)
    if (error) throw error
  }

  for (const photo of photos) {
    if (!photo?.path || !photo?.base64) continue
    const { error } = await adminClient.storage.from('client-photos').upload(
      photo.path,
      base64ToBytes(photo.base64),
      { contentType: photo.content_type || 'application/octet-stream', upsert: true }
    )
    if (error) throw error
  }

  return {
    generated_credentials: generatedCredentials,
    counts: {
      accounts: mappedProfiles.length,
      clients: mappedClients.length,
      parameters: parameters.length,
      entries: entries.length,
      photos: photos.length,
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Server configuration is incomplete')

    const authHeader = req.headers.get('Authorization') || ''
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: caller },
      error: authError,
    } = await callerClient.auth.getUser()
    if (authError || !caller) return json(req, { error: 'Not authenticated' }, 401)

    const { data: callerProfile, error: callerProfileError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfileError || !callerProfile || !['admin', 'trainer'].includes(callerProfile.role)) {
      return json(req, { error: 'Not allowed' }, 403)
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const body = await req.json()
    const action = body.action || 'create'


    if (action === 'backup_all') {
      if (callerProfile.role !== 'admin') return json(req, { error: 'Administrator access required' }, 403)
      const backup = await createFullBackup(adminClient)
      return json(req, { ok: true, backup })
    }

    if (action === 'restore_all') {
      if (callerProfile.role !== 'admin') return json(req, { error: 'Administrator access required' }, 403)
      const result = await restoreFullBackup(
        adminClient,
        body.backup,
        caller.id,
        body.replace_accounts !== false
      )
      return json(req, { ok: true, ...result })
    }

    if (action === 'delete_client_photo') {
      const clientId = String(body.client_id || '')
      const photoPath = String(body.photo_path || '')
      if (!clientId || !photoPath) return json(req, { error: 'Missing client_id/photo_path' }, 400)

      const { data: client, error: clientError } = await adminClient
        .from('clients')
        .select('id, owner_id, photo_path')
        .eq('id', clientId)
        .single()
      if (clientError) throw clientError

      const allowed = await canManageClient(
        adminClient,
        callerProfile.role,
        caller.id,
        client.owner_id
      )
      if (!allowed) return json(req, { error: 'Not allowed to delete this photo' }, 403)

      const isCurrentPath = client.photo_path === photoPath
      const isScopedPath = photoPath.startsWith(`${client.id}/`)
      const isLegacyRootPath = !photoPath.includes('/') && !photoPath.includes('..')
      if (!isCurrentPath && !isScopedPath && !isLegacyRootPath) {
        return json(req, { error: 'Invalid photo path' }, 400)
      }

      const { error: removeError } = await adminClient.storage
        .from('client-photos')
        .remove([photoPath])
      if (removeError) throw removeError

      return json(req, { ok: true })
    }

    if (action === 'delete_client') {
      const clientId = String(body.client_id || '')
      if (!clientId) return json(req, { error: 'Missing client_id' }, 400)

      const { data: client, error: clientError } = await adminClient
        .from('clients')
        .select('id, owner_id, user_id, photo_path')
        .eq('id', clientId)
        .single()
      if (clientError) throw clientError

      const allowed = await canManageClient(
        adminClient,
        callerProfile.role,
        caller.id,
        client.owner_id
      )
      if (!allowed) return json(req, { error: 'Not allowed to delete this client' }, 403)

      if (client.user_id) {
        const { data: targetProfile, error: targetError } = await adminClient
          .from('profiles')
          .select('created_by')
          .eq('id', client.user_id)
          .single()
        if (targetError) throw targetError

        const fallbackOwner = targetProfile.created_by || client.owner_id || caller.id
        await prepareAccountDeletion(adminClient, client.user_id, fallbackOwner, client.id)

        const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(client.user_id)
        if (authDeleteError) {
          await adminClient.from('clients').update({ user_id: client.user_id }).eq('id', client.id)
          throw authDeleteError
        }
      }

      const { error: deleteClientError } = await adminClient.from('clients').delete().eq('id', client.id)
      if (deleteClientError) throw deleteClientError

      if (client.photo_path) {
        await adminClient.storage.from('client-photos').remove([client.photo_path])
      }

      return json(req, { ok: true })
    }

    if (action === 'delete') {
      const targetUserId = String(body.user_id || '')
      if (!targetUserId) return json(req, { error: 'Missing user_id' }, 400)
      if (targetUserId === caller.id) return json(req, { error: 'You cannot delete your own account' }, 400)

      const allowed = await canManageAccount(
        adminClient,
        callerProfile.role,
        caller.id,
        targetUserId
      )
      if (!allowed) return json(req, { error: 'Not allowed to delete this account' }, 403)

      const { data: target, error: targetError } = await adminClient
        .from('profiles')
        .select('role, created_by')
        .eq('id', targetUserId)
        .single()
      if (targetError) throw targetError
      if (target.role === 'client') {
        return json(req, { error: 'Delete client accounts from the client roster' }, 400)
      }
      if (target.role === 'admin' && callerProfile.role !== 'admin') {
        return json(req, { error: 'Only an administrator can delete an administrator' }, 403)
      }

      const fallbackOwner = target.created_by || caller.id
      await prepareAccountDeletion(adminClient, targetUserId, fallbackOwner)

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId)
      if (deleteError) throw deleteError
      return json(req, { ok: true })
    }

    if (action === 'reset_password') {
      const targetUserId = String(body.user_id || '')
      const newPassword = String(body.new_password || '')
      if (!targetUserId || !newPassword) return json(req, { error: 'Missing fields' }, 400)
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return json(req, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
      }

      const allowed = await canManageAccount(
        adminClient,
        callerProfile.role,
        caller.id,
        targetUserId
      )
      if (!allowed) return json(req, { error: 'Not allowed to change this password' }, 403)

      const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      })
      if (updateError) throw updateError
      return json(req, { ok: true })
    }

    if (action === 'change_role') {
      const targetUserId = String(body.user_id || '')
      const newRole = String(body.new_role || '')
      if (!targetUserId || !newRole) return json(req, { error: 'Missing fields' }, 400)
      if (targetUserId === caller.id) return json(req, { error: 'You cannot change your own role' }, 400)
      if (!['trainer', 'client'].includes(newRole)) {
        return json(req, { error: 'Can only switch between trainer and client' }, 400)
      }

      const allowed = await canManageAccount(
        adminClient,
        callerProfile.role,
        caller.id,
        targetUserId
      )
      if (!allowed) return json(req, { error: 'Not allowed to change this account' }, 403)

      const { data: target, error: targetError } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single()
      if (targetError) throw targetError
      if (target.role === 'admin') return json(req, { error: 'Cannot change an administrator role' }, 403)
      if (target.role === newRole) return json(req, { ok: true })

      const { data: linkedClientId, error: roleError } = await adminClient.rpc(
        'change_account_role',
        {
          p_target_user_id: targetUserId,
          p_new_role: newRole,
          p_fallback_owner_id: caller.id,
        }
      )
      if (roleError) throw roleError

      return json(req, { ok: true, client_id: linkedClientId })
    }

    if (action !== 'create') return json(req, { error: 'Unknown action' }, 400)

    const role = String(body.role || '')
    const password = String(body.password || '')
    if (!role || !password) return json(req, { error: 'Missing required fields' }, 400)
    if (!['trainer', 'client', 'admin'].includes(role)) return json(req, { error: 'Invalid role' }, 400)
    if (callerProfile.role === 'trainer' && role === 'admin') {
      return json(req, { error: 'Trainers cannot create administrator accounts' }, 403)
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return json(req, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
    }

    let finalUsername = ''
    let fullName = String(body.full_name || '').trim()

    if (role === 'client') {
      const firstName = String(body.first_name || '').trim()
      const lastName = String(body.last_name || '').trim()
      if (!firstName || !lastName) return json(req, { error: 'Missing first_name/last_name' }, 400)
      finalUsername = await generateUniqueUsername(adminClient, firstName, lastName)
      fullName = `${firstName} ${lastName}`
    } else {
      finalUsername = String(body.username || '').trim().toLowerCase()
      if (!USERNAME_PATTERN.test(finalUsername)) {
        return json(req, { error: 'Username must be 3-40 characters: letters, digits, dot, underscore, hyphen' }, 400)
      }
      if (!fullName) return json(req, { error: 'Full name is required' }, 400)
    }

    const email = usernameToEmail(finalUsername)
    let newUserId: string | null = null
    let newClientId: string | null = null

    try {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (createError) throw createError
      newUserId = created.user.id

      const { error: profileError } = await adminClient.from('profiles').insert({
        id: newUserId,
        role,
        full_name: fullName || null,
        username: finalUsername,
        email,
        created_by: caller.id,
      })
      if (profileError) throw profileError

      if (role === 'client' || role === 'trainer') {
        const { data: clientRow, error: clientError } = await adminClient
          .from('clients')
          .insert({ full_name: fullName, owner_id: caller.id, user_id: newUserId })
          .select('id')
          .single()
        if (clientError) throw clientError
        newClientId = clientRow.id
      }
    } catch (createFailure) {
      if (newClientId) await adminClient.from('clients').delete().eq('id', newClientId)
      if (newUserId) await adminClient.auth.admin.deleteUser(newUserId)
      throw createFailure
    }

    return json(req, {
      ok: true,
      user_id: newUserId,
      client_id: newClientId,
      username: finalUsername,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('manage-account error:', message)
    return json(req, { error: message }, 400)
  }
})
