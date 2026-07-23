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

      const newOwner = target.created_by || caller.id

      if (newRole === 'client') {
        const { error: reassignError } = await adminClient
          .from('clients')
          .update({ owner_id: newOwner })
          .eq('owner_id', targetUserId)
        if (reassignError) throw reassignError

        const { error: reassignChildrenError } = await adminClient
          .from('profiles')
          .update({ created_by: newOwner })
          .eq('created_by', targetUserId)
        if (reassignChildrenError) throw reassignChildrenError
      }

      const { data: existingOwnClient, error: ownClientError } = await adminClient
        .from('clients')
        .select('id')
        .eq('user_id', targetUserId)
        .maybeSingle()
      if (ownClientError) throw ownClientError

      if (existingOwnClient) {
        const { error: syncClientError } = await adminClient
          .from('clients')
          .update({
            full_name: target.full_name || target.username,
            owner_id: newOwner,
          })
          .eq('id', existingOwnClient.id)
        if (syncClientError) throw syncClientError
      } else {
        const { error: createClientError } = await adminClient.from('clients').insert({
          full_name: target.full_name || target.username,
          owner_id: newOwner,
          user_id: targetUserId,
        })
        if (createClientError) throw createClientError
      }

      const { error: roleError } = await adminClient
        .from('profiles')
        .update({ role: newRole })
        .eq('id', targetUserId)
      if (roleError) throw roleError
      return json(req, { ok: true })
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
