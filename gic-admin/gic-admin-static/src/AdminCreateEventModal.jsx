import React, { useEffect, useState } from 'react'
import { CalendarDays, X, Plus, Trash2 } from 'lucide-react'
import { adminAuth } from './firebase'

const API_BASE = import.meta.env.VITE_API_URL || 'https://gic-backend-lx3q.onrender.com'
const EVENT_TYPES = ['Service', 'Conference', 'Convention', 'Fellowship', 'Training', 'Meeting', 'Outreach', 'Special Event', 'Other']
const EVENT_FORMATS = ['PHYSICAL', 'ONLINE', 'HYBRID']
const STREAM_PLATFORMS = ['Mixlr', 'YouTube', 'Facebook', 'Zoom', 'Other']
const REMINDER_OPTIONS = [
  { label: '1 week before', minutes: 10080 },
  { label: '1 day before', minutes: 1440 },
  { label: '1 hour before', minutes: 60 },
  { label: '30 minutes before', minutes: 30 },
]
const AUDIENCE_OPTIONS = ['All Members', 'Segment', 'Ministry', 'Unit', 'Fellowship', 'Cell', 'Group']

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

function makeSpeaker() {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: '', title: '', description: '', photoUrl: '' }
}

function makePickupLocation() {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: '', address: '', pickupTime: '', capacity: '', notes: '' }
}

function toDateTimeValue(date, time) {
  if (!date || !time) return ''
  return `${date}T${time}`
}

function toIso(date, time) {
  if (!date || !time) return null
  const value = new Date(`${date}T${time}:00`)
  if (Number.isNaN(value.getTime())) return null
  return value.toISOString()
}

function readImageFile(file, onReady) {
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Only JPG, PNG, and WEBP images are allowed.')
  }
  const reader = new FileReader()
  reader.onload = () => onReady(String(reader.result))
  reader.readAsDataURL(file)
}

