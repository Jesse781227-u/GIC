import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAuth } from './firebase'

const API_BASE = import.meta.env.VITE_API_URL || 'https://gic-backend-lx3q.onrender.com'

async function api(path, options = {}) {
  const user = adminAuth.currentUser
  if (!user) throw new Error('Admin session is unavailable')
  const token = await user.getIdToken()
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(await response.text().catch(() => 'Request failed'))
  return response.json()
}

export default function AdminEventOrganizationSetting({ event, onSaved }) {
  const [organizations, setOrganizations] = useState([])
  const [selection, setSelection] = useState(event.organizationKind && event.organizationId ? `${event.organizationKind}_${event.organizationId}` : '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { api('/api/admin/organizations').then(({ organizations: items = [] }) => setOrganizations(items)).catch(() => {}) }, [])
  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const separator = selection.indexOf('_')
      const organizationKind = separator < 0 ? null : selection.slice(0, separator)
      const organizationId = separator < 0 ? null : selection.slice(separator + 1)
      const { event: updated } = await api(`/api/admin/events/${event.id}`, { method: 'PUT', body: JSON.stringify({ startsAt: event.startsAt, organizationKind, organizationId }) })
      onSaved(updated)
      setMessage('Organization association saved.')
    } catch (error) { setMessage(error.message || 'Association could not be saved.') }
    finally { setSaving(false) }
  }
  const selected = organizations.find((item) => item.id === selection)
  return <div className="event-admin-section"><h3>Organization</h3><div className="organization-add-member"><select value={selection} onChange={(event) => setSelection(event.target.value)} aria-label="Associated organization"><option value="">No organization</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}</select><button className="btn secondary" type="button" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save association'}</button>{selected && <Link className="btn secondary" to={`/ministries/${selected.id}`}>Open organization</Link>}</div>{message && <p className="muted" role="status">{message}</p>}</div>
}
