import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useAuth } from '../lib/auth.jsx'
import { useLanguage } from '../lib/i18n.jsx'
import { callManageAccount } from '../lib/manageAccount.js'
import Modal from '../components/Modal.jsx'
import StatusMessage from '../components/StatusMessage.jsx'
import { printElement } from '../lib/print.js'

const ROLE_ICON = { admin: '👑', trainer: '🧑‍🏫', client: '🧍' }
const ROLE_LABEL_KEY = { admin: 'roleAdmin', trainer: 'roleTrainer', client: 'roleClient' }

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase()
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function getDescendantIds(id, childrenOf) {
  const result = new Set()
  const stack = [...(childrenOf.get(id) || [])]
  while (stack.length) {
    const node = stack.pop()
    if (result.has(node.id)) continue
    result.add(node.id)
    stack.push(...(childrenOf.get(node.id) || []))
  }
  return result
}

function clientCompleteness(client) {
  return [
    client.phone,
    client.email,
    client.address,
    client.birth_date,
    client.height_cm,
    client.notes,
    client.photo_path,
    client.photo_url,
  ].filter((value) => value !== null && value !== undefined && String(value).trim() !== '').length
}

function chooseCanonicalClient(group) {
  return [...group].sort((a, b) => {
    const completenessDifference = clientCompleteness(b) - clientCompleteness(a)
    if (completenessDifference !== 0) return completenessDifference
    return String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id))
  })[0]
}

function hasMeaningfulClientDetails(client) {
  return [
    client.phone,
    client.address,
    client.birth_date,
    client.height_cm,
    client.notes,
    client.photo_path,
    client.photo_url,
  ].some((value) => value !== null && value !== undefined && String(value).trim() !== '')
}

function isLikelyShadowClient(candidate, linkedClient) {
  if (!linkedClient) return false

  const samePhone = normalizePhone(candidate.phone)
    && normalizePhone(candidate.phone) === normalizePhone(linkedClient.phone)
  const sameEmail = normalizeText(candidate.email)
    && normalizeText(candidate.email) === normalizeText(linkedClient.email)
  if (samePhone || sameEmail) return true

  const linkedIsMinimal = !hasMeaningfulClientDetails(linkedClient)
  const candidateIsOlder = !linkedClient.created_at
    || !candidate.created_at
    || String(candidate.created_at) <= String(linkedClient.created_at)

  return linkedIsMinimal && candidateIsOlder
}

export default function Hierarchy() {
  const { session } = useAuth()
  const { t } = useLanguage()
  const [profiles, setProfiles] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [moveNode, setMoveNode] = useState(null)
  const [roleNode, setRoleNode] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    const [profileResult, clientResult] = await Promise.all([
      supabase.from('profiles').select('id, role, full_name, username, created_by'),
      supabase
        .from('clients')
        .select('id, full_name, phone, email, address, birth_date, height_cm, notes, photo_path, photo_url, owner_id, user_id, created_at'),
    ])

    if (profileResult.error || clientResult.error) {
      setError((profileResult.error || clientResult.error).message)
    } else {
      setProfiles(profileResult.data || [])
      setClients(clientResult.data || [])
    }
    setLoading(false)
  }

  const tree = useMemo(() => buildTreeData(profiles, clients), [profiles, clients])

  async function handleMoveConfirm(newParentId) {
    if (!moveNode) return false
    setError('')

    if (moveNode.type === 'client') {
      const result = await supabase.from('clients').update({ owner_id: newParentId }).eq('id', moveNode.id)
      if (result.error) {
        setError(result.error.message)
        return false
      }
    } else {
      const profileResult = await supabase.from('profiles').update({ created_by: newParentId }).eq('id', moveNode.id)
      if (profileResult.error) {
        setError(profileResult.error.message)
        return false
      }

      const clientResult = await supabase.from('clients').update({ owner_id: newParentId }).eq('user_id', moveNode.id)
      if (clientResult.error) {
        setError(clientResult.error.message)
        return false
      }
    }

    setMoveNode(null)
    await load()
    return true
  }

  async function handleRoleChanged() {
    setRoleNode(null)
    await load()
  }

  return (
    <div>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t('navHierarchy')}</p>
          <h1 className="page-title">{t('hierarchyTitle')}</h1>
          <p className="page-subtitle max-w-3xl">{t('hierarchyDescription')}</p>
        </div>
        <div className="no-print flex gap-2">
          <button type="button" onClick={load} disabled={loading} className="btn-secondary">
            {t('refresh')}
          </button>
          <button type="button" onClick={() => printElement('hierarchy-print-area')} className="btn-primary">
            {t('printButton')}
          </button>
        </div>
      </header>

      <StatusMessage type="error" className="mb-4">{error}</StatusMessage>

      {loading ? (
        <div className="h-80 animate-pulse rounded-xl border border-line bg-card" />
      ) : tree.roots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line py-16 text-center">
          <p className="font-display text-ink-soft">{t('noStructureYet')}</p>
        </div>
      ) : (
        <section id="hierarchy-print-area" className="printable-area print-flow overflow-x-auto rounded-xl border border-line bg-card p-4 shadow-sm sm:p-6">
          <div className="min-w-[520px]">
            {tree.roots.map((root) => (
              <TreeNode
                key={root.id}
                profile={root}
                childrenOf={tree.childrenOf}
                clientsOf={tree.clientsOf}
                currentUserId={session?.user?.id}
                t={t}
                onMove={setMoveNode}
                onRoleChange={setRoleNode}
              />
            ))}
          </div>
        </section>
      )}

      <MoveModal
        moveNode={moveNode}
        staff={tree.staff}
        childrenOf={tree.childrenOf}
        onClose={() => setMoveNode(null)}
        onConfirm={handleMoveConfirm}
        t={t}
      />

      <RoleChangeModal
        node={roleNode}
        onClose={() => setRoleNode(null)}
        onDone={handleRoleChanged}
        t={t}
      />
    </div>
  )
}

