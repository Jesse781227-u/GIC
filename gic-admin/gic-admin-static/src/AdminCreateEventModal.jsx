import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, X, Plus, Trash2, Upload, Image as ImageIcon, Video } from 'lucide-react'
import { adminAuth } from './firebase'
import { activateAllPickupPoints, activePickupPoints, applyPickupTimeToActive, clearPickupPoints, mapPickupPoints, setPickupActive } from './pickupSelection'
import { getGicServiceRecurrence } from './eventSchedule'
import { fetchAdminApi as adminApi } from './adminApi'

const API_BASE = import.meta.env.VITE_API_URL || 'https://gic-backend-lx3q.onrender.com'
const EVENT_TYPES = ['Service', 'Conference', 'Wedding', 'Children', 'Outreach', 'Meeting', 'Retreat', 'Convention', 'Fellowship', 'Training', 'Special Event', 'Other']
const EVENT_FORMATS = ['PHYSICAL', 'ONLINE', 'HYBRID']
const STREAM_PLATFORMS = ['Mixlr', 'YouTube', 'Facebook', 'Zoom', 'Other']
const REMINDER_OPTIONS = [
  { label: '1 week before', minutes: 10080 },
  { label: '1 day before', minutes: 1440 },
  { label: '1 hour before', minutes: 60 },
  { label: '30 minutes before', minutes: 30 },
]
const FORM_FIELD_TYPES = [
  ['text', 'Short text'], ['textarea', 'Long text'], ['number', 'Number'], ['phone', 'Phone'],
  ['email', 'Email'], ['date', 'Date'], ['select', 'Dropdown'], ['radio', 'Radio'], ['checkbox', 'Checkbox'],
]

async function uploadEventFlyer(file) {
  const user = adminAuth.currentUser
  if (!user) throw new Error('Admin session is unavailable')
  const token = await user.getIdToken()
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE}/api/admin/notifications/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Video upload failed.')
  return payload.media
}

function toDateTimeValue(date, time) {
  if (!date || !time) return ''
  return `${date}T${time}`
}

function toIso(date, time, timeZone = 'Africa/Lagos') {
  if (!date || !time) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const expected = Date.UTC(year, month - 1, day, hour, minute, 0)
  if (!Number.isFinite(expected)) return null
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  let instant = expected
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]))
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
    const correction = expected - represented
    instant += correction
    if (!correction) break
  }
  const check = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]))
  if (`${check.year}-${check.month}-${check.day}` !== date || `${check.hour}:${check.minute}` !== time) return null
  return new Date(instant).toISOString()
}

function toPlatformId(platform) {
  const value = platform.toLowerCase().replaceAll(' ', '_')
  return ['zoom', 'youtube', 'mixlr', 'google_meet'].includes(value) ? value : 'other'
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

function makeRegistrationField(label = '') {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, label, type: 'text', required: false }
}

function makeTicketType() {
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: '', price: '', quantity: '' }
}