export default function AdminCreateEventModal({ onClose, onCreated }) {
  const [organizations, setOrganizations] = useState([])
  const [title, setTitle] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [fullDescription, setFullDescription] = useState('')
  const [eventType, setEventType] = useState('Service')
  const [organizationKey, setOrganizationKey] = useState('')
  const [flyerUrl, setFlyerUrl] = useState('')
  const [additionalImages, setAdditionalImages] = useState([])
  const [speakers, setSpeakers] = useState([makeSpeaker()])
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [allDayEvent, setAllDayEvent] = useState(false)
  const [recurringEvent, setRecurringEvent] = useState(false)
  const [repeatType, setRepeatType] = useState('Weekly')
  const [eventFormat, setEventFormat] = useState('PHYSICAL')
  const [venueName, setVenueName] = useState('')
  const [address, setAddress] = useState('')
  const [landmark, setLandmark] = useState('')
  const [locationLink, setLocationLink] = useState('')
  const [streamOnline, setStreamOnline] = useState(false)
  const [streamPlatform, setStreamPlatform] = useState('Mixlr')
  const [streamUrl, setStreamUrl] = useState('')
  const [streamInstructions, setStreamInstructions] = useState('')
  const [registrationRequired, setRegistrationRequired] = useState(false)
  const [registrationOpensDate, setRegistrationOpensDate] = useState('')
  const [registrationOpensTime, setRegistrationOpensTime] = useState('')
  const [registrationClosesDate, setRegistrationClosesDate] = useState('')
  const [registrationClosesTime, setRegistrationClosesTime] = useState('')
  const [capacityType, setCapacityType] = useState('UNLIMITED')
  const [capacity, setCapacity] = useState('')
  const [waitlistEnabled, setWaitlistEnabled] = useState(false)
  const [sendConfirmation, setSendConfirmation] = useState(false)
  const [registrationFormMode, setRegistrationFormMode] = useState('NO_FORM')
  const [churchBusAvailable, setChurchBusAvailable] = useState(false)
  const [pickupLocations, setPickupLocations] = useState([makePickupLocation()])
  const [sendReminders, setSendReminders] = useState(false)
  const [selectedReminders, setSelectedReminders] = useState([1440, 60, 30])
  const [customReminderValue, setCustomReminderValue] = useState('')
  const [customReminderUnit, setCustomReminderUnit] = useState('minutes')
  const [notifyOnPublish, setNotifyOnPublish] = useState(false)
  const [notificationTitle, setNotificationTitle] = useState('')
  const [notificationMessage, setNotificationMessage] = useState('')
  const [audience, setAudience] = useState('All Members')
  const [visibility, setVisibility] = useState('Members only')
  const [status, setStatus] = useState('DRAFT')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [previewMode, setPreviewMode] = useState(false)

  useEffect(() => {
    adminApi('/api/admin/organizations').then(({ organizations: items = [] }) => setOrganizations(items)).catch(() => {})
  }, [])

  const speakerUpdate = (id, field, value) => {
    setSpeakers((current) => current.map((speaker) => speaker.id === id ? { ...speaker, [field]: value } : speaker))
  }

  const pickupUpdate = (id, field, value) => {
    setPickupLocations((current) => current.map((pickup) => pickup.id === id ? { ...pickup, [field]: value } : pickup))
  }

  const addSpeaker = () => setSpeakers((current) => [...current, makeSpeaker()])
  const removeSpeaker = (id) => setSpeakers((current) => current.filter((speaker) => speaker.id !== id))
  const addPickupLocation = () => setPickupLocations((current) => [...current, makePickupLocation()])
  const removePickupLocation = (id) => setPickupLocations((current) => current.filter((pickup) => pickup.id !== id))

  const validate = () => {
    if (!title.trim()) return 'Event title is required.'
    if (!shortDescription.trim()) return 'Short description is required.'
    if (!eventType) return 'Event type is required.'
    if (!startDate || !startTime) return 'Start date and time are required.'
    if (!endDate || !endTime) return 'End date and time are required.'
    if (new Date(`${endDate}T${endTime}:00`) <= new Date(`${startDate}T${startTime}:00`)) return 'End date/time must be after the start date/time.'
    if ((eventFormat === 'PHYSICAL' || eventFormat === 'HYBRID') && !venueName.trim()) return 'Venue name is required for physical or hybrid events.'
    if ((eventFormat === 'PHYSICAL' || eventFormat === 'HYBRID') && !address.trim()) return 'Address is required for physical or hybrid events.'
    if ((eventFormat === 'ONLINE' || eventFormat === 'HYBRID') && streamOnline) {
      if (!streamPlatform) return 'Please select a streaming platform.'
      if (!streamUrl.trim()) return 'Stream URL is required when streaming is enabled.'
    }
    if (registrationRequired) {
      if (!registrationOpensDate || !registrationOpensTime) return 'Registration opening date/time is required.'
      if (!registrationClosesDate || !registrationClosesTime) return 'Registration closing date/time is required.'
      if (new Date(`${registrationClosesDate}T${registrationClosesTime}:00`) <= new Date(`${registrationOpensDate}T${registrationOpensTime}:00`)) return 'Registration close time must be after the open time.'
      if (capacityType === 'LIMITED' && (!capacity || Number(capacity) <= 0)) return 'Capacity is required when registration is limited.'
    }
    if (churchBusAvailable && pickupLocations.filter((pickup) => pickup.name.trim() && pickup.address.trim()).length === 0) return 'Add at least one pickup location when church bus transportation is enabled.'
    if (notifyOnPublish && !notificationTitle.trim()) return 'Notification title is required when publish notifications are enabled.'
    if (notifyOnPublish && !notificationMessage.trim()) return 'Notification message is required when publish notifications are enabled.'
    return ''
  }

  const buildPayload = () => {
    const separator = organizationKey.indexOf('_')
    const organizationKind = separator < 0 ? null : organizationKey.slice(0, separator)
    const organizationId = separator < 0 ? null : organizationKey.slice(separator + 1)
    return {
      title: title.trim(),
      description: shortDescription.trim() || fullDescription.trim() || null,
      eventType,
      startsAt: toIso(startDate, startTime),
      endsAt: allDayEvent ? null : toIso(endDate || startDate, endTime || startTime),
      location: eventFormat === 'ONLINE' ? 'Online' : venueName || null,
      venueName: (eventFormat === 'PHYSICAL' || eventFormat === 'HYBRID') ? venueName || null : null,
      address: (eventFormat === 'PHYSICAL' || eventFormat === 'HYBRID') ? address || null : null,
      mapInfo: locationLink || null,
      isPaid: false,
      status: 'DRAFT',
      eventType,
      timeZone: 'Africa/Lagos',
      allowRegistrationCancellation: true,
      registrationForm: [],
      registrationRequired,
      registrationOpensAt: registrationRequired ? toIso(registrationOpensDate, registrationOpensTime) : null,
      registrationClosesAt: registrationRequired ? toIso(registrationClosesDate, registrationClosesTime) : null,
      registrationCapacity: registrationRequired && capacityType === 'LIMITED' ? Number(capacity) : null,
      allowWaitlist: registrationRequired && waitlistEnabled,
      isOnline: eventFormat !== 'PHYSICAL',
      onlineUrl: streamOnline ? streamUrl.trim() || null : null,
      onlinePlatform: streamOnline ? streamPlatform || null : null,
      onlineAccessInstructions: streamOnline ? streamInstructions.trim() || null : null,
      busTransportEnabled: churchBusAvailable,
      locationType: eventFormat,
      notifyOnPublish: notifyOnPublish,
      sendRegistrationConfirmation: registrationRequired && sendConfirmation,
      organizationKind,
      organizationId,
      organizerContactPerson: null,
      organizerContactPhone: null,
      imageUrl: flyerUrl || null,
      landmark: landmark || null,
      speakers: speakers.filter((speaker) => speaker.name.trim() || speaker.title.trim() || speaker.description.trim()).map((speaker) => ({
        name: speaker.name.trim(),
        title: speaker.title.trim(),
        description: speaker.description.trim(),
        photoUrl: speaker.photoUrl || null,
      })),
      notificationTitle: notifyOnPublish ? notificationTitle.trim() : null,
      notificationMessage: notifyOnPublish ? notificationMessage.trim() : null,
      audience,
      visibility,
      recurringEvent,
      recurringRule: recurringEvent ? { repeat: repeatType } : null,
      additionalImages,
    }
  }

  const saveEvent = async (mode) => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = buildPayload()
      const { event: created } = await adminApi('/api/admin/events', {
        method: 'POST',
        body: JSON.stringify({ ...payload, status: 'DRAFT' }),
      })

      if (churchBusAvailable) {
        for (const pickup of pickupLocations.filter((item) => item.name.trim() || item.address.trim())) {
          await adminApi(`/api/admin/events/${created.id}/pickup-locations`, {
            method: 'POST',
            body: JSON.stringify({
              locationName: pickup.name.trim(),
              addressLandmark: pickup.address.trim(),
              pickupTime: pickup.pickupTime ? new Date(`${startDate}T${pickup.pickupTime}:00`).toISOString() : new Date(`${startDate}T09:00:00`).toISOString(),
              capacity: Number(pickup.capacity || 1),
              notes: pickup.notes || null,
              active: true,
            }),
          })
        }
      }

      if (sendReminders) {
        const offsets = Array.from(new Set([
          ...selectedReminders,
          ...(customReminderValue && Number(customReminderValue) > 0 ? [Number(customReminderValue) * (customReminderUnit === 'hours' ? 60 : customReminderUnit === 'days' ? 1440 : 1)] : []),
        ]))
        if (offsets.length) {
          await adminApi(`/api/admin/events/${created.id}/reminders`, {
            method: 'PUT',
            body: JSON.stringify({ offsets }),
          })
        }
      }

      if (mode === 'publish') {
        await adminApi(`/api/admin/events/${created.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'PUBLISHED', notifyMembers: notifyOnPublish }),
        })
      }

      onCreated(created)
    } catch (requestError) {
      setError(requestError.message || 'Event could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const confirmationPreview = (
    <div className="event-modal-preview">
      <div className="event-preview-hero">
        {flyerUrl ? <img src={flyerUrl} alt={title || 'Event flyer'} /> : <div className="event-image-placeholder"><CalendarDays size={18} /></div>}
      </div>
      <h3>{title || 'Untitled event'}</h3>
      <p>{shortDescription || 'No short description yet.'}</p>
      <div className="detail-grid-mini">
        <span><b>Date:</b> {startDate ? new Date(`${startDate}T${startTime || '00:00'}:00`).toLocaleString() : 'Not set'}</span>
        <span><b>Location:</b> {eventFormat === 'ONLINE' ? 'Online' : venueName || 'Not set'}</span>
        <span><b>Registration:</b> {registrationRequired ? 'Required' : 'Not required'}</span>
        <span><b>Transport:</b> {churchBusAvailable ? 'Available' : 'Not available'}</span>
      </div>
    </div>
  )

  return (
    <div className="event-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-event-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="event-modal" onSubmit={(event) => { event.preventDefault(); if (status === 'PUBLISHED') setPreviewMode(true); else saveEvent('draft'); }}>
        <div className="event-modal-header"><div><h2 id="create-event-title">Create Event</h2><p>Add a practical event to the GIC platform</p></div><button type="button" className="event-modal-close" aria-label="Close create event" onClick={onClose}><X size={18}/></button></div>
        <div className="event-modal-body">
          {!previewMode ? (
            <>
              <div className="event-form-section">
                <h3>1. Basic event information</h3>
                <label className="modern-field full"><span>Event title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength="240" required /></label>
                <label className="modern-field full"><span>Short description</span><textarea value={shortDescription} onChange={(event) => setShortDescription(event.target.value)} rows="3" required /></label>
                <label className="modern-field full"><span>Full description</span><textarea value={fullDescription} onChange={(event) => setFullDescription(event.target.value)} rows="5" /></label>
                <label className="modern-field full"><span>Event type</span><select value={eventType} onChange={(event) => setEventType(event.target.value)}>{EVENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label className="modern-field full"><span>Organizing ministry / unit / fellowship</span><select value={organizationKey} onChange={(event) => setOrganizationKey(event.target.value)}><option value="">No organization</option>{organizations.map((item) => <option value={`${item.kind || 'ministry'}_${item.id}`} key={item.id}>{item.name} · {item.type || item.kind || 'Organization'}</option>)}</select></label>
                <div className="modern-field-grid">
                  <label className="modern-field full"><span>Event flyer</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) { try { readImageFile(file, setFlyerUrl) } catch (requestError) { setError(requestError.message || 'Flyer upload failed.') } } }} /></label>
                  {flyerUrl && <div className="image-preview"><img src={flyerUrl} alt="Event flyer preview" /></div>}
                </div>
                <label className="modern-field full"><span>Additional images</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => {
                  const files = Array.from(event.target.files || [])
                  const previews = []
                  files.forEach((file) => {
                    try {
                      readImageFile(file, (url) => previews.push(url))
                    } catch (requestError) {
                      setError(requestError.message || 'Image upload failed.')
                    }
                  })
                  if (previews.length) setAdditionalImages((current) => [...current, ...previews])
                }} /></label>
                {additionalImages.length > 0 && <div className="image-gallery-preview">{additionalImages.map((url, index) => <img key={`${url}-${index}`} src={url} alt={`Additional event ${index + 1}`} />)}</div>}
              </div>

              <div className="event-form-section">
                <h3>2. Speakers</h3>
                {speakers.map((speaker, index) => (
                  <div className="speaker-card" key={speaker.id}>
                    <div className="speaker-header"><strong>Speaker {index + 1}</strong>{speakers.length > 1 && <button type="button" className="icon-btn" onClick={() => removeSpeaker(speaker.id)} aria-label="Remove speaker"><Trash2 size={14} /></button>}</div>
                    <div className="modern-field-grid">
                      <label className="modern-field"><span>Speaker name</span><input value={speaker.name} onChange={(event) => speakerUpdate(speaker.id, 'name', event.target.value)} /></label>
                      <label className="modern-field"><span>Speaker title / role</span><input value={speaker.title} onChange={(event) => speakerUpdate(speaker.id, 'title', event.target.value)} placeholder="Pastor / Guest Minister" /></label>
                    </div>
                    <label className="modern-field full"><span>Speaker photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) { try { readImageFile(file, (url) => speakerUpdate(speaker.id, 'photoUrl', url)) } catch (requestError) { setError(requestError.message || 'Speaker photo upload failed.') } } }} /></label>
                    {speaker.photoUrl && <div className="speaker-photo-preview"><img src={speaker.photoUrl} alt={speaker.name || 'Speaker'} /></div>}
                    <label className="modern-field full"><span>Speaker description</span><textarea value={speaker.description} onChange={(event) => speakerUpdate(speaker.id, 'description', event.target.value)} rows="2" /></label>
                  </div>
                ))}
                <button type="button" className="btn secondary" onClick={addSpeaker}><Plus size={14}/> Add Speaker</button>
              </div>

              <div className="event-form-section">
                <h3>3. Date & time</h3>
                <div className="modern-field-grid">
                  <label className="modern-field"><span>Start date</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label>
                  <label className="modern-field"><span>Start time</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
                </div>
                <div className="modern-field-grid">
                  <label className="modern-field"><span>End date</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label>
                  <label className="modern-field"><span>End time</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
                </div>
                <div className="timezone-row"><strong>Timezone:</strong> Africa/Lagos (WAT)</div>
                <label className="check"><input type="checkbox" checked={allDayEvent} onChange={(event) => setAllDayEvent(event.target.checked)} /> All-day event</label>
                <label className="check"><input type="checkbox" checked={recurringEvent} onChange={(event) => setRecurringEvent(event.target.checked)} /> Recurring event</label>
                {recurringEvent && <label className="modern-field full"><span>Repeat</span><select value={repeatType} onChange={(event) => setRepeatType(event.target.value)}><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option><option value="Custom">Custom</option></select></label>}
              </div>

              <div className="event-form-section">
                <h3>4. Location</h3>
                <div className="segmented-row">
                  {['PHYSICAL', 'ONLINE', 'HYBRID'].map((format) => (
                    <label className="segment-option" key={format}><input type="radio" name="event-format" checked={eventFormat === format} onChange={() => setEventFormat(format)} /> {format === 'PHYSICAL' ? 'Physical' : format === 'ONLINE' ? 'Online' : 'Hybrid'}</label>
                  ))}
                </div>
                {(eventFormat === 'PHYSICAL' || eventFormat === 'HYBRID') && (
                  <>
                    <label className="modern-field full"><span>Venue name</span><input value={venueName} onChange={(event) => setVenueName(event.target.value)} /></label>
                    <label className="modern-field full"><span>Address</span><textarea value={address} onChange={(event) => setAddress(event.target.value)} rows="3" /></label>
                    <label className="modern-field full"><span>Landmark</span><input value={landmark} onChange={(event) => setLandmark(event.target.value)} placeholder="Optional" /></label>
                    <label className="modern-field full"><span>Location link</span><input value={locationLink} onChange={(event) => setLocationLink(event.target.value)} placeholder="Google Maps or venue link" /></label>
                  </>
                )}
              </div>

              <div className="event-form-section">
                <h3>5. Streaming / online</h3>
                <label className="check"><input type="checkbox" checked={streamOnline} onChange={(event) => setStreamOnline(event.target.checked)} /> This event will be streamed online</label>
                {streamOnline && (
                  <>
                    <label className="modern-field full"><span>Streaming platform</span><select value={streamPlatform} onChange={(event) => setStreamPlatform(event.target.value)}>{STREAM_PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select></label>
                    <label className="modern-field full"><span>Stream URL</span><input value={streamUrl} onChange={(event) => setStreamUrl(event.target.value)} placeholder="https://..." /></label>
                    <label className="modern-field full"><span>Stream instructions</span><textarea value={streamInstructions} onChange={(event) => setStreamInstructions(event.target.value)} rows="3" placeholder="Live stream begins 15 minutes before the service." /></label>
                  </>
                )}
              </div>

              <div className="event-form-section">
                <h3>6. Registration</h3>
                <label className="check"><input type="checkbox" checked={registrationRequired} onChange={(event) => setRegistrationRequired(event.target.checked)} /> Registration is required</label>
                {registrationRequired && (
                  <>
                    <div className="modern-field-grid">
                      <label className="modern-field"><span>Registration opens</span><input type="date" value={registrationOpensDate} onChange={(event) => setRegistrationOpensDate(event.target.value)} /></label>
                      <label className="modern-field"><span>Opening time</span><input type="time" value={registrationOpensTime} onChange={(event) => setRegistrationOpensTime(event.target.value)} /></label>
                    </div>
                    <div className="modern-field-grid">
                      <label className="modern-field"><span>Registration closes</span><input type="date" value={registrationClosesDate} onChange={(event) => setRegistrationClosesDate(event.target.value)} /></label>
                      <label className="modern-field"><span>Closing time</span><input type="time" value={registrationClosesTime} onChange={(event) => setRegistrationClosesTime(event.target.value)} /></label>
                    </div>
                    <div className="segmented-row">
                      <label className="segment-option"><input type="radio" name="capacity-type" checked={capacityType === 'UNLIMITED'} onChange={() => setCapacityType('UNLIMITED')} /> Unlimited</label>
                      <label className="segment-option"><input type="radio" name="capacity-type" checked={capacityType === 'LIMITED'} onChange={() => setCapacityType('LIMITED')} /> Limited</label>
                    </div>
                    {capacityType === 'LIMITED' && <label className="modern-field full"><span>Maximum number of registrations</span><input type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>}
                    <label className="check"><input type="checkbox" checked={waitlistEnabled} onChange={(event) => setWaitlistEnabled(event.target.checked)} /> Enable waitlist when event is full</label>
                    <label className="check"><input type="checkbox" checked={sendConfirmation} onChange={(event) => setSendConfirmation(event.target.checked)} /> Send registration confirmation notification</label>
                    <label className="modern-field full"><span>Registration form</span><select value={registrationFormMode} onChange={(event) => setRegistrationFormMode(event.target.value)}><option value="NO_FORM">No additional form</option><option value="EXISTING_FORM">Existing form</option><option value="CREATE_NEW_FORM">Create new form</option></select></label>
                  </>
                )}
              </div>

              <div className="event-form-section">
                <h3>7. Transportation / church bus</h3>
                <label className="check"><input type="checkbox" checked={churchBusAvailable} onChange={(event) => setChurchBusAvailable(event.target.checked)} /> Church bus transportation available</label>
                {churchBusAvailable && (
                  <>
                    {pickupLocations.map((pickup, index) => (
                      <div className="pickup-card" key={pickup.id}>
                        <div className="speaker-header"><strong>Pickup location {index + 1}</strong>{pickupLocations.length > 1 && <button type="button" className="icon-btn" onClick={() => removePickupLocation(pickup.id)} aria-label="Remove pickup location"><Trash2 size={14} /></button>}</div>
                        <div className="modern-field-grid">
                          <label className="modern-field"><span>Pickup location name</span><input value={pickup.name} onChange={(event) => pickupUpdate(pickup.id, 'name', event.target.value)} placeholder="Ikeja" /></label>
                          <label className="modern-field"><span>Pickup time</span><input type="time" value={pickup.pickupTime} onChange={(event) => pickupUpdate(pickup.id, 'pickupTime', event.target.value)} /></label>
                        </div>
                        <div className="modern-field-grid">
                          <label className="modern-field"><span>Address / landmark</span><input value={pickup.address} onChange={(event) => pickupUpdate(pickup.id, 'address', event.target.value)} /></label>
                          <label className="modern-field"><span>Capacity</span><input type="number" min="1" value={pickup.capacity} onChange={(event) => pickupUpdate(pickup.id, 'capacity', event.target.value)} /></label>
                        </div>
                        <label className="modern-field full"><span>Notes</span><textarea value={pickup.notes} onChange={(event) => pickupUpdate(pickup.id, 'notes', event.target.value)} rows="2" /></label>
                      </div>
                    ))}
                    <button type="button" className="btn secondary" onClick={addPickupLocation}><Plus size={14}/> Add Pickup Location</button>
                  </>
                )}
              </div>

              <div className="event-form-section">
                <h3>8. Event reminders</h3>
                <label className="check"><input type="checkbox" checked={sendReminders} onChange={(event) => setSendReminders(event.target.checked)} /> Send event reminders</label>
                {sendReminders && (
                  <>
                    <div className="check-grid">
                      {REMINDER_OPTIONS.map((option) => (
                        <label className="check inline" key={option.minutes}><input type="checkbox" checked={selectedReminders.includes(option.minutes)} onChange={() => setSelectedReminders((current) => current.includes(option.minutes) ? current.filter((item) => item !== option.minutes) : [...current, option.minutes])} /> {option.label}</label>
                      ))}
                    </div>
                    <label className="check"><input type="checkbox" checked={customReminderValue !== ''} onChange={() => setCustomReminderValue((current) => current ? '' : '1')} /> Custom reminder</label>
                    {customReminderValue !== '' && (
                      <div className="modern-field-grid">
                        <label className="modern-field"><span>Custom reminder value</span><input type="number" min="1" value={customReminderValue} onChange={(event) => setCustomReminderValue(event.target.value)} /></label>
                        <label className="modern-field"><span>Unit</span><select value={customReminderUnit} onChange={(event) => setCustomReminderUnit(event.target.value)}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="event-form-section">
                <h3>9. Notifications</h3>
                <label className="check"><input type="checkbox" checked={notifyOnPublish} onChange={(event) => setNotifyOnPublish(event.target.checked)} /> Notify members when published</label>
                {notifyOnPublish && (
                  <>
                    <label className="modern-field full"><span>Notification title</span><input value={notificationTitle} onChange={(event) => setNotificationTitle(event.target.value)} placeholder={title || 'Event title'} /></label>
                    <label className="modern-field full"><span>Notification message</span><textarea value={notificationMessage} onChange={(event) => setNotificationMessage(event.target.value)} rows="3" placeholder="Join us this Sunday for our Celebration Service." /></label>
                    <label className="modern-field full"><span>Audience</span><select value={audience} onChange={(event) => setAudience(event.target.value)}>{AUDIENCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  </>
                )}
              </div>

              <div className="event-form-section">
                <h3>10. Event settings</h3>
                <label className="modern-field full"><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="Public">Public</option><option value="Members only">Members only</option><option value="Restricted audience">Restricted audience</option></select></label>
                <label className="modern-field full"><span>Event status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></label>
              </div>

              {error && <div className="event-form-error" role="alert">{error}</div>}
            </>
          ) : (
            <div className="event-form-review">
              <h3>Publish confirmation</h3>
              {confirmationPreview}
              <p className="muted">Review the event details before publishing. You can still go back and edit.</p>
            </div>
          )}
        </div>
        <div className="event-modal-footer">
          {previewMode ? (
            <>
              <button type="button" className="btn secondary" onClick={() => setPreviewMode(false)}>Back to edit</button>
              <button type="button" className="btn primary" onClick={() => saveEvent('publish')} disabled={saving}>{saving ? 'Publishing...' : 'Confirm publish'}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn secondary" onClick={() => saveEvent('draft')} disabled={saving}>{saving ? 'Saving...' : 'Save Draft'}</button>
              <button type="button" className="btn primary" onClick={() => { const validationError = validate(); if (validationError) { setError(validationError); return } setPreviewMode(true) }} disabled={saving}>Publish Event</button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
