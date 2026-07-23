import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useLanguage } from '../lib/i18n.jsx'
import Modal from '../components/Modal.jsx'
import StatusMessage from '../components/StatusMessage.jsx'

const ROLE_ICON = { admin: '👑', trainer: '🧑‍🏫' }
const ROLE_LABEL_KEY = { admin: 'roleAdmin', trainer: 'roleTrainer' }

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

export default function Hierarchy() {
  const { t } = useLanguage()
  const [profiles, setProfiles] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [moveNode, setMoveNode] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    const [profileResult, clientResult] = await Promise.all([
      supabase.from('profiles').select('id, role, full_name, username, created_by'),
      supabase.from('clients').select('id, full_name, phone, owner_id, user_id'),
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

      // Keep the account's client information under the same parent.
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
          <button type="button" onClick={() => window.print()} className="btn-primary">
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
        <section className="printable-area print-flow overflow-x-auto rounded-xl border border-line bg-card p-4 shadow-sm sm:p-6">
          <div className="min-w-[520px]">
            {tree.roots.map((root) => (
              <TreeNode
                key={root.id}
                profile={root}
                childrenOf={tree.childrenOf}
                clientsOf={tree.clientsOf}
                t={t}
                onMove={setMoveNode}
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
    </div>
  )
}

function buildTreeData(profiles, clients) {
  const staff = profiles.filter((profile) => profile.role !== 'client')
  const staffIds = new Set(staff.map((profile) => profile.id))
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const linkedClientByUserId = new Map(
    clients.filter((client) => client.user_id).map((client) => [client.user_id, client])
  )
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
  for (const client of clients) {
    // A linked account is represented by exactly one hierarchy node.
    // Staff accounts are enriched above; client accounts remain client nodes.
    if (client.user_id && staffIds.has(client.user_id)) continue
    if (!client.owner_id) continue

    const account = client.user_id ? profileById.get(client.user_id) : null
    const hierarchyClient = {
      ...client,
      full_name: account?.full_name || client.full_name,
      username: account?.username || null,
      role: account?.role || 'client',
    }

    if (!clientsOf.has(client.owner_id)) clientsOf.set(client.owner_id, [])
    clientsOf.get(client.owner_id).push(hierarchyClient)
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

function TreeNode({ profile, childrenOf, clientsOf, t, onMove }) {
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
        <span className="font-mono text-xs text-ink-soft">@{profile.username}</span>
        <span className="rounded bg-ledger/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ledger">
          {t(ROLE_LABEL_KEY[profile.role] || 'roleTrainer')}
        </span>
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
              t={t}
              onMove={onMove}
            />
          ))}
          {clients.map((client) => (
            <div key={client.id} className="flex items-center gap-2 py-1.5 text-sm">
              <Link
                to={`/client/${client.id}`}
                className="flex min-w-0 items-center gap-2 text-ink-soft transition-colors hover:text-ledger"
              >
                <span className="text-base leading-none" aria-hidden="true">🧍</span>
                <span className="truncate">{client.full_name}</span>
              </Link>
              {client.phone && <span className="whitespace-nowrap font-mono text-xs text-ink-soft">{client.phone}</span>}
              <button
                type="button"
                onClick={() => onMove({ type: 'client', id: client.id, currentParentId: client.owner_id })}
                aria-label={t('moveNode')}
                title={t('moveNode')}
                className="no-print icon-button h-7 w-7 text-sm"
              >
                ⇅
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