export default function AdminCreateEventModal({ onClose, onCreated }) {
  const [organizations, setOrganizations] = useState([])
  const [pickupPoints, setPickupPoints] = useState([])
  const [title, setTitle] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [fullDescription, setFullDescription] = useState('')
  const [eventType, setEventType] = useState('Service')
  const [organizationKey, setOrganizationKey] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [flyerUrl, setFlyerUrl] = useState('')
  const [flyerMedia, setFlyerMedia] = useState(null)
  const [flyerVideoPreview, setFlyerVideoPreview] = useState('')
  const [uploadingFlyer, setUploadingFlyer] = useState(false)
  const [additionalImages, setAdditionalImages] = useState([])
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [timeZone, setTimeZone] = useState('Africa/Lagos')
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
  const [attendanceMode, setAttendanceMode] = useState('view_only')
  const [eventAudienceKind, setEventAudienceKind] = useState('everyone')
  const [eventAudienceId, setEventAudienceId] = useState('')
  const [registrationEligibility, setRegistrationEligibility] = useState('members')
  const [registrantModel, setRegistrantModel] = useState('self')
  const [childMinAge, setChildMinAge] = useState('0')
  const [childMaxAge, setChildMaxAge] = useState('17')
  const [registrationOpensDate, setRegistrationOpensDate] = useState('')
  const [registrationOpensTime, setRegistrationOpensTime] = useState('')
  const [registrationClosesDate, setRegistrationClosesDate] = useState('')
  const [registrationClosesTime, setRegistrationClosesTime] = useState('')
  const [capacityType, setCapacityType] = useState('UNLIMITED')
  const [capacity, setCapacity] = useState('')
  const [ticketProvider, setTicketProvider] = useState('flutterwave')
  const [ticketCurrency, setTicketCurrency] = useState('NGN')
  const [ticketTypes, setTicketTypes] = useState([makeTicketType()])
  const [refundPolicy, setRefundPolicy] = useState('')
  const [waitlistEnabled, setWaitlistEnabled] = useState(false)
  const [sendConfirmation, setSendConfirmation] = useState(false)
  const [registrationFormMode, setRegistrationFormMode] = useState('NO_FORM')
  const [registrationFields, setRegistrationFields] = useState([])
  const [savedForms, setSavedForms] = useState([])
  const [churchBusAvailable, setChurchBusAvailable] = useState(false)
  const [pickupLocations, setPickupLocations] = useState([])
  const [uniformPickupTime, setUniformPickupTime] = useState('06:30')
  const [sendReminders, setSendReminders] = useState(false)
  const [selectedReminders, setSelectedReminders] = useState([1440, 60, 30])
  const [customReminderValue, setCustomReminderValue] = useState('')
  const [customReminderUnit, setCustomReminderUnit] = useState('minutes')
  const [audienceCollections, setAudienceCollections] = useState({ ministries: [], cells: [], segments: [], groups: [] })
  const [visibility, setVisibility] = useState('members')
  const [status, setStatus] = useState('DRAFT')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [previewMode, setPreviewMode] = useState(false)

  const registrationRequired = attendanceMode !== 'view_only'
  const paidAttendance = attendanceMode === 'register_paid'
  const gicServiceRecurrence = getGicServiceRecurrence(eventType, title)
  const gicServiceType = gicServiceRecurrence?.serviceType || null
  const eventTimeZone = gicServiceType ? 'Africa/Lagos' : timeZone

  useEffect(() => {
    Promise.all([
      adminApi('/api/admin/organizations').then(({ organizations: items = [] }) => setOrganizations(items)),
      adminApi('/api/admin/reference/bus-pickup-points').then(({ pickupPoints: items = [] }) => { setPickupPoints(items); setPickupLocations(mapPickupPoints(items, uniformPickupTime)) }),
      adminApi('/api/admin/groups').then((items) => setAudienceCollections({ ministries: items.ministries || [], cells: items.cells || [], segments: items.segments || [], groups: items.groups || [] })),
      adminApi('/api/admin/events').then(({ events: items = [] }) => setSavedForms(items.filter((item) => Array.isArray(item.registrationForm) && item.registrationForm.length).map((item) => ({ id: item.id, name: item.title, fields: item.registrationForm })))),
    ]).catch(() => {})
  }, [])
  useEffect(() => () => { if (flyerVideoPreview) URL.revokeObjectURL(flyerVideoPreview) }, [flyerVideoPreview])

  const handleFlyerUpload = async (changeEvent) => {
    const file = changeEvent.target.files?.[0]
    if (!file) return
    setError('')
    if (file.type === 'video/mp4') {
      if (file.size > 25 * 1024 * 1024) {
        setError('MP4 videos must be 25 MB or smaller.')
        changeEvent.target.value = ''
        return
      }
      setUploadingFlyer(true)
      try {
        const uploaded = await uploadEventFlyer(file)
        setFlyerMedia(uploaded)
        setFlyerUrl('')
        setFlyerVideoPreview(URL.createObjectURL(file))
      } catch (requestError) {
        setError(requestError.message || 'Video upload failed.')
      } finally {
        setUploadingFlyer(false)
      }
    } else {
      if (file.size > 8 * 1024 * 1024) {
        setError('Event flyer images must be 8 MB or smaller.')
        changeEvent.target.value = ''
        return
      }
      try {
        readImageFile(file, (url) => { setFlyerUrl(url); setFlyerMedia(null); setFlyerVideoPreview('') })
      } catch (requestError) {
        setError(requestError.message || 'Flyer upload failed.')
      }
    }
    changeEvent.target.value = ''
  }

  const eventAudienceChoices = eventAudienceKind === 'ministry'
    ? audienceCollections.ministries
    : eventAudienceKind === 'group'
      ? [...audienceCollections.cells, ...audienceCollections.segments]
      : []

  const pickupUpdate = (pickupPointId, field, value) => setPickupLocations((current) => current.map((pickup) => pickup.busPickupPointId === pickupPointId ? { ...pickup, [field]: value } : pickup))
  const togglePickupPoint = (pickupPointId, active) => setPickupLocations((current) => setPickupActive(current, pickupPointId, active))
  const activateAllPickups = () => setPickupLocations((current) => activateAllPickupPoints(pickupPoints, current, uniformPickupTime))
  const clearAllPickups = () => setPickupLocations((current) => clearPickupPoints(current))
  const applyUniformPickupTime = () => setPickupLocations((current) => applyPickupTimeToActive(current, uniformPickupTime))

  const updateTicketType = (id, key, value) => setTicketTypes((current) => current.map((ticket) => ticket.id === id ? { ...ticket, [key]: value } : ticket))
  const addTicketType = () => setTicketTypes((current) => [...current, makeTicketType()])
  const removeTicketType = (id) => setTicketTypes((current) => current.length > 1 ? current.filter((ticket) => ticket.id !== id) : current)

  const validate = () => {
    if (!title.trim()) return 'Event title is required.'
    if (!flyerUrl && !flyerMedia?.id) return 'An event flyer is required.'
    if (!shortDescription.trim()) return 'Short description is required.'
    if (!eventType) return 'Event type is required.'
    if (!startDate || (!allDayEvent && !startTime)) return 'Start date and time are required.'
    if (!endDate || (!allDayEvent && !endTime)) return 'End date and time are required.'
    if (gicServiceType) {
      const expectedWeekday = gicServiceType === 'sunday-service' ? 0 : 3
      if (new Date(`${startDate}T00:00:00Z`).getUTCDay() !== expectedWeekday) return `${gicServiceType === 'sunday-service' ? 'Sunday Service' : 'Midweek Service'} must start on its recurring service weekday.`
    }
    const startsAt = toIso(startDate, allDayEvent ? '00:00' : startTime, eventTimeZone)
    const endsAt = toIso(endDate, allDayEvent ? '23:59' : endTime, eventTimeZone)
    if (!startsAt || !endsAt) return 'The selected date or time is invalid in this timezone.'
    if (new Date(endsAt) <= new Date(startsAt)) return 'End date/time must be after the start date/time.'
    if ((eventFormat === 'PHYSICAL' || eventFormat === 'HYBRID') && !venueName.trim()) return 'Venue name is required for physical or hybrid events.'
    if ((eventFormat === 'PHYSICAL' || eventFormat === 'HYBRID') && !address.trim()) return 'Address is required for physical or hybrid events.'
    if (eventFormat === 'ONLINE' || eventFormat === 'HYBRID') {
      if (!streamOnline) return 'Enable online access for an online or hybrid event.'
      if (!streamPlatform) return 'Please select a streaming platform.'
      if (!streamUrl.trim()) return 'Stream URL is required for an online or hybrid event.'
    }
    if (registrationRequired) {
      if (!registrationOpensDate || !registrationOpensTime) return 'Registration opening date/time is required.'
      if (!registrationClosesDate || !registrationClosesTime) return 'Registration closing date/time is required.'
      const registrationOpensAt = toIso(registrationOpensDate, registrationOpensTime, eventTimeZone)
      const registrationClosesAt = toIso(registrationClosesDate, registrationClosesTime, eventTimeZone)
      if (!registrationOpensAt || !registrationClosesAt) return 'Registration times are invalid in the selected timezone.'
      if (new Date(registrationClosesAt) <= new Date(registrationOpensAt)) return 'Registration close time must be after the open time.'
      if (new Date(registrationClosesAt) > new Date(endsAt)) return 'Registration cannot close after the event ends.'
      if (capacityType === 'LIMITED' && (!capacity || Number(capacity) <= 0)) return 'Capacity is required when registration is limited.'
      if (registrantModel === 'parent_registers_children' && Number(childMaxAge) < Number(childMinAge)) return 'Child maximum age must be greater than or equal to the minimum age.'
    }
    if (paidAttendance && (!ticketTypes.length || ticketTypes.some((ticket) => !ticket.name.trim() || ticket.price === '' || !Number.isInteger(Number(ticket.price)) || Number(ticket.price) < 0 || (ticket.quantity !== '' && (!Number.isInteger(Number(ticket.quantity)) || Number(ticket.quantity) < 1))) || !ticketTypes.some((ticket) => Number(ticket.price) > 0))) return 'Add valid ticket names and whole-number prices in minor currency units; at least one ticket must cost more than zero.'
    if (['ministry', 'group'].includes(eventAudienceKind) && !eventAudienceId) return 'Choose the ministry or group for this audience.'
    if (visibility === 'ministry' && eventAudienceKind !== 'ministry') return 'Ministry visibility requires a ministry audience.'
    if (churchBusAvailable && activePickupPoints(pickupLocations).length === 0) return 'Activate at least one GIC pickup point when church bus transportation is enabled.'
    return ''
  }

  const buildPayload = () => {
    const separator = organizationKey.indexOf('_')
    const organizationKind = separator < 0 ? null : organizationKey.slice(0, separator)
    const organizationId = separator < 0 ? null : organizationKey.slice(separator + 1)
    const recurrence = gicServiceRecurrence
      ? gicServiceRecurrence
      : recurringEvent ? { frequency: repeatType === 'Daily' ? 'daily' : repeatType === 'Monthly' ? 'monthly' : 'weekly', interval: 1 } : null
    const audienceId = eventAudienceId
    const eventAudience = eventAudienceKind === 'ministry'
      ? { kind: 'ministry', ministryIds: audienceId ? [audienceId] : [] }
      : eventAudienceKind === 'group'
        ? { kind: 'group', groupIds: audienceId ? [audienceId] : [] }
        : { kind: eventAudienceKind }
    const start = toIso(startDate, allDayEvent ? '00:00' : startTime, eventTimeZone)
    const end = toIso(endDate || startDate, allDayEvent ? '23:59' : endTime || startTime, eventTimeZone)
    const reminderOffsets = Array.from(new Set([
      ...selectedReminders,
      ...(customReminderValue && Number(customReminderValue) > 0 ? [Number(customReminderValue) * (customReminderUnit === 'hours' ? 60 : customReminderUnit === 'days' ? 1440 : 1)] : []),
    ]))
    const ticketTypeValues = paidAttendance ? ticketTypes.map((ticket) => ({
      id: ticket.id,
      name: ticket.name.trim(),
      price: { amount: Number(ticket.price), currency: ticketCurrency },
      ...(ticket.quantity ? { quantityAvailable: Number(ticket.quantity) } : {}),
    })) : []
    const location = eventFormat === 'ONLINE'
      ? { mode: 'online', online: { platform: toPlatformId(streamPlatform), url: streamUrl.trim(), instructions: streamInstructions.trim() || undefined, revealTo: 'registered_only' } }
      : eventFormat === 'HYBRID'
        ? { mode: 'hybrid', venue: { name: venueName.trim(), address: address.trim(), landmark: landmark.trim() || undefined, mapUrl: locationLink.trim() || undefined }, online: { platform: toPlatformId(streamPlatform), url: streamUrl.trim(), instructions: streamInstructions.trim() || undefined, revealTo: 'registered_only' } }
        : { mode: 'physical', venue: { name: venueName.trim(), address: address.trim(), landmark: landmark.trim() || undefined, mapUrl: locationLink.trim() || undefined } }
    return {
      title: title.trim(),
      description: fullDescription.trim() || shortDescription.trim() || null,
      eventType,
      startsAt: start,
      endsAt: allDayEvent ? null : end,
      recurrenceRule: recurrence,
      location: eventFormat === 'ONLINE' ? 'Online' : venueName || null,
      venueName: (eventFormat === 'PHYSICAL' || eventFormat === 'HYBRID') ? venueName || null : null,
      address: (eventFormat === 'PHYSICAL' || eventFormat === 'HYBRID') ? address || null : null,
      mapInfo: locationLink || null,
      isPaid: paidAttendance,
      price: paidAttendance ? Number(ticketTypes[0]?.price || 0) : null,
      status: 'DRAFT',
      timeZone: eventTimeZone,
      allowRegistrationCancellation: true,
      registrationForm: registrationRequired ? registrationFields : [],
      registrationRequired,
      registrationOpensAt: registrationRequired ? toIso(registrationOpensDate, registrationOpensTime, eventTimeZone) : null,
      registrationClosesAt: registrationRequired ? toIso(registrationClosesDate, registrationClosesTime, eventTimeZone) : null,
      registrationCapacity: registrationRequired && capacityType === 'LIMITED' ? Number(capacity) : null,
      allowWaitlist: registrationRequired && waitlistEnabled,
      isOnline: eventFormat !== 'PHYSICAL',
      onlineUrl: streamOnline ? streamUrl.trim() || null : null,
      onlinePlatform: streamOnline ? streamPlatform || null : null,
      onlineAccessInstructions: streamOnline ? streamInstructions.trim() || null : null,
      busTransportEnabled: churchBusAvailable,
      locationType: eventFormat,
      notifyOnPublish: true,
      sendRegistrationConfirmation: registrationRequired && sendConfirmation,
      organizationKind,
      organizationId,
      organizerContactPerson: contactName.trim() || null,
      organizerContactPhone: contactPhone.trim() || null,
      imageUrl: flyerUrl || null,
      builderData: {
        shortDescription: shortDescription.trim(),
        fullDescription: fullDescription.trim(),
        type: ({ Service: 'service', Conference: 'conference', Wedding: 'wedding', Children: 'children', Outreach: 'outreach', Meeting: 'meeting', Retreat: 'retreat' })[eventType] || 'other',
        visibility,
        audience: eventAudience,
        flyerUrl,
        flyerMediaId: flyerMedia?.id,
        flyerMediaType: flyerMedia?.mediaType,
        galleryUrls: additionalImages,
        contact: contactName.trim() || contactPhone.trim() || contactEmail.trim() ? { name: contactName.trim(), phone: contactPhone.trim() || undefined, email: contactEmail.trim() || undefined } : undefined,
        coOrganizerIds: [],
        schedule: { timezone: timeZone, start, end, allDay: allDayEvent, recurrence: recurrence || undefined },
        location,
        attendance: attendanceMode,
        registration: registrationRequired ? {
          opensAt: toIso(registrationOpensDate, registrationOpensTime, eventTimeZone),
          closesAt: toIso(registrationClosesDate, registrationClosesTime, eventTimeZone),
          eligibility: registrationEligibility,
          capacity: capacityType === 'LIMITED' ? { kind: 'limited', max: Number(capacity) } : { kind: 'unlimited' },
          waitlist: waitlistEnabled,
          registrantModel,
          ...(registrantModel === 'parent_registers_children' ? { childFields: { minAge: Number(childMinAge), maxAge: Number(childMaxAge), collectAllergies: true, collectEmergencyContact: true, collectAuthorizedPickup: true, requirePhotoConsent: false, checkInOutCode: true } } : {}),
          fields: registrationFields.map(({ type, ...field }) => ({ ...field, kind: type })),
          allowSelfCancel: true,
        } : undefined,
        ticketing: paidAttendance ? { provider: ticketProvider, ticketTypes: ticketTypeValues, refundPolicy, issueQrTickets: true } : undefined,
        transport: churchBusAvailable ? { pickupPoints: activePickupPoints(pickupLocations).map((pickup) => ({ id: pickup.busPickupPointId, name: pickup.name.trim(), address: pickup.address.trim(), pickupTime: toIso(startDate, pickup.pickupTime || startTime || '09:00', eventTimeZone), seats: Number(pickup.capacity || 1), seatsTaken: 0 })), feeIncludedInTicket: false, returnTrip: false, requireSelection: true } : undefined,
        streaming: streamOnline ? { platform: toPlatformId(streamPlatform), url: streamUrl.trim(), instructions: streamInstructions.trim() || undefined, revealTo: 'registered_only' } : undefined,
        reminders: { enabled: sendReminders, offsetsMinutes: sendReminders ? reminderOffsets : [], channels: ['in_app', 'push'] },
        announcement: { notifyOnPublish: true, title: title.trim(), message: shortDescription.trim() || fullDescription.trim(), audience: eventAudience, channels: ['in_app', 'push'] },
      },
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
        for (const pickup of activePickupPoints(pickupLocations)) {
          await adminApi(`/api/admin/events/${created.id}/pickup-locations`, {
            method: 'POST',
            body: JSON.stringify({
              busPickupPointId: pickup.busPickupPointId || null,
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
          body: JSON.stringify({ status: 'PUBLISHED', notifyMembers: true }),
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
        {flyerVideoPreview ? <video src={flyerVideoPreview} controls playsInline /> : flyerUrl ? <img src={flyerUrl} alt={title || 'Event flyer'} /> : <div className="event-image-placeholder"><CalendarDays size={18} /></div>}
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

  return createPortal((
    <div className="event-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-event-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="event-modal" onSubmit={(event) => { event.preventDefault(); if (status === 'PUBLISHED') setPreviewMode(true); else saveEvent('draft'); }}>
        <div className="event-modal-header"><div><h2 id="create-event-title">Create Event</h2><p>Add a practical event to the GIC platform</p></div><button type="button" className="event-modal-close" aria-label="Close create event" onClick={onClose}><X size={18}/></button></div>
        <div className="event-modal-body event-builder-body">
          {!previewMode ? (
            <>
              <div className="event-form-section attendance-mode-section">
                <h3>Attendance mode</h3>
                <p className="event-section-description">What must attendees do?</p>
                <div className="segmented-row">
                  <label className="segment-option"><input type="radio" name="attendance-mode" checked={attendanceMode === 'view_only'} onChange={() => setAttendanceMode('view_only')} /> View only</label>
                  <label className="segment-option"><input type="radio" name="attendance-mode" checked={attendanceMode === 'register_free'} onChange={() => setAttendanceMode('register_free')} /> Register free</label>
                  <label className="segment-option"><input type="radio" name="attendance-mode" checked={attendanceMode === 'register_paid'} onChange={() => setAttendanceMode('register_paid')} /> Register paid</label>
                </div>
                {paidAttendance&&<p className="event-section-description paid-event-note">Paid events are saved as drafts; payment processing must be enabled before publishing.</p>}
              </div>

              <div className="event-form-section">
                <h3>Event details</h3>
                <p className="event-section-description">Add the basic information people will see about this event.</p>
                <label className="modern-field full"><span>Event title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength="240" required /></label>
                <label className="modern-field full"><span>Short description</span><textarea value={shortDescription} onChange={(event) => setShortDescription(event.target.value)} rows="3" required /></label>
                <label className="modern-field full"><span>Full description</span><textarea value={fullDescription} onChange={(event) => setFullDescription(event.target.value)} rows="5" /></label>
                <label className="modern-field full"><span>Event type</span><select value={eventType} onChange={(event) => setEventType(event.target.value)}>{EVENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label className="modern-field full"><span>Organizing unit / fellowship</span><select value={organizationKey} onChange={(event) => setOrganizationKey(event.target.value)}><option value="">No organization</option>{organizations.map((item) => <option value={`${item.kind || 'ministry'}_${item.id}`} key={item.id}>{item.name} · {item.type || item.kind || 'Organization'}</option>)}</select></label>
                <div className="modern-field-grid"><label className="modern-field"><span>Contact name</span><input value={contactName} onChange={(event)=>setContactName(event.target.value)}/></label><label className="modern-field"><span>Contact phone</span><input type="tel" value={contactPhone} onChange={(event)=>setContactPhone(event.target.value)}/></label></div>
                <label className="modern-field full"><span>Contact email</span><input type="email" value={contactEmail} onChange={(event)=>setContactEmail(event.target.value)}/></label>
                <label className="modern-field full"><span>Event flyer or video</span><div className={`flyer-upload ${flyerUrl || flyerVideoPreview ? 'has-image' : 'empty'}`}>
                  <input id="event-flyer-input" className="file-input-hidden" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={handleFlyerUpload} />
                  {flyerVideoPreview ? <><video src={flyerVideoPreview} controls playsInline /><div className="flyer-upload-actions"><label className="upload-action" htmlFor="event-flyer-input">Change</label><button type="button" className="upload-action" onClick={() => { setFlyerMedia(null); setFlyerVideoPreview('') }}>Remove</button></div></> : flyerUrl ? <><img src={flyerUrl} alt="Event flyer preview" /><div className="flyer-upload-actions"><label className="upload-action" htmlFor="event-flyer-input">Change</label><button type="button" className="upload-action" onClick={() => setFlyerUrl('')}>Remove</button></div></> : <label className="flyer-upload-copy" htmlFor="event-flyer-input"><Upload size={20}/><b>{uploadingFlyer ? 'Uploading video...' : 'Upload image or MP4 video'}</b><small>Images up to 8 MB · MP4 up to 25 MB</small></label>}
                </div></label>
                <div className="modern-field full"><span>Additional images</span><input id="additional-images-input" className="file-input-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => {
                  const files = Array.from(event.target.files || [])
                  files.forEach((file) => { try { readImageFile(file, (url) => setAdditionalImages((current) => [...current, url])) } catch (requestError) { setError(requestError.message || 'Image upload failed.') } })
                  event.target.value = ''
                }} /><label className="upload-action" htmlFor="additional-images-input"><ImageIcon size={13}/> Add images</label></div>
                {additionalImages.length > 0 && <div className="image-gallery-preview">{additionalImages.map((url, index) => <div className="image-gallery-preview-item" key={`${url}-${index}`}><img src={url} alt={`Additional event ${index + 1}`} /><button type="button" onClick={() => setAdditionalImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove additional image ${index + 1}`}>×</button></div>)}</div>}
              </div>

              <div className="event-form-section">
                <h3>Date & time</h3>
                <p className="event-section-description">Set when the event starts and ends.</p>
                <div className="modern-field-grid">
                  <label className="modern-field"><span>Start date</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label>
                  <label className="modern-field"><span>Start time</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required={!allDayEvent} disabled={allDayEvent} /></label>
                </div>
                <div className="modern-field-grid">
                  <label className="modern-field"><span>End date</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label>
                  <label className="modern-field"><span>End time</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required={!allDayEvent} disabled={allDayEvent} /></label>
                </div>
                <label className="modern-field full"><span>Timezone</span><select value={eventTimeZone} disabled={Boolean(gicServiceType)} onChange={(event)=>setTimeZone(event.target.value)}><option value="Africa/Lagos">Africa/Lagos (WAT)</option><option value="UTC">UTC</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select></label>
                <label className="check"><input type="checkbox" checked={allDayEvent} onChange={(event) => setAllDayEvent(event.target.checked)} /> All-day event</label>
                {gicServiceType ? <p className="service-recurrence-note">{gicServiceType==='sunday-service'?'Sunday Service repeats every Sunday.':'Midweek Service repeats every Wednesday.'} Occurrences and reminders are scheduled automatically.</p> : <label className="check"><input type="checkbox" checked={recurringEvent} onChange={(event) => setRecurringEvent(event.target.checked)} /> Recurring event</label>}
                {recurringEvent&&!gicServiceType&&<label className="modern-field full"><span>Repeat</span><select value={repeatType} onChange={(event) => setRepeatType(event.target.value)}><option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option></select></label>}
              </div>

              <div className="event-form-section">
                <h3>Location</h3>
                <p className="event-section-description">Tell attendees where to join this event.</p>
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
                <h3>Streaming / online</h3>
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
                <h3>Registration</h3>
                <p className="event-section-description">{attendanceMode==='register_paid'?'Registration is required for paid attendance.':attendanceMode==='register_free'?'Registration is required for free attendance.':'Registration is off in view-only mode.'}</p>
                {registrationRequired && (
                  <>
                    <div className="modern-field-grid">
                      <label className="modern-field"><span>Eligibility</span><select value={registrationEligibility} onChange={(event)=>setRegistrationEligibility(event.target.value)}><option value="members">Members</option><option value="anyone">Anyone</option><option value="invite_only">Invite only</option></select></label>
                      <label className="modern-field"><span>Who is being registered?</span><select value={registrantModel} onChange={(event)=>setRegistrantModel(event.target.value)}><option value="self">Self</option><option value="self_plus_guests">Self plus guests</option><option value="parent_registers_children">Parent registers children</option></select></label>
                    </div>
                    {registrantModel==='parent_registers_children'&&<div className="modern-field-grid"><label className="modern-field"><span>Child minimum age</span><input type="number" min="0" max="18" value={childMinAge} onChange={(event)=>setChildMinAge(event.target.value)}/></label><label className="modern-field"><span>Child maximum age</span><input type="number" min={childMinAge} max="18" value={childMaxAge} onChange={(event)=>setChildMaxAge(event.target.value)}/></label></div>}
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
                    <label className="modern-field full"><span>Registration form</span><select value={registrationFormMode} onChange={(event) => { const value = event.target.value; setRegistrationFormMode(value); if (value === 'NO_FORM') setRegistrationFields([]); if (value === 'CREATE_NEW_FORM' && !registrationFields.length) setRegistrationFields([makeRegistrationField('Full name')]); if (value.startsWith('EXISTING_FORM:')) { const form = savedForms.find((item) => item.id === value.slice(14)); setRegistrationFields(form?.fields || []) } }}><option value="NO_FORM">No additional form</option>{savedForms.map((form) => <option key={form.id} value={`EXISTING_FORM:${form.id}`}>{form.name}</option>)}<option value="CREATE_NEW_FORM">Create new form</option></select></label>
                    {registrationFormMode === 'CREATE_NEW_FORM' && <div className="registration-builder">
                      <div className="registration-builder-head"><b>Registration fields</b><button type="button" className="btn secondary" onClick={() => setRegistrationFields((current) => [...current, makeRegistrationField()])}><Plus size={12}/> Add field</button></div>
                      {registrationFields.map((field) => <div className="registration-field-row" key={field.id}><input value={field.label} onChange={(event) => setRegistrationFields((current) => current.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item))} placeholder="Field label" /><select value={field.type} onChange={(event) => setRegistrationFields((current) => current.map((item) => item.id === field.id ? { ...item, type: event.target.value } : item))}>{FORM_FIELD_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><label className="check"><input type="checkbox" checked={field.required} onChange={(event) => setRegistrationFields((current) => current.map((item) => item.id === field.id ? { ...item, required: event.target.checked } : item))}/> Required</label><button type="button" className="icon-btn" onClick={() => setRegistrationFields((current) => current.filter((item) => item.id !== field.id))} aria-label="Remove form field"><Trash2 size={13}/></button></div>)}
                    </div>}
                  </>
                )}
              </div>

              {paidAttendance&&<div className="event-form-section"><h3>Ticketing</h3><p className="event-section-description">Prices are stored in minor currency units (kobo for NGN).</p><div className="modern-field-grid"><label className="modern-field"><span>Payment provider</span><select value={ticketProvider} onChange={(event)=>setTicketProvider(event.target.value)}><option value="flutterwave">Flutterwave</option><option value="paystack">Paystack</option><option value="stripe">Stripe</option></select></label><label className="modern-field"><span>Currency</span><select value={ticketCurrency} onChange={(event)=>setTicketCurrency(event.target.value)}><option value="NGN">NGN</option><option value="USD">USD</option><option value="GBP">GBP</option></select></label></div>{ticketTypes.map((ticket,index)=><div className="ticket-type-row" key={ticket.id}><div className="speaker-header"><strong>Ticket type {index+1}</strong>{ticketTypes.length>1&&<button type="button" className="icon-btn" aria-label={`Remove ticket type ${index+1}`} onClick={()=>removeTicketType(ticket.id)}><Trash2 size={13}/></button>}</div><div className="modern-field-grid"><label className="modern-field"><span>Name</span><input value={ticket.name} onChange={(event)=>updateTicketType(ticket.id,'name',event.target.value)} placeholder="General" required/></label><label className="modern-field"><span>Price ({ticketCurrency} minor units)</span><input type="number" min="0" step="1" value={ticket.price} onChange={(event)=>updateTicketType(ticket.id,'price',event.target.value)} required/></label></div><label className="modern-field"><span>Quantity available (blank is unlimited)</span><input type="number" min="1" step="1" value={ticket.quantity} onChange={(event)=>updateTicketType(ticket.id,'quantity',event.target.value)}/></label></div>)}<button type="button" className="btn secondary" onClick={addTicketType}><Plus size={14}/> Add ticket type</button><label className="modern-field full"><span>Refund policy</span><textarea value={refundPolicy} onChange={(event)=>setRefundPolicy(event.target.value)} rows="2"/></label></div>}

              <div className="event-form-section">
                <h3>Transportation</h3>
                <label className="check"><input type="checkbox" checked={churchBusAvailable} onChange={(event) => setChurchBusAvailable(event.target.checked)} /> Church bus transportation available</label>
                {churchBusAvailable && (
                  <>
                    <div className="pickup-bulk-actions">
                      <button type="button" className="btn secondary compact" onClick={activateAllPickups}>Activate all</button>
                      <button type="button" className="btn secondary compact" onClick={clearAllPickups}>Clear all</button>
                    </div>
                    {!pickupPoints.length && <p className="field-help">No active GIC pickup points are available.</p>}
                    <div className="pickup-uniform-time">
                      <label className="modern-field compact-field"><span>Uniform pickup time</span><input type="time" value={uniformPickupTime} onChange={(event)=>setUniformPickupTime(event.target.value)} /></label>
                      <button type="button" className="btn secondary compact" onClick={applyUniformPickupTime} disabled={!activePickupPoints(pickupLocations).length}>Apply to all</button>
                    </div>
                    <div className="pickup-point-list">
                      {pickupLocations.map((pickup) => {
                        const point = pickupPoints.find((item) => item.id === pickup.busPickupPointId)
                        return (
                          <div className={`pickup-point-row ${pickup.active ? 'is-active' : ''}`} key={pickup.busPickupPointId}>
                            <div className="pickup-point-top">
                              <label className="pickup-point-choice" aria-label={`Toggle ${pickup.name}`}>
                                <input type="checkbox" checked={pickup.active} onChange={(event) => togglePickupPoint(pickup.busPickupPointId, event.target.checked)} />
                              </label>
                              <div className="pickup-point-meta">
                                <div className="pickup-point-name">{pickup.name}</div>
                                {(point?.managerName || point?.managerPhone) && (
                                  <div className="pickup-point-contact">
                                    {point?.managerName && <span>{point.managerName}</span>}
                                    {point?.managerPhone && <span>{point.managerPhone}</span>}
                                  </div>
                                )}
                                {pickup.address && <div className="pickup-point-address">{pickup.address}</div>}
                                <div className="pickup-point-footer">
                                  <span>Pickup: {pickup.pickupTime || uniformPickupTime}</span>
                                  <span>Capacity: {pickup.capacity || '—'}</span>
                                </div>
                              </div>
                            </div>
                            {pickup.active && (
                              <div className="pickup-point-fields">
                                <label className="modern-field compact-field"><span>Pickup time</span><input type="time" value={pickup.pickupTime} onChange={(event) => pickupUpdate(pickup.busPickupPointId, 'pickupTime', event.target.value)} /></label>
                                <label className="modern-field compact-field"><span>Capacity</span><input type="number" min="1" value={pickup.capacity} onChange={(event) => pickupUpdate(pickup.busPickupPointId, 'capacity', event.target.value)} /></label>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="event-form-section">
                <h3>Notifications & reminders</h3>
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
                <h3>Publish notification</h3>
                <p className="event-section-description">A notification with the event title and description is sent to members when this event is published.</p>
              </div>

              <div className="event-form-section">
                <h3>Audience & visibility</h3>
                <div className="modern-field-grid"><label className="modern-field"><span>Who can see this event?</span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="public">Public</option><option value="members">Members</option><option value="ministry">Ministry</option><option value="invite_only">Invite only</option></select></label><label className="modern-field"><span>Audience</span><select value={eventAudienceKind} onChange={(event)=>{setEventAudienceKind(event.target.value);setEventAudienceId('')}}><option value="everyone">Everyone</option><option value="members">Members</option><option value="ministry">Ministry</option><option value="group">Group</option></select></label></div>
                {['ministry','group'].includes(eventAudienceKind)&&<label className="modern-field full"><span>Select {eventAudienceKind}</span><select value={eventAudienceId} onChange={(event)=>setEventAudienceId(event.target.value)}><option value="">Choose audience</option>{eventAudienceChoices.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
                <p className="event-section-description">New events are saved as drafts. Publishing is a separate event action.</p>
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
              <button type="button" className="btn tertiary" onClick={() => setPreviewMode(false)}>Back to edit</button>
              <button type="button" className="btn primary" onClick={() => saveEvent('publish')} disabled={saving||uploadingFlyer}>{saving ? 'Publishing...' : 'Confirm publish'}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn tertiary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn secondary" onClick={() => saveEvent('draft')} disabled={saving||uploadingFlyer}>{saving ? 'Saving...' : 'Save Draft'}</button>
              <button type="button" className="btn primary" onClick={() => { const validationError = validate(); if (validationError) { setError(validationError); return } setPreviewMode(true) }} disabled={saving||uploadingFlyer||paidAttendance} title={paidAttendance?'Payment processing must be enabled before publishing':'Publish event'}>Publish Event</button>
            </>
          )}
        </div>
      </form>
    </div>
  ), document.body)
}
