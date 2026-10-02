import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
import { adminAuth } from './firebase'
import './notification-destination.css'

const API_BASE = import.meta.env.VITE_API_URL || 'https://gic-backend-lx3q.onrender.com'
const routeOptions = [
  ['Home', '/home'], ['Announcements', '/announcements'], ['Events', '/events'],
  ['Event details', '/events/'], ['Registrations', '/registrations'], ['Messages', '/messages'],
  ['Forms', '/forms'], ['Ministries', '/ministries'], ['Profile', '/profile'],
]

async function requestAdminApi(path, options = {}) {
  const user = adminAuth.currentUser
  if (!user) throw new Error('Admin session is unavailable')
  const token = await user.getIdToken()
  const multipart = options.body instanceof FormData
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(!multipart ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (!response.ok) {
    const message = await response.text().catch(() => 'Request failed')
    try { throw new Error(JSON.parse(message).error || message) } catch (error) { if (error instanceof SyntaxError) throw new Error(message); throw error }
  }
  return response.json()
}

export default function NotificationMessageComposer() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audienceSelection, setAudienceSelection] = useState('everyone:')
  const [audiences, setAudiences] = useState([])
  const [audiencesError, setAudiencesError] = useState('')
  const [category, setCategory] = useState('General Announcement')
  const [destinationType, setDestinationType] = useState('')
  const [destinationRoute, setDestinationRoute] = useState('')
  const [media, setMedia] = useState(null)
  const [preview, setPreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [delivery, setDelivery] = useState('now')
  const [scheduledAt, setScheduledAt] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => {
    requestAdminApi('/api/admin/groups/audiences')
      .then(({ audiences: choices = [] }) => setAudiences(choices))
      .catch((error) => setAudiencesError(error.message || 'Audience options are unavailable.'))
  }, [])

  const uploadMedia = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']
    const maxSize = file.type === 'video/mp4' ? 25 * 1024 * 1024 : 8 * 1024 * 1024
    if (!allowedTypes.includes(file.type) || file.size > maxSize) {
      setMessage(file.size > maxSize ? 'Images must be 8 MB or less and MP4 videos 25 MB or less.' : 'Choose a JPEG, PNG, WebP, GIF image, or MP4 video.')
      event.target.value = ''
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
    setMedia(null)
    setUploading(true)
    setMessage('')
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await requestAdminApi('/api/admin/notifications/media', { method: 'POST', body: form })
      setMedia(result.media)
    } catch (error) {
      setMessage(error.message || 'Media upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const save = async (mode) => {
    setMessage('')
    if (!title.trim() || !body.trim()) return setMessage('Title and message are required.')
    if (!destinationType) return setMessage('Choose an app page or upload media for the notification destination.')
    if (destinationType === 'internal_route' && !destinationRoute.trim()) return setMessage('Enter an internal member app route.')
    if (destinationType === 'media_page' && !media?.id) return setMessage('Upload media before saving this destination.')
    setSaving(true)
    try {
      const [audience, audienceId = ''] = audienceSelection.split(':')
      const type = category === 'Event' ? 'EVENT_PUBLISHED' : category === 'Reminder' ? 'EVENT_REMINDER' : category === 'Registration' ? 'REGISTRATION_CONFIRMATION' : 'GENERAL_ANNOUNCEMENT'
      const created = await requestAdminApi('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(), body: body.trim(), type, audience, destinationType,
          ...(audience === 'ministry' ? { audienceMinistryId: audienceId } : {}),
          ...(audience === 'cell' ? { audienceCellId: audienceId } : {}),
          ...(audience === 'segment' ? { audienceSegmentId: audienceId } : {}),
          ...(audience === 'event_registrants' ? { audienceEventId: audienceId } : {}),
          ...(destinationType === 'internal_route' ? { destinationRoute: destinationRoute.trim() } : {}),
          ...(destinationType === 'media_page' ? { destinationMediaId: media.id } : {}),
          ...(mode === 'SCHEDULED' ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        }),
      })
      if (mode === 'SENT') await requestAdminApi(`/api/admin/notifications/${created.id}/send`, { method: 'POST' })
      setMessage(mode === 'SENT' ? 'Notification sent.' : mode === 'SCHEDULED' ? 'Notification scheduled.' : 'Draft saved.')
      if (mode !== 'DRAFT') setTimeout(() => navigate('/messages'), 250)
    } catch (error) {
      setMessage(error.message || 'Unable to save message.')
    } finally {
      setSaving(false)
    }
  }

  const routeLabel = destinationRoute.startsWith('/events/')
    ? `Events → Event Details → ${destinationRoute.split('/')[2]}${destinationRoute.endsWith('/register') || destinationRoute.endsWith('/registration') ? ' → Registration' : ''}`
    : routeOptions.find(([, route]) => route === destinationRoute)?.[0] || destinationRoute || 'Choose a page'

  const selectedAudience = audiences.find((item) => `${item.kind}:${item.id || ''}` === audienceSelection)
  return <main className="page">
    <div className="page-head"><div><h1>New Message</h1><p>Compose a push notification for GIC members</p></div></div>
    <div className="composer-layout"><section className="card composer-card">
      <div className="card-head"><div><b>Message details</b><small>Delivered through GIC push notifications.</small></div></div>
      <label className="form-field">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Sunday Service Reminder"/></label>
      <label className="form-field">Message<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write your notification message..." rows="5"/></label>
      <div className="composer-grid">
        <label className="form-field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{['General Announcement', 'Event', 'Registration', 'Reminder', 'Church Update'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="form-field">Audience<select value={audienceSelection} onChange={(event) => setAudienceSelection(event.target.value)}>{audiences.map((item) => <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id || ''}`}>{item.name} ({item.memberCount})</option>)}</select></label>
      </div>
      {audiencesError && <div className="empty-message" role="alert">{audiencesError}</div>}
      {selectedAudience && <p className="audience-help">Estimated audience: {selectedAudience.memberCount} members with current group membership.</p>}
      <section className="composer-section notification-destination"><div className="destination-heading"><b>Notification Destination</b><span className="destination-required">Required</span></div>
        <div className="audience-options destination-options">{[['internal_route', 'Open app page'], ['media_page', 'Open media page']].map(([value, label]) => <label key={value}><input type="radio" name="notificationDestination" checked={destinationType === value} onChange={() => setDestinationType(value)}/>{label}</label>)}</div>
        {destinationType === 'internal_route' && <div className="destination-fields">
          <label className="form-field">Select app page<select value={routeOptions.some(([, route]) => route === destinationRoute) ? destinationRoute : ''} onChange={(event) => { if (event.target.value) setDestinationRoute(event.target.value) }}><option value="">Choose a page or enter a route below</option>{routeOptions.map(([label, route]) => <option key={`${label}-${route}`} value={route}>{label}</option>)}</select></label>
          <label className="form-field">Exact internal route<input value={destinationRoute} onChange={(event) => setDestinationRoute(event.target.value)} placeholder="/events/123/register" autoComplete="off"/></label>
          <div className="destination-preview">Destination: <b>{routeLabel}</b></div>
        </div>}
        {destinationType === 'media_page' && <div className="destination-fields"><label className="form-field">Image or MP4<input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,video/mp4" onChange={uploadMedia}/></label>{uploading && <div className="empty-message">Uploading media…</div>}{preview && <div className="destination-media-preview">{media?.mediaType === 'video' ? <video src={preview} controls playsInline preload="metadata"/> : <img src={preview} alt="Notification destination preview"/>}<div><b>{media?.originalFilename || 'Preview'}</b><small>{media ? `${media.mimeType} · ${(media.fileSize / 1048576).toFixed(1)} MB` : 'Uploading…'}</small></div></div>}</div>}
      </section>
      {delivery === 'schedule' && <label className="form-field">Send at<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)}/></label>}
      {message && <div className="empty-message" role="status">{message}</div>}
      <div className="composer-actions"><Link className="btn secondary" to="/messages"><ArrowLeft size={14}/> Cancel</Link><button className="btn secondary" disabled={saving || uploading} onClick={() => save('DRAFT')}>Save draft</button><button className="btn secondary" disabled={saving || uploading} onClick={() => setDelivery(delivery === 'schedule' ? 'now' : 'schedule')}>{delivery === 'schedule' ? 'Cancel schedule' : 'Schedule'}</button><button className="btn primary" disabled={saving || uploading || !destinationType || (destinationType === 'internal_route' && !destinationRoute.trim()) || (destinationType === 'media_page' && !media?.id)} onClick={() => save(delivery === 'schedule' ? 'SCHEDULED' : 'SENT')}><Send size={14}/>{saving ? 'Saving…' : delivery === 'schedule' ? 'Schedule notification' : 'Send notification'}</button></div>
    </section><aside className="phone-preview"><b>Preview as member</b><div className="phone-frame"><div className="phone-notification"><small>GLOBAL IMPACT CHURCH</small><strong>{title || 'Notification title'}</strong><span>{body || 'Your notification message will appear here.'}</span></div>{destinationType === 'media_page' && preview && (media?.mediaType === 'video' ? <video src={preview} controls playsInline preload="metadata"/> : <img src={preview} alt="Destination preview"/>)}<small>{destinationType === 'internal_route' ? routeLabel : destinationType === 'media_page' ? 'Full-page media destination' : 'No tap destination'}</small></div></aside></div>
  </main>
}