function buildTreeData(profiles, clients) {
  const linkedGroups = new Map()

  for (const client of clients) {
    if (!client.user_id) continue
    if (!linkedGroups.has(client.user_id)) linkedGroups.set(client.user_id, [])
    linkedGroups.get(client.user_id).push(client)
  }

  const linkedClientByUserId = new Map()
  for (const [userId, group] of linkedGroups) {
    linkedClientByUserId.set(userId, chooseCanonicalClient(group))
  }

  const staff = profiles.filter((profile) => profile.role === 'admin' || profile.role === 'trainer')
  const staffIds = new Set(staff.map((profile) => profile.id))
  const childrenOf = new Map()

  const enrichedStaff = staff.map((profile) => ({
    ...profile,
    client: linkedClientByUserId.get(profile.id) || null,
  }))
  const enrichedStaffById = new Map(enrichedStaff.map((profile) => [profile.id, profile]))

  for (const profile of enrichedStaff) {
    if (profile.created_by && staffIds.has(profile.created_by)) {
      if (!childrenOf.has(profile.created_by)) childrenOf.set(profile.created_by, [])
      childrenOf.get(profile.created_by).push(profile)
    }
  }

  for (const children of childrenOf.values()) {
    children.sort((a, b) => String(a.full_name || a.username).localeCompare(String(b.full_name || b.username)))
  }

  const clientsOf = new Map()
  const addClientNode = (ownerId, clientNode) => {
    if (!ownerId || !staffIds.has(ownerId)) return
    if (!clientsOf.has(ownerId)) clientsOf.set(ownerId, [])
    clientsOf.get(ownerId).push(clientNode)
  }

  // Client accounts are represented exactly once, through their canonical linked client record.
  for (const profile of profiles) {
    if (profile.role !== 'client') continue
    const linkedClient = linkedClientByUserId.get(profile.id) || null
    const ownerId = linkedClient?.owner_id || profile.created_by

    addClientNode(ownerId, {
      ...(linkedClient || {}),
      id: linkedClient?.id || `account-${profile.id}`,
      client_id: linkedClient?.id || null,
      user_id: profile.id,
      full_name: profile.full_name || linkedClient?.full_name || profile.username,
      username: profile.username,
      role: 'client',
      owner_id: ownerId,
      isAccount: true,
    })
  }

  const linkedSignatureMap = new Map()
  for (const profile of profiles) {
    const linkedClient = linkedClientByUserId.get(profile.id)
    if (!linkedClient) continue
    const signature = `${linkedClient.owner_id || profile.created_by || ''}|${normalizeText(profile.full_name || linkedClient.full_name)}`
    if (!linkedSignatureMap.has(signature)) linkedSignatureMap.set(signature, [])
    linkedSignatureMap.get(signature).push(linkedClient)
  }

  const standaloneKeys = new Set()
  for (const client of clients) {
    // Every linked account was already added above or enriched into a staff node.
    if (client.user_id) continue
    if (!client.owner_id) continue

    const signature = `${client.owner_id}|${normalizeText(client.full_name)}`
    const possibleLinkedMatches = linkedSignatureMap.get(signature) || []
    if (possibleLinkedMatches.length === 1 && isLikelyShadowClient(client, possibleLinkedMatches[0])) {
      continue
    }

    const exactKey = [
      client.owner_id,
      normalizeText(client.full_name),
      normalizePhone(client.phone),
      normalizeText(client.email),
    ].join('|')
    if (standaloneKeys.has(exactKey)) continue
    standaloneKeys.add(exactKey)

    addClientNode(client.owner_id, {
      ...client,
      client_id: client.id,
      username: null,
      role: 'client',
      isAccount: false,
    })
  }

  for (const ownedClients of clientsOf.values()) {
    ownedClients.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)))
  }

  const roots = enrichedStaff
    .filter((profile) => !profile.created_by || !enrichedStaffById.has(profile.created_by))
    .sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1
      if (a.role !== 'admin' && b.role === 'admin') return 1
      return String(a.full_name || a.username).localeCompare(String(b.full_name || b.username))
    })

  return { staff: enrichedStaff, childrenOf, clientsOf, roots }
}

