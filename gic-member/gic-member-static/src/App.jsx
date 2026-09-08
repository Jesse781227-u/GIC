import React, { useState, useEffect } from 'react'
import {
  ArrowLeft, ArrowRight, Bell, CalendarDays, Camera, Check, ChevronRight,
  Clock3, ChevronDown, Home, Lock, Mail, MapPin, Pencil, Phone, Plus, RefreshCw,
  Search, Settings, ShieldCheck, Smartphone, Ticket, User, Users, Trash2
} from 'lucide-react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'

const events = [
  { id: 'youth-conference-2024', title: 'Youth Conference 2026', date: 'Sat, 24 Oct 2026', time: '10:00 AM', location: 'Global Impact Church, Lekki', image: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=900&q=80', tag: 'Youth' },
  { id: 'prayer-meeting', title: 'Prayer Meeting', date: 'Wed, 7 Oct 2026', time: '6:00 PM', location: 'Online', image: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=900&q=80', tag: 'General' },
  { id: 'women-of-impact', title: 'Women of Impact', date: 'Sat, 7 Nov 2026', time: '10:00 AM', location: 'Global Impact Church', image: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=900&q=80', tag: 'Women' },
  { id: 'leadership-seminar', title: 'Leadership Seminar', date: 'Sat, 9 Jan 2027', time: '10:00 AM', location: 'Global Impact Church', image: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=900&q=80', tag: 'Leadership' },
]

const ministries = [
  { id: 'youth', title: 'Youth Ministry', desc: 'Equipping and raising young leaders.', image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=700&q=80' },
  { id: 'ushering', title: 'Ushering Ministry', desc: 'Serving with excellence and a heart.', image: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=700&q=80' },
  { id: 'media', title: 'Media Ministry', desc: "Telling the story of God's work.", image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=700&q=80' },
]

const ministryOptions = [
  'Youth Ministry', 'Ushering Ministry', 'Media Ministry', 'Choir',
  "Children's Ministry", "Men's Fellowship", "Women's Ministry", 'Prayer Ministry'
]

const serviceCenters = [
  { name: 'The Goodland', times: ['Sunday Services: 07:00AM', 'Sunday Services: 08:45AM', 'Sunday Services: 10:30AM'] },
  { name: 'Surulere Center', times: ['Sunday Services: 07:30AM', 'Sunday Services: 09:30AM', 'Sunday Services: 11:30AM'] },
  { name: 'Lekki Center', times: ['Sunday Service: 09:00AM'] },
  { name: 'Isolo Center', times: [] },
  { name: 'Abuja Center', times: ['Sunday Service: 09:00AM'] },
  { name: 'GIC Canada', times: ['Hamilton Center'] },
  { name: 'GIC, Maryland, USA', times: ['Weekend Service: 04:00PM EST'] },
]

function getSelectedService() {
  return {
    center: localStorage.getItem('gic_member_center') || 'your selected center',
    time: localStorage.getItem('gic_member_service_time') || 'your selected service time',
  }
}

function getSundayServiceCopy() {
  const { center, time } = getSelectedService()
  return {
    summary: `Join us this Sunday at ${center}. Your selected service time is ${time}.`,
    body: [
      `Join us this Sunday at ${center} for worship, the Word, and fellowship at Global Impact Church. Your selected service time is ${time}.`,
      'Come expectant and invite someone to experience the presence of God with us.',
    ],
  }
}

const GIC_LOGO = 'https://i.ibb.co/sJVFXvpS/RPap-R-removebg-preview.png'
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function fetchMemberApi(path, options = {}) {
  const token = localStorage.getItem('gic_auth_token')
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(details || `Request failed: ${response.status}`)
  }

  return response.json()
}

function getSecureMode() {
  return window.isSecureContext || window.location.hostname === 'localhost'
}

function getBrowserName() {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari'
  if (/Firefox\//.test(ua)) return 'Firefox'
  return 'Unknown'
}

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(window.navigator.standalone)
}

function setLocalState(key, value) {
  localStorage.setItem(key, value)
}

function nextStep() {
  if (window.location.pathname !== '/onboarding') {
    return
  }
  window.location.reload()
}

async function registerPushTokenWithBackend(tokenValue) {
  const authToken = localStorage.getItem('gic_auth_token')
  if (!authToken) return { ok: false, reason: 'missing-auth-token' }

  const payload = {
    token: tokenValue,
    platform: navigator.platform || 'web',
    browser: getBrowserName(),
    deviceName: navigator.userAgent,
    notificationPermission: Notification.permission,
    appVersion: '1.0.0',
    lastSeenAt: new Date().toISOString(),
  }

  const response = await fetch(`${API_BASE}/api/push-devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(details || 'Push registration failed')
  }

  const data = await response.json().catch(() => ({}))
  return { ok: true, data }
}

// ── Device Auth Utilities ──────────────────────────────────────────────────
export function getOrCreateDeviceId() {
  let id = localStorage.getItem('gic_device_id')
  if (!id) {
    id = 'dev-' + Math.random().toString(36).substring(2, 8) + '-' + Date.now().toString(36).slice(-4)
    localStorage.setItem('gic_device_id', id)
  }
  return id
}

export async function performDeviceAuth(memberName = 'Member') {
  const deviceId = getOrCreateDeviceId()
  const payload = {
    deviceId,
    deviceName: window.navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
    platform: 'web',
    name: memberName
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Device authentication failed')
    localStorage.setItem('gic_auth_token', data.token)
    localStorage.setItem('gic_member_name', data.member.name)
    localStorage.setItem('gic_auth_method', 'device_auth')
    return data
  } catch (e) {
    console.error('Device authentication failed:', e)
    throw e
  }
}

function Logo({ light = false }) {
  return <div className={`logo ${light ? 'light' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
    <img 
      src={GIC_LOGO} 
      alt="Global Impact Church" 
      style={{ height: '34px', width: 'auto', objectFit: 'contain', filter: light ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' : 'none' }}
    />
  </div>
}

function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={`btn ${variant} ${className}`} {...props}>{children}</button>
}

function Field({ label, value, type = 'text', placeholder, onChange, icon: Icon }) {
  return <label className="field">
    <span>{label}</span>
    <div className="field-wrap">
      {Icon && <Icon size={15} />}
      <input type={type} value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} placeholder={placeholder} onChange={onChange} />
    </div>
  </label>
}

function SelectField({ label, value, onChange, disabled = false, children }) {
  return <label className="field">
    <span>{label}</span>
    <select value={value} onChange={onChange} disabled={disabled}><option value="">Select {label.toLowerCase()}</option>{children}</select>
  </label>
}

function MultiSelectField({ label, values, options, onChange }) {
  const [open, setOpen] = useState(false)
  const toggleValue = (option) => {
    onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option])
  }

  return <div className="field multi-select-field">
    <span>{label}</span>
    <div className="multi-select">
      <button type="button" className="multi-select-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{values.length ? `${values.length} selected` : `Select ${label.toLowerCase()}`}</span>
        <ChevronDown size={15} className={open ? 'multi-select-chevron open' : 'multi-select-chevron'} />
      </button>
      {open && <div className="multi-select-options">
        {options.map((option) => <label key={option} className="multi-select-option">
          <input type="checkbox" checked={values.includes(option)} onChange={() => toggleValue(option)} />
          <span>{option}</span>
        </label>)}
      </div>}
    </div>
  </div>
}

function Back({ to = '/' }) {
  return <Link className="back" to={to}><ArrowLeft size={18} /></Link>
}

function BottomNav({ active = 'home' }) {
  const items = [
    ['home', 'Home', Home, '/home'],
    ['events', 'Events', CalendarDays, '/events'],
    ['ministries', 'Ministries', Users, '/ministries'],
    ['profile', 'Profile', User, '/profile'],
  ]
  return <nav className="bottom-nav">{items.map(([id, label, Icon, to]) =>
    <Link key={id} className={active === id ? 'active' : ''} to={to}><Icon size={18} /><small>{label}</small></Link>
  )}</nav>
}

function MemberShell({ children, active = 'home', title, backTo }) {
  return <div className="member-page">
    <header className="mobile-header">
      {backTo ? <Back to={backTo} /> : <div style={{ width: '30px' }} />}
      {title ? <strong>{title}</strong> : <Logo />}
      <Link to="/announcements" className="bell-btn" title="Announcements">
        <Bell size={18} />
        <span className="bell-badge" />
      </Link>
    </header>
    <main className="mobile-main">{children}</main>
    <BottomNav active={active} />
  </div>
}

function Welcome() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Auto sign-in on recognized devices
  useEffect(() => {
    const existingToken = localStorage.getItem('gic_auth_token')
    if (existingToken) {
      navigate('/home', { replace: true })
    }
  }, [navigate])

  const handleGetStarted = async () => {
    setLoading(true)
    setError('')
    try {
      await performDeviceAuth('Member')
      navigate('/onboarding')
    } catch {
      setError('We could not connect to the member service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="welcome-page">
    <div className="welcome-overlay">
      <Logo light />

      <div className="welcome-copy">
        <p>Welcome to</p>
        <h1>Global Impact Church</h1>
        <p>A place where destinies are transformed and dreams take their rightful place.</p>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {error && <p className="auth-inline-error" role="alert">{error}</p>}
        <button
          className="btn gold wide"
          onClick={handleGetStarted}
          disabled={loading}
          style={{ fontSize: '14px', padding: '14px' }}
        >
          {loading ? 'Entering Portal...' : 'Get Started'}
        </button>
      </div>
    </div>
  </div>
}

function OnboardingFlow() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [permissionState, setPermissionState] = useState('default')
  const [installPrompt, setInstallPrompt] = useState(null)
  const [stage, setStage] = useState('notification')
  const [dismissedNotice, setDismissedNotice] = useState('')
  const [installMode, setInstallMode] = useState('unknown')

  useEffect(() => {
    const token = localStorage.getItem('gic_auth_token')
    if (!token) {
      navigate('/', { replace: true })
      return
    }

    if (localStorage.getItem('gic_onboarding_completed') === 'true' || isStandalonePwa()) {
      navigate('/home', { replace: true })
      return
    }

    const savedPermission = localStorage.getItem('gic_notification_permission')
    if (savedPermission) {
      setPermissionState(savedPermission)
    }

    if (savedPermission === 'granted') {
      setStage('pwa')
    }

    const handleInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
      setInstallMode('browser')
      setLocalState('gic_pwa_install_prompt_seen', 'true')
    }

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      setInstallMode('ios')
    }

    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
  }, [navigate])

  const finishOnboarding = () => {
    setLocalState('gic_onboarding_completed', 'true')
    navigate('/home', { replace: true })
  }

  const registerPush = async () => {
    setBusy(true)
    setDismissedNotice('')

    try {
      if (!('Notification' in window)) {
        setPermissionState('unsupported')
        setLocalState('gic_notification_permission', 'unsupported')
        setStage('pwa')
        return
      }

      if (!getSecureMode()) {
        setPermissionState('unsupported')
        setLocalState('gic_notification_permission', 'unsupported')
        setStage('pwa')
        return
      }

      await navigator.serviceWorker.register('/sw.js').catch(() => null)

      const currentPermission = Notification.permission
      if (currentPermission === 'granted') {
        setPermissionState('granted')
        setLocalState('gic_notification_permission', 'granted')
        setLocalState('gic_notifications_prompted', 'true')
        setStage('pwa')
        return
      }

      if (currentPermission === 'denied') {
        setPermissionState('denied')
        setLocalState('gic_notification_permission', 'denied')
        setStage('pwa')
        return
      }

      const permission = await Notification.requestPermission()
      setPermissionState(permission)
      setLocalState('gic_notification_permission', permission)
      setLocalState('gic_notifications_prompted', 'true')
      setStage('pwa')
    } catch (error) {
      console.error('Notification onboarding error:', error)
      setDismissedNotice('Notifications could not be enabled right now. You can continue and try again later.')
      setPermissionState('denied')
      setLocalState('gic_notification_permission', 'denied')
      setStage('pwa')
    } finally {
      setBusy(false)
    }
  }

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setLocalState('gic_pwa_installed', 'true')
      }
      finishOnboarding()
      return
    }

    if (installMode === 'ios') {
      setStage('ios-install')
      return
    }

    finishOnboarding()
  }

  const handleMaybeLater = () => {
    setLocalState('gic_pwa_install_prompt_seen', 'true')
    finishOnboarding()
  }

  if (stage === 'ios-install') {
    return <div className="onboarding-page"><div className="onboarding-card" style={{ minHeight: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><Logo /></div>
      <h1 style={{ textAlign: 'center', fontSize: '26px', marginBottom: '10px' }}>Add GIC to your Home Screen</h1>
      <p className="sub" style={{ textAlign: 'center', marginBottom: '24px' }}>Install Global Impact Church for quick access to your member account, events, registrations and updates.</p>
      <div className="stack" style={{ gap: '10px', textAlign: 'left', padding: '10px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '24px', height: '24px', borderRadius: '8px', background: '#f0edf7', display: 'grid', placeItems: 'center', color: '#5b2c8a', fontWeight: 700 }}>1</span><span>Tap the Share button.</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '24px', height: '24px', borderRadius: '8px', background: '#f0edf7', display: 'grid', placeItems: 'center', color: '#5b2c8a', fontWeight: 700 }}>2</span><span>Select “Add to Home Screen”.</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '24px', height: '24px', borderRadius: '8px', background: '#f0edf7', display: 'grid', placeItems: 'center', color: '#5b2c8a', fontWeight: 700 }}>3</span><span>Tap “Add”.</span></div>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '26px' }}>
        <button className="btn gold wide" onClick={finishOnboarding}>Continue</button>
      </div>
    </div></div>
  }

  return <div className="onboarding-page"><div className="onboarding-card">
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><Logo /></div>
    {stage === 'notification' ? <>
      <h1 style={{ fontSize: '30px', textAlign: 'center', margin: '6px 0 12px' }}>Stay connected with GIC</h1>
      <p className="sub" style={{ textAlign: 'center' }}>Get important church updates, event reminders, registration updates, announcements and other notifications directly on your device.</p>
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button className="btn primary wide" onClick={registerPush} disabled={busy}>{busy ? 'Preparing...' : 'Turn On Notifications'}</button>
        <button className="btn white wide" style={{ border: '1px solid #e8e2f1' }} onClick={finishOnboarding}>Not Now</button>
      </div>
      {dismissedNotice && <p className="sub" style={{ marginTop: '16px', textAlign: 'center', color: '#a61e1e' }}>{dismissedNotice}</p>}
      {permissionState === 'denied' && <p className="sub" style={{ marginTop: '16px', textAlign: 'center' }}>Notifications are currently disabled in your browser or device settings. You can enable them later and still continue to use GIC.</p>}
    </> : <>
      <h1 style={{ fontSize: '30px', textAlign: 'center', margin: '6px 0 12px' }}>Add GIC to your Home Screen</h1>
      <p className="sub" style={{ textAlign: 'center' }}>Install Global Impact Church for quick access to your member account, events, registrations and updates.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
        <button className="btn primary wide" onClick={handleInstall}>Add to Home Screen</button>
        <button className="btn white wide" style={{ border: '1px solid #e8e2f1' }} onClick={handleMaybeLater}>Maybe Later</button>
      </div>
      {permissionState === 'unsupported' && <p className="sub" style={{ marginTop: '16px', textAlign: 'center' }}>This browser does not support notification prompts, but you can still continue to GIC.</p>}
    </>}
  </div></div>
}

function HomePage() {
  const memberName = localStorage.getItem('gic_member_name') || 'Member'
  const [latestMixlrRecording, setLatestMixlrRecording] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/mixlr/latest`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Mixlr unavailable')))
      .then(setLatestMixlrRecording)
      .catch(() => setLatestMixlrRecording({
        title: 'Latest recording unavailable',
        displayTitle: 'Listen to the latest recording on Mixlr',
        url: 'https://globalimpactng.mixlr.com/recordings',
      }))
  }, [])

  return <MemberShell active="home">
    <section className="hero-card" style={{ padding: '18px', minHeight: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <small style={{ color: '#e0d6fc', fontSize: '11px', display: 'block' }}>Good Day,</small>
          <h2 style={{ margin: '2px 0 0', fontSize: '20px', fontWeight: 700 }}>{memberName} </h2>
        </div>
        <Logo light />
      </div>

      <div style={{
        background: 'rgba(10, 4, 34, 0.65)',
        borderRadius: '14px',
        padding: '12px',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        marginTop: '8px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block', boxShadow: '0 0 8px #3b82f6' }}/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#f7c637' }}>{latestMixlrRecording?.displayTitle || 'Loading latest recording...'}</span>
              <small style={{ color: '#e0d6fc', fontSize: '10px' }}>{latestMixlrRecording?.title || 'Fetching from Mixlr'}</small>
            </div>
          </div>
          <a 
            href={latestMixlrRecording?.url || 'https://globalimpactng.mixlr.com/recordings'} 
            target="_blank" 
            rel="noreferrer"
            style={{ fontSize: '10px', color: '#fff', opacity: 0.85, textDecoration: 'underline' }}
          >
            Mixlr↗
          </a>
        </div>

        <a href={latestMixlrRecording?.url || 'https://globalimpactng.mixlr.com/recordings'} target="_blank" rel="noreferrer" className="btn white wide">
          Listen to recording on Mixlr
        </a>
      </div>
    </section>
    <section className="section">
      <div className="section-head"><span>Latest Announcement</span></div>
      <article className="announcement-card">
        <div className="image-banner" style={{ backgroundImage: `url(${events[0].image})` }} />
        <div className="pad">
          <small>Sunday Service Update</small>
          <h3>{getSundayServiceCopy().summary}</h3>
          <Link to="/announcements">View Details</Link>
        </div>
      </article>
    </section>
    <section className="section">
      <div className="section-head"><span>Upcoming Events</span><Link to="/events">View All</Link></div>
      {events.slice(0, 2).map(e => <EventRow key={e.id} event={e} />)}
    </section>
  </MemberShell>
}

function EventRow({ event }) {
  return <Link className="event-row" to={`/events/${event.id}`}><img src={event.image} alt="" /><div><b>{event.title}</b><small className="event-meta"><CalendarDays size={13} />{event.date} · {event.time}</small><small className="event-location"><MapPin size={13} />{event.location}</small></div><ChevronRight className="event-chevron" size={19} /></Link>
}

function Announcements() {
  const [category, setCategory] = useState('All')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const categories = ['All', 'General', 'Ministries', 'Notices']
  const sundayServiceCopy = getSundayServiceCopy()
  useEffect(() => {
    fetchMemberApi('/api/notifications')
      .then(({ items: notifications = [] }) => setItems(notifications.map((notification) => ({
        id: notification.id,
        category: notification.type === 'MINISTRY_UPDATE' ? 'Ministries' : 'General',
        title: notification.title,
        summary: notification.body,
        date: notification.createdAt ? new Date(notification.createdAt).toLocaleDateString() : '',
        body: [notification.body],
        image: '',
      }))))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false))
  }, [])
  const visibleAnnouncements = category === 'All'
    ? items
    : items.filter((announcement) => announcement.category === category)

  return <MemberShell active="home" title="Announcements" backTo="/home">
    <div className="tabs">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
    {loading && <p className="center muted">Loading announcements...</p>}
    {error && <p className="center muted">Announcements are unavailable right now.</p>}
    {!loading && !error && <div className="announcement-list">{visibleAnnouncements.map((announcement) => <Link className="list-card" key={announcement.id} to={`/announcements/${announcement.id}`}><div><b>{announcement.title}</b><small>{announcement.summary}</small><time>{announcement.date}</time></div><ChevronRight size={18} /></Link>)}</div>}
    {!loading && !error && !visibleAnnouncements.length && <p className="center muted">No announcements yet.</p>}
  </MemberShell>
}

function AnnouncementDetails() {
  const { id } = useParams()
  const [announcement, setAnnouncement] = useState(null)
  useEffect(() => {
    fetchMemberApi('/api/notifications')
      .then(({ items = [] }) => {
        const notification = items.find((item) => item.id === id)
        if (notification) setAnnouncement({
          id: notification.id,
          category: notification.type === 'MINISTRY_UPDATE' ? 'Ministries' : 'General',
          title: notification.title,
          date: notification.createdAt ? new Date(notification.createdAt).toLocaleDateString() : '',
          body: [notification.body],
        })
      })
      .catch(() => {})
  }, [id])
  const sundayServiceCopy = getSundayServiceCopy()

  if (!announcement) return <MemberShell active="home" title="Announcement" backTo="/announcements"><p className="center muted">Loading announcement...</p></MemberShell>

  return <MemberShell active="home" title="Announcement" backTo="/announcements">
    <div className="detail-body">
      <span className="eyebrow">{announcement.category}</span>
      <h1>{announcement.title}</h1>
      <time className="date-line">{announcement.date}</time>
      {announcement.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      <Link className="btn primary wide" to="/announcements">Back to Announcements</Link>
    </div>
  </MemberShell>
}

function EventsPage() {
  return <MemberShell active="events" title="Events" backTo="/home">
    <div className="segmented"><button className="active">Upcoming</button><Link to="/my-registrations">My Events</Link></div>
    {events.map(e => <EventRow key={e.id} event={e} />)}
  </MemberShell>
}

function EventDetails() {
  const { id } = useParams(); const e = events.find(x => x.id === id) || events[0]
  const isRegistered = Boolean(localStorage.getItem(`gic_registration_${e.id}`))
  return <MemberShell active="events" backTo="/events" title=""><div className="detail-image" style={{ backgroundImage: `url(${e.image})` }} /><div className="detail-body"><h1>{e.title}</h1><div className="detail-meta"><span><CalendarDays size={15} />{e.date}</span><span><Clock3 size={15} />{e.time}</span><span><MapPin size={15} />{e.location}</span><span><Ticket size={15} />Free</span></div><p>An exciting time of worship, word, workshops and encounters. Don't miss it!</p><h3>What to Expect</h3><ul className="check-list"><li>Powerful Worship</li><li>Inspiring Sessions</li><li>Networking</li><li>And more</li></ul>{isRegistered ? <Link className="btn primary wide registered-event-button" to="/my-registrations"><Check size={17} /> Registered - View My Events</Link> : <Link className="btn primary wide" to={`/events/${e.id}/register`}>Register Now</Link>}</div></MemberShell>
}

function EventRegistration() {
  const navigate = useNavigate()
  const { id } = useParams()
  const event = events.find((item) => item.id === id) || events[0]
  const memberName = localStorage.getItem('gic_member_name') || 'Member'
  const email = localStorage.getItem('gic_member_email') || 'member@gic.org'
  const phone = localStorage.getItem('gic_member_phone') || '+234 801 234 5678'
  const handleSubmit = (submitEvent) => {
    submitEvent.preventDefault()
    localStorage.setItem(`gic_registration_${event.id}`, JSON.stringify({
      eventId: event.id,
      registeredAt: new Date().toISOString(),
      name: memberName,
      event: { id: event.id, title: event.title, date: event.date, time: event.time, location: event.location, image: event.image }
    }))
    navigate(`/events/${event.id}/success`)
  }

  return <MemberShell active="events" title="Register for Event" backTo="/events">
    <form onSubmit={handleSubmit} className="registration-form">
      <div className="registration-intro"><span className="registration-icon"><Ticket size={21} /></span><h1>{event.title}</h1><p>Reserve your place for a powerful day of worship, word and connection.</p></div>
      <div className="registration-summary"><span><CalendarDays size={16} /> {event.date} · {event.time}</span><span><MapPin size={16} /> {event.location}</span><span><Ticket size={16} /> Free entry</span></div>
      <div className="registration-fields">
        <Field label="Full Name" value={memberName} icon={User} />
        <Field label="Email Address" value={email} icon={Mail} />
        <Field label="Phone Number" value={phone} icon={Phone} />
      </div>
      <label className="check registration-terms"><input type="checkbox" defaultChecked required /> I agree to the event <u>terms and conditions</u></label>
      <button type="submit" className="btn primary wide registration-submit">Confirm Registration <ChevronRight size={17} /></button>
    </form>
  </MemberShell>
}

function RegistrationSuccess() {
  const { id } = useParams()
  const event = events.find((item) => item.id === id) || events[0]
  const [calendarAdded, setCalendarAdded] = useState(false)
  const handleAddToCalendar = () => {
    const calendarEvent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Global Impact Church//Events//EN',
      'BEGIN:VEVENT',
      `UID:${event.id}@gic.org`,
      'DTSTAMP:20260905T000000Z',
      'DTSTART:20261024T100000',
      'DTEND:20261024T130000',
      `SUMMARY:${event.title}`,
      `LOCATION:${event.location.replace(',', '\\,')}`,
      'DESCRIPTION:An exciting time of worship, word, workshops and encounters.',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\\r\\n')
    const blob = new Blob([calendarEvent], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${event.id}.ics`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setCalendarAdded(true)
  }

  return <div className="success-page"><div className="success-card"><div className="success-icon green"><Check size={34} /></div><h1>You're Registered!</h1><p>You have successfully registered for<br /><b>{event.title}</b></p><button className="btn white wide" onClick={handleAddToCalendar}><CalendarDays size={16} /> {calendarAdded ? 'Calendar Invite Downloaded' : 'Add to Calendar'}</button><Link className="btn outline wide" to="/events">Back to Events</Link></div></div>
}

function FormsPage() {
  const forms = [['Prayer Request Form', 'Submit your prayer requests. We are here to pray with you.', ''], ['Visitor Registration', 'Are you visiting for the first time? We’d love to connect with you.', ''], ['Volunteer Application', 'Join a team and serve in the house.', ''], ['Tithe & Offering Form', 'Submit your tithe or offering details here.', '']]
  return <MemberShell active="home" title="Forms" backTo="/home"><div className="segmented"><button className="active">All Forms</button><button>My Submissions</button></div>{forms.map((f, i) => <Link className="form-card" to={i === 0 ? '/forms/prayer-request' : '#'} key={f[0]}><span>{f[2]}</span><div><b>{f[0]}</b><small>{f[1]}</small></div><ChevronRight size={16} /></Link>)}</MemberShell>
}

function PrayerRequest() {
  const memberName = localStorage.getItem('gic_member_name') || 'Member'
  return <MemberShell active="home" title="Prayer Request Form" backTo="/forms">
    <p className="center muted">We believe in the power of prayer.<br />Please share your request with us.</p>
    <div className="stack">
      <Field label="Your Name" value={memberName} />
      <Field label="Phone Number" value="+234 801 234 5678" />
      <label className="field"><span>Your Prayer Request</span><textarea defaultValue="Please pray for my family and for divine direction." /></label>
      <SelectField label="Would you like someone to contact you?" value="Yes"><option>No</option></SelectField>
      <Button className="wide">Submit Prayer Request</Button>
    </div>
  </MemberShell>
}

function MinistriesPage() {
  const memberName = localStorage.getItem('gic_member_name') || 'Member'
  const selectedNames = (localStorage.getItem('gic_member_ministries') || '').split(',').map((ministry) => ministry.trim()).filter(Boolean)
  const selectedMinistries = selectedNames.map((name) => ministries.find((ministry) => ministry.title === name) || {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: name,
    desc: 'Your selected ministry.',
    image: ministries[2].image,
  })

  return <MemberShell active="ministries" title="My Ministries" backTo="/home">
    <p className="ministries-subtitle"></p>
    {selectedMinistries.length ? <div className="ministries-list">{selectedMinistries.map((ministry) => <Link className="ministry-row" key={ministry.id} to={`/ministries/${ministry.id}`}><img src={ministry.image} alt="" /><div><b>{ministry.title}</b><small>{ministry.desc}</small></div><ChevronRight size={18} /></Link>)}</div> : <div className="ministry-empty"><img className="empty-state-image" src="https://i.ibb.co/TBZR7vhL/360-F-488073924-Q1o-PSz-ULLWPDLFof-Tk-Jk8z-OVCa-La9gv8.jpg" alt="People serving together" /><h1>Hey {memberName}</h1><p>You haven't joined any ministry yet.</p><small>God has gifted you for a reason - come serve the Lord and make an impact with us!</small><Link className="btn primary wide" to="/profile/edit">Browse Ministries</Link><div className="ministry-help"><b>Not sure where to start?</b><span>Need to talk to someone about finding the right ministry? Contact details will be available here soon.</span></div></div>}
  </MemberShell>
}

function MinistryDetails() {
  const { id } = useParams()
  const ministry = ministries.find((item) => item.id === id) || ministries[0]
  const [tab, setTab] = useState('about')

  return <MemberShell active="ministries" title={ministry.title} backTo="/ministries"><div className="ministry-cover" style={{ backgroundImage: `url(${ministry.image})` }}><h1>{ministry.title.toUpperCase()}</h1></div><div className="detail-body ministry-detail-body"><h2>{ministry.title}</h2><p>{ministry.desc}</p><div className="mini-tabs"><button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>About</button><button className={tab === 'updates' ? 'active' : ''} onClick={() => setTab('updates')}>Updates</button></div>{tab === 'about' ? <><section className="ministry-about"><b>About this ministry</b><p>{ministry.title} is a community of people growing in faith, serving with purpose, and making a meaningful impact together. Find your place, build relationships, and use your gifts to serve.</p></section><div className="contact contact-empty"><div className="action-icon"><Users size={16} /></div><div><small>Contact Leader</small><span>Contact details will be added soon.</span></div></div></> : <><div className="upcoming-box"><b>Upcoming Meeting</b><span><CalendarDays size={14} /> Friday, 24 May 2024 · 6:00 PM</span><span><MapPin size={14} /> Youth Hall</span></div><div className="ministry-updates-empty"><Bell size={22} /><b>No updates yet</b><span>New updates from this ministry will appear here.</span></div></>}</div></MemberShell>
}

function Profile() {
  const navigate = useNavigate()
  const memberName = localStorage.getItem('gic_member_name') || 'David'
  const avatar = localStorage.getItem('gic_member_avatar')
  const profileDetails = [
    ['Phone Number', localStorage.getItem('gic_member_phone') || 'Add info', Phone],
    ['Email Address', localStorage.getItem('gic_member_email') || 'Add info', Mail],
    ['Ministries', localStorage.getItem('gic_member_ministries') || 'Youth Ministry, Media Ministry, Choir', Users],
    ['Center', localStorage.getItem('gic_member_center') || 'Add info', MapPin],
    ['Service Time', localStorage.getItem('gic_member_service_time') || 'Add info', Clock3],
    ['Birthday', localStorage.getItem('gic_member_birthday') || 'Add info', CalendarDays],
    ['Membership Status', localStorage.getItem('gic_membership_status') || 'Add info', ShieldCheck],
  ]
  const deviceId = getOrCreateDeviceId()

  const handleReauth = async () => {
    await performDeviceAuth(memberName)
    alert(`Device re-authenticated successfully! Device ID: ${deviceId}`)
  }

  const handleResetSession = () => {
    localStorage.removeItem('gic_auth_token')
    localStorage.removeItem('gic_member_name')
    navigate('/')
  }

  return <MemberShell active="profile" title="My Profile" backTo="/home">
    <div className="profile-head">
      <Link to="/profile/edit" className="profile-avatar avatar-picker" aria-label="Edit profile photo">
        <div className="avatar large">{avatar ? <img src={avatar} alt="Profile" /> : memberName.slice(0, 2).toUpperCase()}</div>
        <span><Camera size={13} /></span>
      </Link>
      <h1>{memberName}</h1>
      <div className="device-status"><Check size={12} /> Recognized Device Session</div>
    </div>

    <section className="profile-details">
      <div className="profile-details-head"><div><b>Profile Information</b><small>Your details at a glance</small></div><Link to="/profile/edit">Edit</Link></div>
      <div className="profile-detail-grid">
        {profileDetails.map(([label, value, Icon]) => <div key={label}><Icon size={15} /><span><small>{label}</small><b className={value === 'Add info' ? 'placeholder' : ''}>{value}</b></span></div>)}
      </div>
    </section>

    <div className="profile-menu">
      <button
        onClick={handleReauth}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', border: 0, background: '#fff', borderBottom: '1px solid #f0eef4', padding: '14px 12px', textAlign: 'left', cursor: 'pointer' }}
      >
        <span className="action-icon"><Lock size={16} /></span>
        <span style={{ flex: 1, fontSize: '10px', fontWeight: 600 }}>Re-authenticate Device</span>
        <ChevronRight size={15} />
      </button>

      <button
        onClick={handleResetSession}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', border: 0, background: '#fff', padding: '14px 12px', textAlign: 'left', color: '#ef4444', cursor: 'pointer' }}
      >
        <span className="action-icon danger"><Trash2 size={16} /></span>
        <span style={{ flex: 1, fontSize: '10px', fontWeight: 600 }}>Reset Device Session</span>
        <ChevronRight size={15} />
      </button>
    </div>
  </MemberShell>
}

function EditProfile() {
  const navigate = useNavigate()
  const [name, setName] = useState(localStorage.getItem('gic_member_name') || 'Member')
  const [phone, setPhone] = useState(localStorage.getItem('gic_member_phone') || '')
  const [email, setEmail] = useState(localStorage.getItem('gic_member_email') || '')
  const [ministriesValue, setMinistriesValue] = useState(() => {
    const savedMinistries = localStorage.getItem('gic_member_ministries') || ''
    return savedMinistries ? savedMinistries.split(',').map((ministry) => ministry.trim()).filter(Boolean) : []
  })
  const [center, setCenter] = useState(localStorage.getItem('gic_member_center') || '')
  const [serviceTime, setServiceTime] = useState(localStorage.getItem('gic_member_service_time') || '')
  const [birthday, setBirthday] = useState(localStorage.getItem('gic_member_birthday') || '')
  const [membershipStatus, setMembershipStatus] = useState(localStorage.getItem('gic_membership_status') || '')
  const [avatar, setAvatar] = useState(localStorage.getItem('gic_member_avatar') || '')
  const selectedCenter = serviceCenters.find((serviceCenter) => serviceCenter.name === center)
  const availableServiceTimes = selectedCenter?.times || []

  const handleSave = async (e) => {
    e.preventDefault()
    await performDeviceAuth(name.trim())
    const profileFields = { phone, email, ministries: ministriesValue.join(', '), center, serviceTime, birthday, membershipStatus }
    Object.entries(profileFields).forEach(([key, value]) => localStorage.setItem(`gic_member_${key === 'ministries' ? 'ministries' : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`, value.trim()))
    if (avatar) localStorage.setItem('gic_member_avatar', avatar)
    navigate('/profile')
  }

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setAvatar(reader.result)
    reader.readAsDataURL(file)
  }

  return <MemberShell active="profile" title="Edit Profile" backTo="/profile">
    <div className="profile-head">
      <label className="avatar large avatar-picker">
        {avatar ? <img src={avatar} alt="Profile preview" /> : name.slice(0, 2).toUpperCase()}
        <span><Camera size={13} /></span>
        <input type="file" accept="image/*" onChange={handleAvatarChange} />
      </label>
    </div>
    <form onSubmit={handleSave} className="stack">
      <label className="field">
        <span>FULL NAME</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <Field label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 801 234 5678" icon={Phone} />
      <Field label="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@gic.org" icon={Mail} />
      <MultiSelectField label="Ministries (Optional)" values={ministriesValue} options={ministryOptions} onChange={setMinistriesValue} />
      <SelectField label="Center You Attend" value={center} onChange={(e) => { setCenter(e.target.value); setServiceTime('') }}>
        {serviceCenters.map((serviceCenter) => <option key={serviceCenter.name} value={serviceCenter.name}>{serviceCenter.name}</option>)}
      </SelectField>
      <SelectField label="Service Time" value={serviceTime} onChange={(e) => setServiceTime(e.target.value)} disabled={!center}>
        {availableServiceTimes.map((time) => <option key={time} value={time}>{time}</option>)}
      </SelectField>
      <Field label="Birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} icon={CalendarDays} />
      <Field label="Membership Status" value={membershipStatus} onChange={(e) => setMembershipStatus(e.target.value)} placeholder="Member" icon={ShieldCheck} />
      <Button type="submit" className="wide">Save Changes & Sync Device</Button>
    </form>
  </MemberShell>
}

function MyRegistrations() {
  const [now, setNow] = useState(Date.now())
  const registrations = events.filter((event) => {
    try {
      return Boolean(localStorage.getItem(`gic_registration_${event.id}`))
    } catch {
      return false
    }
  })
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return <MemberShell active="events" title="My Events" backTo="/events">
    {registrations.length ? registrations.map((event) => {
      const remaining = Math.max(0, new Date(`${event.date.replace(/^\w+, /, '')} ${event.time}`).getTime() - now)
      const days = Math.floor(remaining / 86400000)
      const hours = Math.floor((remaining % 86400000) / 3600000)
      const minutes = Math.floor((remaining % 3600000) / 60000)
      const seconds = Math.floor((remaining % 60000) / 1000)
      return <article className="registered-event-card" key={event.id}>
        <div className="registered-event-cover" style={{ backgroundImage: `url(${event.image})` }}><span className="status">Registered</span></div>
        <div className="registered-event-body"><div className="registered-event-heading"><div><b>{event.title}</b><small>{event.date} · {event.time}</small></div><Ticket size={20} /></div><small className="registered-location"><MapPin size={14} /> {event.location}</small><div className="countdown"><small>Event starts in</small><div><span><b>{String(days).padStart(2, '0')}</b><em>Days</em></span><span><b>{String(hours).padStart(2, '0')}</b><em>Hrs</em></span><span><b>{String(minutes).padStart(2, '0')}</b><em>Min</em></span><span><b>{String(seconds).padStart(2, '0')}</b><em>Sec</em></span></div></div></div>
      </article>
    }) : <div className="empty"><CalendarDays size={28} /><h2>No registrations yet</h2><p>Events you register for will appear here.</p><Link className="btn primary wide" to="/events">Browse Events</Link></div>}
  </MemberShell>
}

function SignIn() {
  const navigate = useNavigate()
  const handleDemoSignIn = async () => {
    await performDeviceAuth('Member')
    navigate('/onboarding')
  }

  return <div className="onboarding-page">
    <div className="onboarding-card">
      <Logo />
      <h1 style={{ textAlign: 'center', fontSize: '20px', marginTop: '16px' }}>Welcome back</h1>
      <p className="sub">Sign in to your account.</p>
      <div className="stack">
        <Field label="Email Address" value="john.doe@gmail.com" icon={Mail} />
        <Field label="Password" value="••••••••••" type="password" icon={Lock} />
        <button className="btn primary wide" onClick={handleDemoSignIn}>Sign In</button>
        <Link className="center link-button" to="/">Back to Welcome Screen</Link>
      </div>
    </div>
  </div>
}

export default function App() {
  return <Routes>
    <Route path="/" element={<Welcome />} />
    <Route path="/signin" element={<SignIn />} />
    <Route path="/onboarding" element={<OnboardingFlow />} />
    <Route path="/home" element={<HomePage />} />
    <Route path="/announcements" element={<Announcements />} />
    <Route path="/announcements/:id" element={<AnnouncementDetails />} />
    <Route path="/events" element={<EventsPage />} />
    <Route path="/events/:id" element={<EventDetails />} />
    <Route path="/events/:id/register" element={<EventRegistration />} />
    <Route path="/events/:id/success" element={<RegistrationSuccess />} />
    <Route path="/my-registrations" element={<MyRegistrations />} />
    <Route path="/forms" element={<FormsPage />} />
    <Route path="/forms/prayer-request" element={<PrayerRequest />} />
    <Route path="/ministries" element={<MinistriesPage />} />
    <Route path="/ministries/:id" element={<MinistryDetails />} />
    <Route path="/profile" element={<Profile />} />
    <Route path="/profile/edit" element={<EditProfile />} />
    <Route path="*" element={<Navigate to="/" />} />
  </Routes>
}
