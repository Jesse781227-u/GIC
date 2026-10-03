import React, { useEffect, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { adminAuth } from './firebase'

const API_BASE = import.meta.env.VITE_API_URL || 'https://gic-backend-lx3q.onrender.com'

async function adminApi(path, options = {}) {
  const user = adminAuth.currentUser
  if (!user) throw new Error('Admin session is unavailable')
  const token = await user.getIdToken()
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const body = await response.text().catch(() => 'Request failed')
    try { throw new Error(JSON.parse(body).error || body) } catch (error) { if (error instanceof SyntaxError) throw new Error(body); throw error }
  }
  return response.json()
}

export default function AdminCreateEventModal({ onClose, onCreated }) {
  const [organizations, setOrganizations] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventType, setEventType] = useState('Service')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState('DRAFT')
  const [organizationKey, setOrganizationKey] = useState('')
  const [registrationRequired, setRegistrationRequired] = useState(false)
  const [registrationCapacity, setRegistrationCapacity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi('/api/admin/organizations').then(({ organizations: items = [] }) => setOrganizations(items)).catch(() => {})
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setError('End time must be after start time.')
      return
    }
    if (registrationRequired && !registrationCapacity) {
      setError('Registration capacity is required when registration is enabled.')
      return
    }
    setSaving(true)
    try {
      const separator = organizationKey.indexOf('_')
      const organizationKind = separator < 0 ? null : organizationKey.slice(0, separator)
      const organizationId = separator < 0 ? null : organizationKey.slice(separator + 1)
      const { event: created } = await adminApi('/api/admin/events', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: description || null,
          eventType,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          location: location || null,
          status,
          registrationRequired,
          registrationCapacity: registrationRequired ? Number(registrationCapacity) : null,
          organizationKind,
          organizationId,
        }),
      })
      onCreated(created)
    } catch (requestError) {
      setError(requestError.message || 'Event could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="event-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-event-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <form className="event-modal" onSubmit={submit}>
      <div className="event-modal-header"><div><h2 id="create-event-title">Create Event</h2><p>Add an event to the GIC platform</p></div><button type="button" className="event-modal-close" aria-label="Close create event" onClick={onClose}><X size={18}/></button></div>
      <div className="event-modal-body">
        <label className="modern-field full"><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength="240"/></label>
        <label className="modern-field full"><span>Description</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows="3"/></label>
        <label className="modern-field full"><span>Event type</span><select value={eventType} onChange={(event) => setEventType(event.target.value)}>{['Service','Conference','Meeting','Outreach','Special Event','Other'].map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="modern-field full"><span>Organization (optional)</span><select value={organizationKey} onChange={(event) => setOrganizationKey(event.target.value)}><option value="">No organization</option>{organizations.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.type}</option>)}</select></label>
        <div className="modern-field-grid"><label className="modern-field"><span>Start date & time</span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required/></label><label className="modern-field"><span>End date & time</span><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)}/></label></div>
        <label className="modern-field full"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Venue or Online"/></label>
        <label className="modern-field full"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></label>
        <label className="check"><input type="checkbox" checked={registrationRequired} onChange={(event) => setRegistrationRequired(event.target.checked)}/> Registration required</label>
        {registrationRequired && <label className="modern-field full"><span>Registration capacity</span><input type="number" min="1" value={registrationCapacity} onChange={(event) => setRegistrationCapacity(event.target.value)} required/></label>}
        {error && <div className="event-form-error" role="alert">{error}</div>}
      </div>
      <div className="event-modal-footer"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving}>{saving ? 'Creating...' : <><CalendarDays size={14}/> Create event</>}</button></div>
    </form>
  </div>
}