function TreeNode({ profile, childrenOf, clientsOf, currentUserId, t, onMove, onRoleChange }) {
  const children = childrenOf.get(profile.id) || []
  const clients = clientsOf.get(profile.id) || []

  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 py-2">
        <span className="text-lg leading-none" aria-hidden="true">{ROLE_ICON[profile.role] || '🧑‍🏫'}</span>
        {profile.client ? (
          <Link to={`/client/${profile.client.id}`} className="font-display font-medium text-ink hover:text-ledger">
            {profile.full_name || profile.username}
          </Link>
        ) : (
          <span className="font-display font-medium text-ink">{profile.full_name || profile.username}</span>
        )}
        {profile.client?.phone && (
          <span className="whitespace-nowrap font-mono text-xs text-ink-soft">{profile.client.phone}</span>
        )}
        {profile.username && <span className="font-mono text-xs text-ink-soft">@{profile.username}</span>}
        <span className="rounded bg-ledger/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ledger">
          {t(ROLE_LABEL_KEY[profile.role] || 'roleTrainer')}
        </span>
        {profile.role === 'trainer' && profile.id !== currentUserId && (
          <button
            type="button"
            onClick={() => onRoleChange({
              user_id: profile.id,
              role: profile.role,
              full_name: profile.full_name,
              username: profile.username,
            })}
            aria-label={t('changeRole')}
            title={t('changeRole')}
            className="no-print icon-button h-7 w-7 text-sm"
          >
            ⇄
          </button>
        )}
        {profile.role === 'trainer' && (
          <button
            type="button"
            onClick={() => onMove({ type: 'trainer', id: profile.id, currentParentId: profile.created_by })}
            aria-label={t('moveNode')}
            title={t('moveNode')}
            className="no-print icon-button h-7 w-7 text-sm"
          >
            ⇅
          </button>
        )}
      </div>

      {(children.length > 0 || clients.length > 0) && (
        <div className="ml-2.5 border-l border-line pl-4 sm:pl-6">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              profile={child}
              childrenOf={childrenOf}
              clientsOf={clientsOf}
              currentUserId={currentUserId}
              t={t}
              onMove={onMove}
              onRoleChange={onRoleChange}
            />
          ))}
          {clients.map((client) => (
            <div key={`${client.user_id || 'client'}:${client.id}`} className="flex items-center gap-2 py-1.5 text-sm">
              {client.client_id ? (
                <Link
                  to={`/client/${client.client_id}`}
                  className="flex min-w-0 items-center gap-2 text-ink-soft transition-colors hover:text-ledger"
                >
                  <span className="text-base leading-none" aria-hidden="true">{ROLE_ICON.client}</span>
                  <span className="truncate">{client.full_name}</span>
                </Link>
              ) : (
                <span className="flex min-w-0 items-center gap-2 text-ink-soft">
                  <span className="text-base leading-none" aria-hidden="true">{ROLE_ICON.client}</span>
                  <span className="truncate">{client.full_name}</span>
                </span>
              )}
              {client.phone && <span className="whitespace-nowrap font-mono text-xs text-ink-soft">{client.phone}</span>}
              {client.username && <span className="font-mono text-xs text-ink-soft">@{client.username}</span>}
              <span className="rounded bg-ledger/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ledger">
                {t('roleClient')}
              </span>
              {client.user_id && client.user_id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => onRoleChange({
                    user_id: client.user_id,
                    role: 'client',
                    full_name: client.full_name,
                    username: client.username,
                  })}
                  aria-label={t('changeRole')}
                  title={t('changeRole')}
                  className="no-print icon-button h-7 w-7 text-sm"
                >
                  ⇄
                </button>
              )}
              {client.client_id && (
                <button
                  type="button"
                  onClick={() => onMove({ type: 'client', id: client.client_id, currentParentId: client.owner_id })}
                  aria-label={t('moveNode')}
                  title={t('moveNode')}
                  className="no-print icon-button h-7 w-7 text-sm"
                >
                  ⇅
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RoleChangeModal({ node, onClose, onDone, t }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSaving(false)
    setError('')
  }, [node?.user_id])

  if (!node) return null
  const newRole = node.role === 'trainer' ? 'client' : 'trainer'

  async function handleConfirm() {
    setSaving(true)
    setError('')
    try {
      await callManageAccount({ action: 'change_role', user_id: node.user_id, new_role: newRole })
      await onDone()
    } catch (roleError) {
      setError(roleError.message)
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={() => !saving && onClose()} titleId="hierarchy-change-role-title" maxWidth="max-w-sm" closeOnBackdrop={!saving}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="hierarchy-change-role-title" className="font-display text-xl font-semibold text-ink">{t('changeRole')}</p>
            <p className="mt-1 text-sm text-ink-soft">{node.full_name || node.username}</p>
            {node.username && <p className="font-mono text-xs text-ink-soft">@{node.username}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="icon-button" aria-label={t('closeAria')}>✕</button>
        </div>

        <p className="mt-5 text-sm leading-6 text-ink">
          {newRole === 'client' ? t('changeRoleToClientWarning') : t('changeRoleToTrainerWarning')}
        </p>
        <StatusMessage type="error" className="mt-4">{error}</StatusMessage>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">{t('cancel')}</button>
          <button type="button" onClick={handleConfirm} disabled={saving} className="btn-primary">
            {saving ? t('saving') : t('confirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function MoveModal({ moveNode, staff, childrenOf, onClose, onConfirm, t }) {
  const options = useMemo(() => {
    if (!moveNode) return []
    const excluded = new Set()
    if (moveNode.type === 'trainer') {
      excluded.add(moveNode.id)
      for (const id of getDescendantIds(moveNode.id, childrenOf)) excluded.add(id)
    }
    return staff.filter((profile) => !excluded.has(profile.id))
  }, [moveNode, staff, childrenOf])

  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelected(moveNode?.currentParentId || '')
    setSaving(false)
  }, [moveNode])

  if (!moveNode) return null

  async function handleSave() {
    setSaving(true)
    const success = await onConfirm(selected || null)
    if (!success) setSaving(false)
  }

  return (
    <Modal open onClose={() => !saving && onClose()} titleId="move-node-title" maxWidth="max-w-sm" closeOnBackdrop={!saving}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="move-node-title" className="font-display text-xl font-semibold text-ink">{t('moveNode')}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {moveNode.type === 'trainer' ? t('moveTrainerHelp') : t('moveClientHelp')}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="icon-button" aria-label={t('closeAria')}>✕</button>
        </div>

        <label className="mt-5 block">
          <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-ink-soft">{t('moveNewParent')}</span>
          <select className="input" value={selected} onChange={(event) => setSelected(event.target.value)} autoFocus>
            {moveNode.type === 'trainer' && <option value="">{t('moveTopLevel')}</option>}
            {options.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {(profile.full_name || profile.username) + ` (@${profile.username})`}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">{t('cancel')}</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (moveNode.type === 'client' && !selected)}
            className="btn-primary"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
