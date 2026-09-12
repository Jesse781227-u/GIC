import React, { useState, useEffect, useMemo, useRef, useContext, useCallback, createContext } from 'react'
import { createPortal } from 'react-dom'
import './bugfix.css'
import { createPhoneAuth, createPhoneRecaptcha, getFcmToken, signInWithPhoneNumber } from './firebase'
import {
  ArrowLeft, ArrowRight, Bell, CalendarDays, Camera, Check, ChevronRight,
  Clock3, ChevronDown, Home, Lock, Mail, MapPin, Pencil, Phone, Plus, RefreshCw,
  Search, Settings, ShieldCheck, Smartphone, Ticket, User, Users, Trash2, Volume2, VolumeX,
  Play, Pause, CheckCircle2
} from 'lucide-react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { formatServiceOccurrenceLabel, getNextServiceOccurrence, TIME_ZONE } from './serviceOccurrence'

const MIXLR_CACHE_TTL = 60 * 60 * 1000
const MIXLR_CACHE_KEY = 'gic_mixlr_cache'
const SERVICE_CACHE_KEY = 'gic_service_cache'

const notificationCountContext = createContext(null)
const audioPlayerContext = createContext(null)

const events = [
  { id: 'sunday-service', title: 'Sunday Service', date: 'Sun, 4 Oct 2026', time: 'Multiple services', location: 'Global Impact Church', image: 'https://i.ibb.co/zTcjGhTp/Screenshot-2026-09-08-134018.png', tag: 'Service', isService: true },
  { id: 'midweek-service', title: 'Midweek Service', date: 'Wed, 7 Oct 2026', time: '6:00 PM WAT', location: 'Global Impact Church', image: 'https://i.ibb.co/VYtgTk3b/Screenshot-2026-09-08-131313.png', tag: 'Service', isService: true },
]

const ministries = [
  { id: 'ushering', title: 'Ushering Ministry', desc: 'Serving with excellence and a heart.', requirements: 'A welcoming heart, punctuality, a neat appearance, and willingness to serve during church gatherings.', image: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=700&q=80' },
  { id: 'media', title: 'Media Ministry', desc: "Telling the story of God's work.", requirements: 'Interest or experience in photography, video, graphics, livestreaming, audio, or communications.', image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=700&q=80' },
  { id: 'choir', title: 'Choir', desc: 'Leading the church in worship through music.', requirements: 'A love for worship, regular attendance, willingness to rehearse, and a teachable spirit.', image: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=700&q=80' },
  { id: 'children', title: "Children's Ministry", desc: 'Helping children discover faith and grow with joy.', requirements: 'Patience, care for children, reliability, and willingness to complete the church safeguarding process.', image: 'https://images.unsplash.com/photo-1504159506876-f8338247a14a?auto=format&fit=crop&w=700&q=80' },
  { id: 'prayer', title: 'Prayer Ministry', desc: 'Standing together in prayer for the church and community.', requirements: 'A committed prayer life, confidentiality, consistency, and willingness to join prayer gatherings.', image: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=700&q=80' },
  { id: 'acts-of-mercy', title: 'Acts Of Mercy', desc: 'Serving people in need through practical charity and compassion.', requirements: 'A compassionate heart, reliability, willingness to serve communities in need, and respect for every person.', image: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?auto=format&fit=crop&w=700&q=80' },
  { id: 'evangelism', title: 'Evangelism', desc: 'Sharing the gospel and helping people encounter the love of Christ.', requirements: 'A growing relationship with Christ, courage to connect with people, and willingness to participate in outreach.', image: 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?auto=format&fit=crop&w=700&q=80' },
]

const ministryOptions = [
  'Ushering Ministry', 'Media Ministry', 'Choir', "Children's Ministry", 'Prayer Ministry',
  'Acts Of Mercy', 'Evangelism'
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

function parseServiceTimeString(value = '') {
  const cleaned = (value || '').replace(/^Sunday Services?:\s*/i, '').replace(/\s+/g, ' ').trim()
  const match = cleaned.match(/(\d{1,2})(?::?(\d{2}))?\s*(AM|PM)/i)
  if (!match) return { hours: 8, minutes: 45 }
  let hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  const meridian = match[3].toUpperCase()
  if (meridian === 'PM' && hours < 12) hours += 12
  if (meridian === 'AM' && hours === 12) hours = 0
  return { hours, minutes }
}

function getSelectedService() {
  return {
    center: localStorage.getItem('gic_member_center') || 'your selected center',
    time: localStorage.getItem('gic_member_service_time') || 'Sunday Services: 08:45AM',
  }
}

function getSundayServiceCopy() {
  const { center, time } = getSelectedService()
  return {
    summary: `Join us this Sunday at ${center}. Your preferred service time is ${time}.`,
    body: [
      `Join us this Sunday at ${center} for worship, the Word, and fellowship at Global Impact Church. Your selected service time is ${time}.`,
      'Come expectant and invite someone to experience the presence of God with us.',
    ],
  }
}

function getServiceOccurrence(serviceType, now = new Date()) {
  return getNextServiceOccurrence(serviceType, now, getSelectedService().time)
}

function getLagosDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const values = {}
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value
  })
  return {
    year: Number(values.year || 0),
    month: Number(values.month || 1),
    day: Number(values.day || 1),
    hour: Number(values.hour || 0),
    minute: Number(values.minute || 0),
    second: Number(values.second || 0),
  }
}

function getNextServiceDate(event, now = new Date()) {
  if (!event.isService) return new Date(event.date.replace(/^\w+, /, '')).getTime()
  const next = getServiceOccurrence(event.id, now)
  return next.getTime()
}

function getNextEvent() {
  return getUpcomingEvents()[0]
}

function formatServiceLabel(serviceDate, eventId) {
  return formatServiceOccurrenceLabel(serviceDate)
}

function getServiceDisplay(event) {
  const { center } = getSelectedService()
  const serviceDate = getServiceOccurrence(event.id)
  const label = formatServiceLabel(serviceDate, event.id)
  const sundayTime = getSelectedService().time.replace(/^Sunday Services?:\s*/i, '')
  return event.id === 'sunday-service'
    ? { ...event, date: label, time: sundayTime, location: center, startAt: serviceDate }
    : { ...event, date: label, time: '6:00 PM WAT', location: center, startAt: serviceDate }
}

function getUpcomingEvents() {
  const nextSundayService = getServiceOccurrence('sunday-service')
  const nextMidweekService = getServiceOccurrence('midweek-service')
  return [
    {
      id: 'sunday-service',
      title: 'Sunday Service',
      date: nextSundayService.toDateString(),
      time: getSelectedService().time.replace(/^Sunday Services?:\s*/i, ''),
      location: getSelectedService().center,
      image: 'https://i.ibb.co/zTcjGhTp/Screenshot-2026-09-08-134018.png',
      tag: 'Service',
      isService: true,
      startAt: nextSundayService.toISOString(),
    },
    {
      id: 'midweek-service',
      title: 'Midweek Service',
      date: nextMidweekService.toDateString(),
      time: '6:00 PM WAT',
      location: getSelectedService().center,
      image: 'https://i.ibb.co/VYtgTk3b/Screenshot-2026-09-08-131313.png',
      tag: 'Service',
      isService: true,
      startAt: nextMidweekService.toISOString(),
    },
  ].sort((first, second) => new Date(first.startAt).getTime() - new Date(second.startAt).getTime())
}

function getMixlrCache() {
  try {
    const raw = localStorage.getItem(MIXLR_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

let mixlrRequestPromise = null

async function getMixlrData(forceRefresh = false) {
  const cached = getMixlrCache()
  const cacheFresh = Boolean(cached && cached.fetchedAt && Date.now() - cached.fetchedAt < MIXLR_CACHE_TTL)
  if (!forceRefresh && cacheFresh) return cached.data
  if (!forceRefresh && mixlrRequestPromise) return mixlrRequestPromise

  mixlrRequestPromise = fetch(`${API_BASE}/api/mixlr/latest`)
    .then(async (response) => {
      if (!response.ok) {
        if (cached?.data) return cached.data
        throw new Error('Mixlr unavailable')
      }
      const payload = await response.json()
      const nextCache = {
        data: payload,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + MIXLR_CACHE_TTL,
      }
      localStorage.setItem(MIXLR_CACHE_KEY, JSON.stringify(nextCache))
      return payload
    })
    .catch((error) => {
      if (cached?.data) return cached.data
      throw error
    })
    .finally(() => {
      mixlrRequestPromise = null
    })

  return mixlrRequestPromise
}

function formatRecordingDate(value) {
  const match = String(value || '').match(/(\d{1,2})(?:st|nd|rd|th)?[\s,]+([A-Za-z]+)[\s,]+(\d{4})/i)
  if (!match) return '10th September 2026'
  const day = Number(match[1])
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th')
  return `${day}${suffix} ${match[2]} ${match[3]}`
}

function readPersistedServiceCache() {
  try {
    const raw = localStorage.getItem(SERVICE_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function useNotificationCount() {
  const context = useContext(notificationCountContext)
  if (!context) {
    return { unreadCount: 0, refreshUnreadCount: async () => 0, updateUnreadCount: () => {} }
  }
  return context
}

function useAudioPlayer() {
  const context = useContext(audioPlayerContext)
  if (!context) {
    return {
      playing: false,
      loading: false,
      minimized: false,
      setMinimized: () => {},
      error: '',
      volume: 0.85,
      streamUrl: '',
      title: 'Global Impact Church',
      togglePlayback: () => {},
      setStream: () => {},
      pause: () => {},
      resume: () => {},
      close: () => {},
      setVolume: () => {},
      elapsedSeconds: 0,
      durationSeconds: null,
      seekable: false,
      seek: () => {},
    }
  }
  return context
}

function NotificationProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationPulse, setNotificationPulse] = useState(false)
  const previousUnreadCount = useRef(0)

  const refreshUnreadCount = useCallback(async () => {
    try {
      const { count = 0 } = await fetchMemberApi('/api/notifications/unread-count')
      const nextValue = Number(count || 0)
      if (previousUnreadCount.current === 0 && nextValue > 0) {
        setNotificationPulse(true)
        window.setTimeout(() => setNotificationPulse(false), 850)
      }
      previousUnreadCount.current = nextValue
      setUnreadCount(nextValue)
      localStorage.setItem('gic_notification_unread_count', String(nextValue))
      return nextValue
    } catch {
      return unreadCount
    }
  }, [unreadCount])

  useEffect(() => {
    refreshUnreadCount()
    const interval = window.setInterval(() => {
      refreshUnreadCount()
    }, 60000)
    return () => window.clearInterval(interval)
  }, [refreshUnreadCount])

  const value = useMemo(() => ({
    unreadCount,
    notificationPulse,
    setUnreadCount,
    refreshUnreadCount,
  }), [unreadCount, notificationPulse, refreshUnreadCount])

  return <notificationCountContext.Provider value={value}>{children}</notificationCountContext.Provider>
}

function AudioPlayerProvider({ children }) {
  const audioRef = useRef(null)
  const [streamUrl, setStreamUrl] = useState('https://globalimpactng.mixlr.com')
  const [title, setTitle] = useState('Global Impact Church')
  const [recordingDate, setRecordingDate] = useState('10th September 2026')
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [minimized, setMinimized] = useState(false)
  const [volume, setVolume] = useState(0.85)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(null)
  const [seekable, setSeekable] = useState(false)

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) return null
    audioRef.current.volume = volume
    return audioRef.current
  }, [volume])

  const setStream = useCallback((nextUrl, nextTitle, options = {}) => {
    const safeUrl = nextUrl || streamUrl
    setStreamUrl(safeUrl)
    setTitle(nextTitle || title)
    setRecordingDate(options.recordingDate || recordingDate)
    setLoading(Boolean(options.loading) || Boolean(nextUrl))
    setError('')
    setMinimized(Boolean(options.minimized))
    const audio = ensureAudio()
    if (audio && safeUrl && audio.src !== safeUrl) {
      audio.src = safeUrl
    }
  }, [ensureAudio, recordingDate, streamUrl, title])

  const pause = useCallback(() => {
    const audio = ensureAudio()
    if (!audio) return
    audio.pause()
    setPlaying(false)
  }, [ensureAudio])

  const resume = useCallback(async () => {
    const audio = ensureAudio()
    if (!audio || !streamUrl) return
    try {
      setLoading(true)
      setError('')
      await audio.play()
    } catch {
      setError('Playback requires a tap to begin. Please tap Play to continue.')
      setPlaying(false)
    } finally {
      setLoading(false)
    }
  }, [ensureAudio, streamUrl])

  const close = useCallback(() => {
    setMinimized(true)
  }, [])

  const stop = useCallback(() => {
    pause()
    setMinimized(true)
  }, [pause])

  const seek = useCallback((nextTime) => {
    const audio = ensureAudio()
    if (!audio || !seekable) return
    const next = Number(nextTime)
    if (!Number.isFinite(next)) return
    const range = audio.seekable
    const minimum = range.length ? range.start(0) : 0
    const maximum = range.length ? range.end(range.length - 1) : (Number.isFinite(audio.duration) ? audio.duration : next)
    audio.currentTime = Math.min(Math.max(next, minimum), maximum)
    setElapsedSeconds(audio.currentTime)
  }, [ensureAudio, seekable])

  const togglePlayback = useCallback(async () => {
    if (!streamUrl) return
    if (playing) {
      pause()
      return
    }
    await resume()
  }, [pause, playing, resume, streamUrl])

  useEffect(() => {
    const audio = ensureAudio()
    if (!audio) return
    audio.volume = volume
    audio.preload = 'auto'
    audio.setAttribute('playsinline', 'true')
    audio.muted = false
    const handleLoadedData = () => {
      setLoading(false)
      setError('')
      setPlaying(!audio.paused)
      setDurationSeconds(Number.isFinite(audio.duration) ? audio.duration : null)
      setSeekable(Number.isFinite(audio.duration) || audio.seekable.length > 0)
    }
    const handleDurationChange = () => {
      setDurationSeconds(Number.isFinite(audio.duration) ? audio.duration : null)
      setSeekable(Number.isFinite(audio.duration) || audio.seekable.length > 0)
    }
    const handleProgress = () => setSeekable(Number.isFinite(audio.duration) || audio.seekable.length > 0)
    const handleTimeUpdate = () => setElapsedSeconds(Number.isFinite(audio.currentTime) ? audio.currentTime : 0)
    const handlePlay = () => {
      setPlaying(true)
      setLoading(false)
      setError('')
    }
    const handlePause = () => {
      setPlaying(false)
    }
    const handleError = () => {
      setError('Mixlr is unavailable right now. Please try again in a moment.')
      setPlaying(false)
      setLoading(false)
    }
    audio.addEventListener('loadeddata', handleLoadedData)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('progress', handleProgress)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('error', handleError)
    return () => {
      audio.removeEventListener('loadeddata', handleLoadedData)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('progress', handleProgress)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('error', handleError)
    }
  }, [ensureAudio, streamUrl, volume])

  useEffect(() => {
    if (!playing) return undefined
    const interval = window.setInterval(() => {
      const audio = audioRef.current
      if (audio && Number.isFinite(audio.currentTime)) setElapsedSeconds(audio.currentTime)
      else setElapsedSeconds((value) => value + 1)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [playing])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Global Impact Church', album: 'Mixlr Live Audio' })
    navigator.mediaSession.setActionHandler('play', resume)
    navigator.mediaSession.setActionHandler('pause', pause)
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
      } catch {}
    }
  }, [pause, resume, title])

  const value = useMemo(() => ({
    playing,
    loading,
    minimized,
    setMinimized,
    error,
    volume,
    streamUrl,
    title,
    recordingDate,
    togglePlayback,
    setStream,
    pause,
    resume,
    close,
    stop,
    setVolume,
    elapsedSeconds,
    durationSeconds,
    seekable,
    seek,
  }), [close, durationSeconds, elapsedSeconds, error, loading, minimized, pause, playing, recordingDate, resume, seek, seekable, setMinimized, setStream, stop, streamUrl, title, togglePlayback, volume])

  return <audioPlayerContext.Provider value={value}>
    {children}
    <audio ref={audioRef} src={streamUrl} preload="auto" playsInline aria-label="Global Impact Church Mixlr audio" />
  </audioPlayerContext.Provider>
}

function PersistentAudioPlayer({ embedded = false }) {
  const location = useLocation()
  if (location.pathname === '/home' && !embedded) return null
  const { playing, loading, minimized, error, title, recordingDate, pause, resume, setVolume, volume, elapsedSeconds, durationSeconds, seekable, seek } = useAudioPlayer()
  const formatTime = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
    return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`
  }
  if (!title) return null
  return <aside className={`persistent-audio-player ${embedded ? 'is-embedded' : ''} ${minimized ? 'is-minimized' : ''}`} aria-label="Mixlr audio player">
    <div className="persistent-audio-main"><div className="persistent-audio-meta"><span className="live-pill">{playing ? 'LIVE' : loading ? 'LOADING' : 'MIXLR'}</span><div><strong>{title}</strong><small>{error || (playing ? recordingDate : 'Ready to play')}</small></div></div><div className="persistent-audio-actions"><button type="button" className="player-icon-button" onClick={playing ? pause : resume} aria-label={playing ? 'Pause Mixlr' : 'Play Mixlr'}>{playing ? <Pause size={17} /> : <Play size={17} />}</button></div></div>
    {!minimized && <div className="persistent-audio-toolbar"><div className="audio-seek-row"><span>{formatTime(elapsedSeconds)}</span><input type="range" min="0" max={durationSeconds || Math.max(elapsedSeconds, 1)} step="1" value={Math.min(elapsedSeconds, durationSeconds || Math.max(elapsedSeconds, 1))} onChange={(event) => seek(event.target.value)} disabled={!seekable} aria-label={seekable ? 'Seek audio' : 'Seeking unavailable for this live stream'} /><span>{durationSeconds ? formatTime(durationSeconds) : 'LIVE'}</span></div><small className="audio-seek-note">{seekable ? 'Seek within the available playback window' : 'Live stream · seeking unavailable'}</small><label className="volume-control" title="Volume"><Volume2 size={15} /><span>Volume</span><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" /></label></div>}
  </aside>
}

function PersistentAudioPlayerLegacy() {
  const { playing, loading, minimized, setMinimized, error, streamUrl, title, pause, resume, stop, close, setVolume, volume } = useAudioPlayer()
  const shouldRender = Boolean(streamUrl) && (!minimized || playing || loading)
  if (!shouldRender) return null

  return <div className="persistent-audio-player" style={{ opacity: minimized ? 0.96 : 1 }}>
    <div className="persistent-audio-main">
      <div className="persistent-audio-meta">
        <span className="live-pill">{playing ? 'LIVE' : loading ? 'LOADING' : 'MIXLR'}</span>
        <div>
          <strong>{title}</strong>
          <small>{error || (playing ? 'Playing now' : 'Tap play to listen')}</small>
        </div>
      </div>
      <div className="persistent-audio-actions">
        <button type="button" className="player-toggle" onClick={playing ? pause : resume}>{playing ? 'Pause' : 'Play'}</button>
      </div>
    </div>
    <div className="persistent-audio-toolbar">
      <label className="volume-control">
        {volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
      </label>
      <button type="button" className="player-link" onClick={stop} aria-hidden="true" hidden>Stop</button>
    </div>
    {error && <div className="player-status">{error}</div>}
  </div>
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

function playNotificationsEnabledSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, now)
    oscillator.frequency.setValueAtTime(1175, now + 0.09)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.24)
    oscillator.addEventListener('ended', () => context.close())
  } catch {
    // Audio is optional and may be unavailable in some browsers.
  }
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
  const cookieId = document.cookie.match(/(?:^|; )gic_device_id=([^;]+)/)?.[1]
  let id = cookieId || localStorage.getItem('gic_device_id')
  if (!id) {
    id = 'dev-' + Math.random().toString(36).substring(2, 8) + '-' + Date.now().toString(36).slice(-4)
  }
  localStorage.setItem('gic_device_id', id)
  document.cookie = `gic_device_id=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax`
  return id
}

function getAccountId() {
  return document.cookie.match(/(?:^|; )gic_account_id=([^;]+)/)?.[1] || localStorage.getItem('gic_account_id') || ''
}

function storeAccountId(accountId) {
  if (!accountId) return
  localStorage.setItem('gic_account_id', accountId)
  document.cookie = `gic_account_id=${encodeURIComponent(accountId)}; Max-Age=31536000; Path=/; SameSite=Lax`
}

function storeMemberSession(data) {
  storeAccountId(data.member.id)
  localStorage.setItem('gic_auth_token', data.token)
  localStorage.setItem('gic_member_name', data.member.name)
  localStorage.setItem('gic_member_phone', data.member.phone || '')
  localStorage.setItem('gic_member_email', data.member.email || '')
  localStorage.setItem('gic_member_ministries', data.member.ministries || '')
  localStorage.setItem('gic_member_center', data.member.center || '')
  localStorage.setItem('gic_member_service_time', data.member.serviceTime || '')
  localStorage.setItem('gic_member_birthday', data.member.birthday || '')
  localStorage.setItem('gic_membership_status', data.member.membershipStatus || '')
  localStorage.setItem('gic_member_joined_month', data.member.joinedMonth || '')
  localStorage.setItem('gic_member_joined_year', data.member.joinedYear || '')
  if (data.member.avatar) localStorage.setItem('gic_member_avatar', data.member.avatar)
  localStorage.setItem('gic_auth_method', 'device_auth')
}

function clearStaleMemberSession() {
  for (const key of ['gic_auth_token', 'gic_account_id', 'gic_auth_method', 'gic_profile_completed', 'gic_onboarding_profile', 'gic_onboarding_completed']) {
    localStorage.removeItem(key)
  }
  document.cookie = 'gic_account_id=; Max-Age=0; Path=/; SameSite=Lax'
}

export async function performDeviceAuth(memberName) {
  const deviceId = getOrCreateDeviceId()
  const payload = {
    deviceId,
    ...(getAccountId() ? { accountId: getAccountId() } : {}),
    deviceName: window.navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
    platform: 'web',
    ...(memberName?.trim() && memberName.trim() !== 'Member' ? { name: memberName.trim() } : {})
  }
  try {
    const res = await fetch(`${API_BASE}/api/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Device authentication failed')
    storeAccountId(data.member.id)
    storeMemberSession(data)
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

function Field({ label, value, type = 'text', placeholder, onChange, icon: Icon, required = false }) {
  return <label className="field">
    <span>{label}</span>
    <div className="field-wrap">
      {Icon && <Icon size={15} />}
      <input type={type} value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} placeholder={placeholder} onChange={onChange} required={required} />
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

function MemberShell({ children, active = 'home', title, backTo, lockProfile = false }) {
  const { unreadCount, notificationPulse } = useNotificationCount()
  return <div className="member-page">
    <header className="mobile-header">
      {backTo && !lockProfile ? <Back to={backTo} /> : <div style={{ width: '30px' }} />}
      {title ? <strong>{title}</strong> : <Logo />}
      {lockProfile ? <div style={{ width: '30px' }} /> : <Link to="/announcements" className={`bell-btn ${notificationPulse ? 'notification-pulse' : ''}`} title="Announcements"><Bell size={18} />{unreadCount > 0 && <span className="bell-badge" />}</Link>}
    </header>
    <main className="mobile-main">{children}</main>
    <PersistentAudioPlayer />
    {!lockProfile && <BottomNav active={active} />}
  </div>
}

function hasCompleteLocalProfile() {
  const name = localStorage.getItem('gic_member_name')?.trim()
  const phone = localStorage.getItem('gic_member_phone')?.trim()
  return Boolean(name && name !== 'Member' && phone)
}

function ProtectedRoute({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    const checkProfile = async () => {
      if (!localStorage.getItem('gic_auth_token')) {
        navigate('/', { replace: true })
        return
      }
      try {
        const { profile } = await fetchMemberApi('/api/auth/profile')
        if (cancelled) return
        storeAccountId(profile.id)
        localStorage.setItem('gic_member_name', profile.name || '')
        localStorage.setItem('gic_member_phone', profile.phone || '')
        localStorage.setItem('gic_member_email', profile.email || '')
        localStorage.setItem('gic_member_ministries', profile.ministries || '')
        localStorage.setItem('gic_member_center', profile.center || '')
        localStorage.setItem('gic_member_service_time', profile.serviceTime || '')
        localStorage.setItem('gic_member_birthday', profile.birthday || '')
        localStorage.setItem('gic_membership_status', profile.membershipStatus || '')
        localStorage.setItem('gic_member_joined_month', profile.joinedMonth || '')
        localStorage.setItem('gic_member_joined_year', profile.joinedYear || '')
        if (profile.avatar) localStorage.setItem('gic_member_avatar', profile.avatar)
        if (!profile.active || !profile.profileComplete) {
          if (location.pathname !== '/profile/edit') navigate('/profile/edit?required=1', { replace: true })
          return
        }
        if (!isStandalonePwa() && location.pathname !== '/onboarding') {
          navigate('/onboarding?stage=install', { replace: true })
          return
        }
        if (isStandalonePwa() && 'Notification' in window && Notification.permission === 'default' && location.pathname !== '/onboarding') {
          navigate('/onboarding?stage=notifications', { replace: true })
          return
        }
        if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
          await navigator.serviceWorker.register('/sw.js').catch(() => null)
          const token = await getFcmToken()
          if (token) await registerPushTokenWithBackend(token)
        }
        setChecking(false)
      } catch {
        navigate('/', { replace: true })
      }
    }
    checkProfile()
    return () => { cancelled = true }
  }, [location.pathname, navigate])

  if (checking && location.pathname !== '/profile/edit') return <div className="app-loading-state"><span className="loading-spinner" aria-hidden="true" /><span>Loading your account…</span></div>
  return children
}

function Welcome() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleSignIn = async () => {
    setBusy(true)
    setError('')
    try {
      let profile
      if (localStorage.getItem('gic_auth_token')) {
        try {
          profile = (await fetchMemberApi('/api/auth/profile')).profile
        } catch {
          clearStaleMemberSession()
          profile = (await performDeviceAuth()).member
        }
      } else profile = (await performDeviceAuth()).member
      navigate(profile.active && profile.profileComplete ? '/home' : '/profile/edit?required=1', { replace: true })
    } catch {
      setError('We could not sign you in. Please recover your account with your phone number.')
    } finally {
      setBusy(false)
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
        <button className="btn white wide" onClick={handleSignIn} disabled={busy}>{busy ? 'Signing in...' : 'Sign In'}</button>
        <Link className="center link-button" style={{ color: '#fff' }} to="/recover">Recover account with phone</Link>
      </div>
    </div>
  </div>
}

function Recovery() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const requestCode = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const auth = createPhoneAuth()
      const verifier = createPhoneRecaptcha('phone-recovery-recaptcha')
      const result = await signInWithPhoneNumber(auth, phone.trim(), verifier)
      setConfirmation(result)
    } catch (recoveryError) {
      setError(recoveryError.message || 'Unable to send verification code.')
    } finally {
      setBusy(false)
    }
  }

  const recoverAccount = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const firebaseUser = await confirmation.confirm(code.trim())
      const response = await fetch(`${API_BASE}/api/auth/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseToken: await firebaseUser.user.getIdToken(), deviceId: getOrCreateDeviceId() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Account recovery failed.')
      storeMemberSession(data)
      localStorage.setItem('gic_profile_completed', data.member.profileComplete ? 'true' : 'false')
      localStorage.setItem('gic_onboarding_profile', 'true')
      navigate('/onboarding', { replace: true })
    } catch (recoveryError) {
      setError(recoveryError.message || 'The verification code was not accepted.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="onboarding-page"><div className="onboarding-card">
    <Logo />
    <h1 style={{ textAlign: 'center', fontSize: '20px', marginTop: '16px' }}>Recover your account</h1>
    <p className="sub">Use the phone number saved on your GIC profile. Include the country code, for example +2348012345678.</p>
    {error && <p className="auth-inline-error" role="alert">{error}</p>}
    {!confirmation ? <form className="stack" onSubmit={requestCode}>
      <Field label="Phone Number" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+234 801 234 5678" icon={Phone} required />
      <div id="phone-recovery-recaptcha" />
      <button className="btn primary wide" type="submit" disabled={busy}>{busy ? 'Sending code...' : 'Send verification code'}</button>
    </form> : <form className="stack" onSubmit={recoverAccount}>
      <Field label="Verification Code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" required />
      <button className="btn primary wide" type="submit" disabled={busy}>{busy ? 'Recovering account...' : 'Recover account'}</button>
    </form>}
    <Link className="center link-button" to="/">Back to welcome</Link>
  </div></div>
}

function OnboardingFlow() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [permissionState, setPermissionState] = useState('default')
  const [installPrompt, setInstallPrompt] = useState(null)
  const [stage, setStage] = useState('profile')
  const [dismissedNotice, setDismissedNotice] = useState('')
  const [installMode, setInstallMode] = useState('unknown')
  const [installedApp, setInstalledApp] = useState(() => isStandalonePwa() || localStorage.getItem('gic_pwa_installed') === 'true')

  useEffect(() => {
    const token = localStorage.getItem('gic_auth_token')
    if (!token) {
      navigate('/', { replace: true })
      return
    }

    const notificationsAllowed = !('Notification' in window) || Notification.permission !== 'default'
    if (localStorage.getItem('gic_onboarding_completed') === 'true' && hasCompleteLocalProfile() && isStandalonePwa() && notificationsAllowed) {
      navigate('/home', { replace: true })
      return
    }

    const profileCompleted = localStorage.getItem('gic_profile_completed') === 'true'
    const requestedStage = new URLSearchParams(window.location.search).get('stage')
    const savedPermission = localStorage.getItem('gic_notification_permission')
    if (savedPermission) {
      setPermissionState(savedPermission)
    }

    if (!profileCompleted) {
      setStage('profile')
    } else if (requestedStage === 'install' && !isStandalonePwa()) {
      setStage('pwa')
    } else if (requestedStage === 'notifications' && isStandalonePwa()) {
      setStage('notification')
    } else if (!isStandalonePwa()) {
      setStage('pwa')
    } else if (Notification.permission === 'default') {
      setStage('notification')
    } else {
      setStage('notification')
    }

    const handleInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
      setInstallMode('browser')
    }

    const handleInstalled = () => {
      setInstalledApp(true)
      setLocalState('gic_pwa_installed', 'true')
      setDismissedNotice('GIC is installed. Open GIC from your home screen to continue.')
    }

    const refreshDisplayMode = () => setInstalledApp(isStandalonePwa() || localStorage.getItem('gic_pwa_installed') === 'true')

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener('pageshow', refreshDisplayMode)
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      setInstallMode('ios')
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener('pageshow', refreshDisplayMode)
    }
  }, [navigate])

  const finishOnboarding = () => {
    setLocalState('gic_onboarding_completed', 'true')
    localStorage.removeItem('gic_onboarding_profile')
    navigate('/home', { replace: true })
  }

  const registerPush = async () => {
    setBusy(true)
    setDismissedNotice('')

    try {
      if (!('Notification' in window)) {
        setPermissionState('unsupported')
        setLocalState('gic_notification_permission', 'unsupported')
        finishOnboarding()
        return
      }

      if (!getSecureMode()) {
        setPermissionState('unsupported')
        setLocalState('gic_notification_permission', 'unsupported')
        finishOnboarding()
        return
      }

      await navigator.serviceWorker.register('/sw.js').catch(() => null)

      const currentPermission = Notification.permission
      if (currentPermission === 'granted') {
        setPermissionState('granted')
        setLocalState('gic_notification_permission', 'granted')
        setLocalState('gic_notifications_prompted', 'true')
        playNotificationsEnabledSound()
        const token = await getFcmToken()
        if (token) await registerPushTokenWithBackend(token)
        finishOnboarding()
        return
      }

      if (currentPermission === 'denied') {
        setPermissionState('denied')
        setLocalState('gic_notification_permission', 'denied')
        finishOnboarding()
        return
      }

      const permission = await Notification.requestPermission()
      setPermissionState(permission)
      setLocalState('gic_notification_permission', permission)
      setLocalState('gic_notifications_prompted', 'true')
      if (permission === 'granted') {
        playNotificationsEnabledSound()
        const token = await getFcmToken()
        if (token) await registerPushTokenWithBackend(token)
      }
      finishOnboarding()
    } catch (error) {
      console.error('Notification onboarding error:', error)
      setDismissedNotice('Notifications could not be enabled right now. You can continue and try again later.')
      setPermissionState('denied')
      setLocalState('gic_notification_permission', 'denied')
      finishOnboarding()
    } finally {
      setBusy(false)
    }
  }

  const handleInstall = async () => {
    if (installedApp) {
      setDismissedNotice('GIC is already installed. Open it from your home screen to continue.')
      return
    }

    if (installPrompt) {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setLocalState('gic_pwa_installed', 'true')
        setDismissedNotice('GIC has been added. Open it from your home screen to continue.')
      }
      return
    }

    if (installMode === 'ios') {
      setStage('ios-install')
      return
    }

    setDismissedNotice('Use your browser menu to select “Add to Home Screen”, then open GIC from your home screen.')
  }

  const handleMaybeLater = () => {
    setLocalState('gic_pwa_install_prompt_seen', 'true')
    setDismissedNotice('Please install the GIC home screen app before continuing.')
  }

  if (stage === 'ios-install') {
    return <div className="onboarding-page"><div className="onboarding-card" style={{ minHeight: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><Logo /></div>
      <h1 style={{ textAlign: 'center', fontSize: '26px', marginBottom: '10px' }}>Add GIC to your Home Screen</h1>
      <p className="sub" style={{ textAlign: 'center', marginBottom: '24px' }}></p>
      <div className="stack" style={{ gap: '10px', textAlign: 'left', padding: '10px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '24px', height: '24px', borderRadius: '8px', background: '#f0edf7', display: 'grid', placeItems: 'center', color: '#5b2c8a', fontWeight: 700 }}>1</span><span>Tap the Share button.</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '24px', height: '24px', borderRadius: '8px', background: '#f0edf7', display: 'grid', placeItems: 'center', color: '#5b2c8a', fontWeight: 700 }}>2</span><span>Select “Add to Home Screen”.</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ width: '24px', height: '24px', borderRadius: '8px', background: '#f0edf7', display: 'grid', placeItems: 'center', color: '#5b2c8a', fontWeight: 700 }}>3</span><span>Tap “Add”.</span></div>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '26px' }}>
        <button className="btn gold wide" onClick={() => setDismissedNotice('Open GIC from your home screen to continue.')}>I installed GIC</button>
      </div>
      {dismissedNotice && <p className="sub" style={{ marginTop: '16px', textAlign: 'center', color: '#a61e1e' }}>{dismissedNotice}</p>}
    </div></div>
  }

  return <div className="onboarding-page"><div className="onboarding-card">
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><Logo /></div>
    {stage === 'profile' ? <>
      <h1 style={{ fontSize: '30px', textAlign: 'center', margin: '6px 0 12px' }}>Complete your profile</h1>
      <p className="sub" style={{ textAlign: 'center' }}>Tell us a little about yourself so your GIC member experience is personalized.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
        <button className="btn primary wide" onClick={() => navigate('/profile/edit')}>Complete Profile</button>
      </div>
    </> : stage === 'notification' ? <>
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
      <p className="sub" style={{ textAlign: 'center' }}></p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
        <button className="btn primary wide" onClick={handleInstall}>{installedApp ? 'Open GIC from Home Screen' : 'Add to Home Screen'}</button>
      </div>
      {permissionState === 'unsupported' && <p className="sub" style={{ marginTop: '16px', textAlign: 'center' }}>This browser does not support notification prompts, but you can still continue to GIC.</p>}
    </>}
  </div></div>
}

function LegacyHomePage() {
  const memberName = localStorage.getItem('gic_member_name') || ''
  const [latestMixlrRecording, setLatestMixlrRecording] = useState(null)
  const { setStream } = useAudioPlayer()
  const [selectedServiceEvent, setSelectedServiceEvent] = useState(null)
  const nextEvent = getServiceDisplay(getNextEvent())

  useEffect(() => {
    let cancelled = false
    const loadMixlr = async () => {
      try {
        const mixlrData = await getMixlrData()
        if (cancelled) return
        const streamUrl = mixlrData?.audioUrl || mixlrData?.streamUrl || 'https://globalimpactng.mixlr.com'
        setStream(streamUrl, mixlrData?.title || 'Global Impact Church', { loading: true })
      } catch {
        if (!cancelled) setStream('https://globalimpactng.mixlr.com', 'Global Impact Church', { loading: true })
      }
    }
    loadMixlr()
    return () => { cancelled = true }
  }, [setStream])

  return <>
    <MemberShell active="home">
      <section className="hero-card" style={{ padding: '18px', minHeight: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <small style={{ color: '#e0d6fc', fontSize: '11px', display: 'block' }}>Welcome home,</small>
            <h2 style={{ margin: '2px 0 0', fontSize: '20px', fontWeight: 700 }}>{memberName} </h2>
          </div>
          <Logo light />
        </div>

        <div className="hero-audio-console" style={{
          background: 'rgba(10, 4, 34, 0.65)',
          borderRadius: '14px',
          padding: '12px',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          marginTop: '8px'
        }}>
          <PersistentAudioPlayer embedded />
        </div>
      </section>
      <section className="section">
        <div className="section-head"><span>Next Service</span></div>
        <article className="announcement-card" onClick={() => setSelectedServiceEvent(getNextEvent())} style={{ cursor: 'pointer' }}>
          <div className="image-banner" style={{ backgroundImage: `url(${nextEvent.image})` }} />
          <div className="pad">
            <small>{nextEvent.title}</small>
            <h3>{nextEvent.date} · {nextEvent.time}</h3>
            <p>{nextEvent.location}</p>
            <span className="link-button"></span>
          </div>
        </article>
      </section>
      <section className="section">
        <div className="section-head"><span>Upcoming Events</span><Link to="/events">View All</Link></div>
        {getUpcomingEvents().slice(0, 2).map((event) => (
          <EventRow key={event.id} event={event} onOpenService={setSelectedServiceEvent} />
        ))}
      </section>
    </MemberShell>
    {selectedServiceEvent && <ServiceModal event={selectedServiceEvent} onClose={() => setSelectedServiceEvent(null)} />}
  </>
}

function HomePage() {
  const memberName = localStorage.getItem('gic_member_name') || ''
  const { setStream } = useAudioPlayer()
  const [selectedServiceEvent, setSelectedServiceEvent] = useState(null)
  const nextEvent = getServiceDisplay(getNextEvent())

  useEffect(() => {
    let cancelled = false
    getMixlrData()
      .then((mixlrData) => {
        if (cancelled) return
        setStream(mixlrData?.audioUrl || mixlrData?.streamUrl || 'https://globalimpactng.mixlr.com', mixlrData?.title || 'Global Impact Church', { loading: true })
      })
      .catch(() => {
        if (!cancelled) setStream('https://globalimpactng.mixlr.com', 'Global Impact Church', { loading: true })
      })
    return () => { cancelled = true }
  }, [setStream])

  return <>
    <MemberShell active="home">
      <section className="hero-card home-hero">
        <div className="home-hero-heading">
          <div>
            <small>Welcome home,</small>
            <h2>{memberName}</h2>
          </div>
          <Logo light />
        </div>
        <div className="hero-audio-console"><PersistentAudioPlayer embedded /></div>
      </section>
      <section className="section">
        <div className="section-head"><span>Next Service</span></div>
        <article className="announcement-card" onClick={() => setSelectedServiceEvent(getNextEvent())} style={{ cursor: 'pointer' }}>
          <div className="image-banner" style={{ backgroundImage: `url(${nextEvent.image})` }} />
          <div className="pad"><small>{nextEvent.title}</small><h3>{nextEvent.date} · {nextEvent.time}</h3><p>{nextEvent.location}</p></div>
        </article>
      </section>
      <section className="section">
        <div className="section-head"><span>Upcoming Events</span><Link to="/events">View All</Link></div>
        {getUpcomingEvents().slice(0, 2).map((event) => <EventRow key={event.id} event={event} onOpenService={setSelectedServiceEvent} />)}
      </section>
    </MemberShell>
    {selectedServiceEvent && <ServiceModal event={selectedServiceEvent} onClose={() => setSelectedServiceEvent(null)} />}
  </>
}

function EventRow({ event, onOpenService }) {
  const displayEvent = event.isService ? getServiceDisplay(event) : event
  const content = <><img src={displayEvent.image} alt="" /><div><b>{displayEvent.title}</b><small className="event-meta"><CalendarDays size={13} />{displayEvent.date} · {displayEvent.time}</small><small className="event-location"><MapPin size={13} />{displayEvent.location}</small></div>{!displayEvent.isService && <ChevronRight className="event-chevron" size={19} />}</>
  if (displayEvent.isService) {
    return <button type="button" className="event-row service-row" onClick={() => onOpenService?.(event)}>{content}</button>
  }
  return <Link className="event-row" to={`/events/${displayEvent.id}`}>{content}</Link>
}

function Announcements() {
  const [category, setCategory] = useState('All')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const categories = ['All', 'General', 'Ministries', 'Notices']
  const { setUnreadCount, refreshUnreadCount } = useNotificationCount()
  const sundayServiceCopy = getSundayServiceCopy()
  const markAllAsRead = async () => {
    await fetchMemberApi('/api/notifications/read-all', { method: 'PATCH' })
    setUnreadCount(0)
    localStorage.setItem('gic_notification_unread_count', '0')
    await refreshUnreadCount()
  }
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
    <div className="announcement-toolbar"><div className="tabs">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div><button type="button" className="mark-read-button" onClick={markAllAsRead}>Mark all as read</button></div>
    {loading && <p className="center muted">Loading announcements...</p>}
    {error && <p className="center muted">Announcements are unavailable right now.</p>}
    {!loading && !error && <div className="announcement-list">{visibleAnnouncements.map((announcement) => <Link className="list-card" key={announcement.id} to={`/announcements/${announcement.id}`}><div><b>{announcement.title}</b><small>{announcement.summary}</small><time>{announcement.date}</time></div><ChevronRight size={18} /></Link>)}</div>}
    {!loading && !error && !visibleAnnouncements.length && <p className="center muted">No announcements yet.</p>}
  </MemberShell>
}

function AnnouncementDetails() {
  const { id } = useParams()
  const { refreshUnreadCount } = useNotificationCount()
  const [announcement, setAnnouncement] = useState(null)
  useEffect(() => {
    fetchMemberApi('/api/notifications')
      .then(({ items = [] }) => {
        const notification = items.find((item) => item.id === id)
        fetchMemberApi(`/api/notifications/${id}/read`, { method: 'PATCH' }).then(() => refreshUnreadCount()).catch(() => {})
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
  const [selectedServiceEvent, setSelectedServiceEvent] = useState(null)
  return <>
    <MemberShell active="events" title="Events" backTo="/home">
      <div className="segmented"><button className="active">Upcoming</button><Link to="/my-registrations">My Events</Link></div>
      {getUpcomingEvents().map((event) => <EventRow key={event.id} event={event} onOpenService={setSelectedServiceEvent} />)}
    </MemberShell>
    {selectedServiceEvent && <ServiceModal event={selectedServiceEvent} onClose={() => setSelectedServiceEvent(null)} />}
  </>
}

function ServiceModal({ event, onClose }) {
  const serviceEvent = getServiceDisplay(event)
  const startDate = getServiceOccurrence(event.id)
  const occurrenceKey = startDate.toISOString()
  const [activeReminders, setActiveReminders] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    fetchMemberApi(`/api/service-reminders?occurrenceKey=${encodeURIComponent(occurrenceKey)}`)
      .then(({ reminders = [] }) => { if (!cancelled) { setActiveReminders(reminders.map((item) => Number(item.offsetMinutes))); setLoaded(true) } })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [occurrenceKey])
  const toggleReminder = (minutes) => setActiveReminders((current) => current.includes(minutes) ? current.filter((value) => value !== minutes) : [...current, minutes].sort((a, b) => a - b))
  const saveReminders = async () => {
    try {
      await Promise.all([60, 30].map((minutes) => activeReminders.includes(minutes)
        ? fetchMemberApi('/api/service-reminders', { method: 'POST', body: JSON.stringify({ serviceType: event.id, occurrenceKey, serviceStartsAt: startDate.toISOString(), offsetMinutes: minutes, scheduledFor: new Date(startDate.getTime() - minutes * 60000).toISOString() }) })
        : fetchMemberApi(`/api/service-reminders?occurrenceKey=${encodeURIComponent(occurrenceKey)}&offsetMinutes=${minutes}`, { method: 'DELETE' })))
      setLoaded(true)
      setMessage('Reminder saved.')
    } catch { setMessage('Reminders require an active signed-in connection.') }
  }
  const addToCalendar = () => {
    const endDate = new Date(startDate.getTime() + (event.id === 'midweek-service' ? 90 : 120) * 60000)
    const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`, details: `Global Impact Church service (${TIME_ZONE}).`, location: serviceEvent.location })
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank', 'noopener,noreferrer')
    setMessage('Opening your calendar…')
  }
  const labels = activeReminders.map((minutes) => minutes === 60 ? '1 hour' : `${minutes} minutes`)
  return createPortal(<div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true"><div className="service-modal" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose} aria-label="Close service details">×</button><span className="eyebrow">Service</span><h2>{serviceEvent.title}</h2><div className="detail-meta"><span><CalendarDays size={15} />{serviceEvent.date}</span><span><Clock3 size={15} />{serviceEvent.time}</span><span><MapPin size={15} />{serviceEvent.location}</span></div><p>Join us for worship, the Word, and fellowship at Global Impact Church.</p><div className="reminder-panel">{!loaded ? <b>Loading reminders...</b> : activeReminders.length ? <div className="reminder-confirmation"><CheckCircle2 size={18} /><span><b>Reminder{activeReminders.length > 1 ? 's' : ''} set</b><small>{labels.join(', ')} before</small></span></div> : <><b>Remind me</b><label className="check"><input type="checkbox" checked={activeReminders.includes(60)} onChange={() => toggleReminder(60)} /> 1 hour before</label><label className="check"><input type="checkbox" checked={activeReminders.includes(30)} onChange={() => toggleReminder(30)} /> 30 minutes before</label><button type="button" className="btn primary wide" onClick={saveReminders}>Remind Me</button></>}</div><div className="service-modal-actions"><button type="button" className="btn white wide" onClick={addToCalendar}>Add to Calendar</button><button type="button" className="btn white wide" onClick={onClose}>Close</button></div>{message && <p className="center muted">{message}</p>}</div></div>, document.body)
}

function ServiceModalLegacyCurrent({ event, onClose }) {
  const serviceEvent = getServiceDisplay(event)
  const startDate = getServiceOccurrence(event.id)
  const endDate = new Date(startDate.getTime() + (event.id === 'midweek-service' ? 90 : 120) * 60000)
  const reminderOptions = [60, 30]
  const occurrenceKey = startDate.toISOString()
  const [activeReminders, setActiveReminders] = useState([])
  const [message, setMessage] = useState('')
  const [remindersLoaded, setRemindersLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchMemberApi(`/api/service-reminders?occurrenceKey=${encodeURIComponent(occurrenceKey)}`)
      .then(({ reminders = [] }) => { if (!cancelled) { setActiveReminders(reminders.map((reminder) => Number(reminder.offsetMinutes))); setRemindersLoaded(true) } })
      .catch(() => { if (!cancelled) setRemindersLoaded(true) })
    return () => { cancelled = true }
  }, [occurrenceKey])

  const toggleReminder = (minutes) => setActiveReminders((current) => current.includes(minutes) ? current.filter((value) => value !== minutes) : [...current, minutes].sort((a, b) => a - b))
  const saveReminders = async () => {
    try {
      await Promise.all(reminderOptions.map((minutes) => {
        const scheduledFor = new Date(startDate.getTime() - minutes * 60000)
        return activeReminders.includes(minutes)
          ? fetchMemberApi('/api/service-reminders', { method: 'POST', body: JSON.stringify({ serviceType: event.id, occurrenceKey, serviceStartsAt: startDate.toISOString(), offsetMinutes: minutes, scheduledFor: scheduledFor.toISOString() }) })
          : fetchMemberApi(`/api/service-reminders?occurrenceKey=${encodeURIComponent(occurrenceKey)}&offsetMinutes=${minutes}`, { method: 'DELETE' })
      }))
      setMessage(activeReminders.length ? 'Reminder saved.' : 'Reminders removed.')
    } catch { setMessage('Reminders require an active signed-in connection.') }
  }
  const addToCalendar = () => {
    const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title, dates: `${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`, details: `Global Impact Church service (${TIME_ZONE}).`, location: serviceEvent.location })
    const calendarUrl = `https://calendar.google.com/calendar/render?${params.toString()}`
    if (window.open(calendarUrl, '_blank', 'noopener,noreferrer')) {
      setMessage('Opening your calendar…')
      return
    }
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Global Impact Church//GIC//EN', 'BEGIN:VEVENT', `UID:${event.id}-${occurrenceKey}`, `DTSTART:${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`, `DTEND:${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`, `SUMMARY:${event.title}`, `LOCATION:${serviceEvent.location}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const blobUrl = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `${event.id}-service.ics`
    link.click()
    URL.revokeObjectURL(blobUrl)
    setMessage('Calendar app unavailable; calendar file downloaded.')
  }

  return createPortal(<div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true"><div className="service-modal" onClick={(eventClick) => eventClick.stopPropagation()}><button type="button" className="modal-close" onClick={onClose} aria-label="Close service details">×</button><span className="eyebrow">Service</span><h2>{serviceEvent.title}</h2><div className="detail-meta"><span><CalendarDays size={15} />{new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(startDate)}</span><span><Clock3 size={15} />{new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(startDate)}</span><span><MapPin size={15} />{serviceEvent.location}</span></div><p>{event.id === 'midweek-service' ? 'Join us for a vibrant midweek gathering of worship, prayer, and the Word.' : 'Join us for worship, the Word, and fellowship at Global Impact Church.'}</p><div className="reminder-panel"><b>Remind me</b><label className="check"><input type="checkbox" checked={activeReminders.includes(60)} onChange={() => toggleReminder(60)} /> 1 hour before</label><label className="check"><input type="checkbox" checked={activeReminders.includes(30)} onChange={() => toggleReminder(30)} /> 30 minutes before</label><button type="button" className="btn primary wide" onClick={saveReminders}>Remind Me</button></div><div className="service-modal-actions"><button type="button" className="btn white wide" onClick={addToCalendar}>Add to Calendar</button><button type="button" className="btn white wide" onClick={onClose}>Close</button></div>{message && <p className="center muted">{message}</p>}</div></div>, document.body)
}

function ServiceModalLegacy({ event, onClose }) {
  const serviceEvent = getServiceDisplay(event)
  const startDate = getServiceOccurrence(event.id)
  const endDate = new Date(startDate.getTime() + (event.id === 'midweek-service' ? 90 : 120) * 60000)
  const reminderOptions = [60, 30]
  const occurrenceKey = startDate.toISOString()
  const [activeReminders, setActiveReminders] = useState([])
  const [reminderMessage, setReminderMessage] = useState('')
  const [calendarMessage, setCalendarMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchMemberApi(`/api/service-reminders?occurrenceKey=${encodeURIComponent(occurrenceKey)}`)
      .then(({ reminders = [] }) => { if (!cancelled) setActiveReminders(reminders.map((reminder) => Number(reminder.offsetMinutes))) })
      .catch(() => { if (!cancelled) setActiveReminders(reminderOptions.filter((offset) => localStorage.getItem(`gic_reminder_${event.id}_${offset}`) === 'true')) })
    return () => { cancelled = true }
  }, [event.id, occurrenceKey])

  const toggleReminder = (minutes) => {
    setActiveReminders((current) => current.includes(minutes) ? current.filter((value) => value !== minutes) : [...current, minutes].sort((a, b) => a - b))
  }

  const saveReminders = async () => {
    try {
      await Promise.all(reminderOptions.map((minutes) => {
        const scheduledFor = new Date(startDate.getTime() - minutes * 60000)
        if (activeReminders.includes(minutes)) return fetchMemberApi('/api/service-reminders', { method: 'POST', body: JSON.stringify({ serviceType: event.id, occurrenceKey, serviceStartsAt: startDate.toISOString(), offsetMinutes: minutes, scheduledFor: scheduledFor.toISOString() }) })
        return fetchMemberApi(`/api/service-reminders?occurrenceKey=${encodeURIComponent(occurrenceKey)}&offsetMinutes=${minutes}`, { method: 'DELETE' })
      }))
      setReminderMessage(activeReminders.length ? 'Reminder saved.' : 'Reminders removed.')
    } catch { setReminderMessage('Reminders require an active signed-in connection.') }
  }

  const addToCalendar = () => {
    const title = event.title || 'Service'
    const start = startDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const end = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Global Impact Church//GIC//EN',
      'BEGIN:VEVENT',
      `UID:${event.id}-${startDate.toISOString()}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${title}`,
      `LOCATION:${serviceEvent.location}`,
      `DESCRIPTION:${title} at Global Impact Church. Reminders: ${activeReminders.length ? activeReminders.join(', ') + ' minutes before' : 'No reminders selected'}.`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${event.id}-service.ics`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setCalendarMessage('Calendar invite downloaded. Your device may show it in the default calendar app.')
  }

  return <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true"><div className="service-modal" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose} aria-label="Close service details">×</button><div className="service-modal-header"><span className="eyebrow">Service</span><h2>{serviceEvent.title}</h2></div><div className="detail-meta"><span><CalendarDays size={15} />{new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos', weekday: 'long', month: 'short', day: 'numeric' }).format(startDate)}</span><span><Clock3 size={15} />{serviceEvent.time}</span><span><MapPin size={15} />{serviceEvent.location}</span></div><p>{event.id === 'midweek-service' ? 'Join us for a vibrant midweek gathering of worship, prayer, and the Word.' : 'Join us for worship, the Word, and fellowship at Global Impact Church.'}</p><div className="reminder-panel"><b>Remind me</b><label className="check"><input type="checkbox" checked={activeReminders.includes(60)} onChange={() => toggleReminder(60)} /> 1 hour before</label><label className="check"><input type="checkbox" checked={activeReminders.includes(30)} onChange={() => toggleReminder(30)} /> 30 minutes before</label></div><div className="service-modal-actions"><button type="button" className="btn primary wide" onClick={addToCalendar}>Add to Calendar</button><button type="button" className="btn white wide" onClick={onClose}>Close</button></div>{calendarMessage && <p className="center muted">{calendarMessage}</p>}</div></div>
}

function EventDetails() {
  const { id } = useParams(); const e = events.find(x => x.id === id) || events[0]
  if (e.isService) {
    const service = getServiceDisplay(e)
    return <MemberShell active="events" backTo="/events" title={service.title}><div className="detail-body"><h1>{service.title}</h1><div className="detail-meta"><span><CalendarDays size={15} />{service.date}</span><span><Clock3 size={15} />{service.time}</span><span><MapPin size={15} />{service.location}</span></div><p>Join us for worship, the Word, and fellowship at Global Impact Church.</p></div></MemberShell>
  }
  const isRegistered = Boolean(localStorage.getItem(`gic_registration_${e.id}`))
  return <MemberShell active="events" backTo="/events" title=""><div className="detail-image" style={{ backgroundImage: `url(${e.image})` }} /><div className="detail-body"><h1>{e.title}</h1><div className="detail-meta"><span><CalendarDays size={15} />{e.date}</span><span><Clock3 size={15} />{e.time}</span><span><MapPin size={15} />{e.location}</span><span><Ticket size={15} />Free</span></div><p>An exciting time of worship, word, workshops and encounters. Don't miss it!</p><h3>What to Expect</h3><ul className="check-list"><li>Powerful Worship</li><li>Inspiring Sessions</li><li>Networking</li><li>And more</li></ul>{isRegistered ? <Link className="btn primary wide registered-event-button" to="/my-registrations"><Check size={17} /> Registered - View My Events</Link> : <Link className="btn primary wide" to={`/events/${e.id}/register`}>Register Now</Link>}</div></MemberShell>
}

function EventRegistration() {
  const navigate = useNavigate()
  const { id } = useParams()
  const event = events.find((item) => item.id === id) || events[0]
  const memberName = localStorage.getItem('gic_member_name') || ''
  const email = localStorage.getItem('gic_member_email') || ''
  const phone = localStorage.getItem('gic_member_phone') || ''
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
  const memberName = localStorage.getItem('gic_member_name') || ''
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
  const memberName = localStorage.getItem('gic_member_name') || ''
  const [selectedNames, setSelectedNames] = useState(() => (localStorage.getItem('gic_member_ministries') || '').split(',').map((ministry) => ministry.trim()).filter(Boolean))
  const selectedMinistries = selectedNames.map((name) => ministries.find((ministry) => ministry.title === name)).filter(Boolean)
  const [applications, setApplications] = useState([])

  useEffect(() => {
    fetchMemberApi('/api/ministry-applications')
      .then((response) => {
        const records = response.applications || []
        setApplications(records)
        const approved = records.filter((application) => application.status === 'APPROVED').map((application) => application.ministry)
        const merged = [...new Set([...selectedNames, ...approved])]
        if (merged.length !== selectedNames.length) {
          localStorage.setItem('gic_member_ministries', merged.join(', '))
          setSelectedNames(merged)
        }
      })
      .catch(() => setApplications([]))
  }, [])

  const pendingMinistries = new Set(applications.filter((application) => application.status === 'PENDING').map((application) => application.ministry))

  return <MemberShell active="ministries" title="My Ministries" backTo="/home">
    <p className="ministries-subtitle"></p>
    {pendingMinistries.size > 0 && <section className="ministries-list"><b>Pending requests</b>{[...pendingMinistries].map((name) => { const ministry = ministries.find((item) => item.title === name); return ministry ? <div className="ministry-row" key={`pending-${ministry.id}`}><img src={ministry.image} alt="" /><div><b>{ministry.title}</b><small>Pending approval</small></div><span className="badge blue">Pending</span></div> : null })}</section>}
    {selectedMinistries.length ? <div className="ministries-list">{selectedMinistries.map((ministry) => <Link className="ministry-row" key={ministry.id} to={`/ministries/${ministry.id}`}><img src={ministry.image} alt="" /><div><b>{ministry.title}</b><small>{pendingMinistries.has(ministry.title) ? 'Application being processed' : ministry.desc}</small></div><ChevronRight size={18} /></Link>)}<Link className="btn secondary wide" to="/ministries/browse">Browse all ministries</Link></div> : <div className="ministry-empty"><img className="empty-state-image" src="https://i.ibb.co/TBZR7vhL/360-F-488073924-Q1o-PSz-ULLWPDLFof-Tk-Jk8z-OVCa-La9gv8.jpg" alt="People serving together" /><h1>Hey {memberName}</h1><p>You haven't joined any ministry yet.</p><small>You have been blessed to be a blessing. Come serve the Lord and make impact with us!</small><Link className="btn primary wide" to="/ministries/browse">I want to serve!</Link><div className="ministry-help"><b>Not sure where to start?</b><span>Need help choosing a ministry? <a className="whatsapp-link" href="https://wa.me/2349034147986" target="_blank" rel="noreferrer">WhatsApp +234 903 414 7986</a></span></div></div>}
  </MemberShell>
}

function MinistryDirectory() {
  const [approvedMinistries, setApprovedMinistries] = useState(() => (localStorage.getItem('gic_member_ministries') || '').split(',').map((ministry) => ministry.trim()).filter(Boolean))

  useEffect(() => {
    fetchMemberApi('/api/ministry-applications')
      .then((response) => {
        const approved = response.applications?.filter((application) => application.status === 'APPROVED').map((application) => application.ministry) || []
        setApprovedMinistries((current) => [...new Set([...current, ...approved])])
      })
      .catch(() => {})
  }, [])

  return <MemberShell active="ministries" title="Browse Ministries" backTo="/ministries">
    <p className="ministries-subtitle">Find a place to grow, serve, and make an impact.</p>
    <div className="directory-list">{ministries.map((ministry) => <article className="directory-card" key={ministry.id}>
      <img src={ministry.image} alt="" />
      <div className="directory-card-body">
        <h2>{ministry.title}</h2>
        <p>{ministry.desc}</p>
        <div className="directory-requirements"><b>What you need</b><span>{ministry.requirements}</span></div>
        {approvedMinistries.includes(ministry.title) ? <Link className="btn member wide" to={`/ministries/${ministry.id}`}>Member</Link> : <Link className="btn primary wide" to={`/ministries/${ministry.id}/apply`}>Apply to serve</Link>}
      </div>
    </article>)}</div>
  </MemberShell>
}

function MinistryApplication() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ministry = ministries.find((item) => item.id === id)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (!ministry) return <Navigate to="/ministries/browse" replace />

  const submitApplication = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await fetchMemberApi('/api/ministry-applications', {
        method: 'POST',
        body: JSON.stringify({
          ministry: ministry.title,
          message,
          memberName: localStorage.getItem('gic_member_name') || '',
        }),
      })
      setSubmitted(true)
    } catch (error) {
      setMessage(error.message || 'This ministry request could not be submitted.')
    } finally {
      setBusy(false)
    }
  }

  if (submitted) return <MemberShell active="ministries" title="Application sent" backTo="/ministries/browse"><div className="empty"><Check size={28} /><h2>Application being processed</h2><p>Your application to serve in {ministry.title} has been sent and is being processed by the GIC team.</p><button className="btn primary wide" onClick={() => navigate('/ministries')}>Back to My Ministries</button></div></MemberShell>

  return <MemberShell active="ministries" title="Apply to serve" backTo="/ministries/browse">
    <div className="detail-body"><span className="eyebrow">Ministry application</span><h1>{ministry.title}</h1><p>{ministry.desc}</p><div className="ministry-about"><b>What you need</b><p>{ministry.requirements}</p></div><form className="stack" onSubmit={submitApplication}><label className="field"><span>Why would you like to serve here?</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Share a little about your interest..." rows="5" minLength="10" required /></label><button className="btn primary wide" type="submit" disabled={busy}>{busy ? 'Sending application...' : 'Send application'}</button></form></div>
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
    ['Ministries', localStorage.getItem('gic_member_ministries') || 'Add info', Users],
    ['Center', localStorage.getItem('gic_member_center') || 'Add info', MapPin],
    ['Preferred Service Time', localStorage.getItem('gic_member_service_time') || 'Add info', Clock3],
    ['Birthday', localStorage.getItem('gic_member_birthday') || 'Add info', CalendarDays],
    ['New member?', localStorage.getItem('gic_membership_status') || 'Add info', ShieldCheck],
    ...(localStorage.getItem('gic_member_joined_year') ? [['Member since', [localStorage.getItem('gic_member_joined_month') && new Date(2000, Number(localStorage.getItem('gic_member_joined_month')) - 1).toLocaleString('en-US', { month: 'long' }), localStorage.getItem('gic_member_joined_year')].filter(Boolean).join(' '), CalendarDays]] : []),
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
  const location = useLocation()
  const required = new URLSearchParams(location.search).get('required') === '1'
  const [name, setName] = useState(localStorage.getItem('gic_member_name') || '')
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
  const [joinedMonth, setJoinedMonth] = useState(localStorage.getItem('gic_member_joined_month') || '')
  const [joinedYear, setJoinedYear] = useState(localStorage.getItem('gic_member_joined_year') || '')
  const [avatar, setAvatar] = useState(localStorage.getItem('gic_member_avatar') || '')
  const [saveError, setSaveError] = useState('')
  const selectedCenter = serviceCenters.find((serviceCenter) => serviceCenter.name === center)
  const availableServiceTimes = selectedCenter?.times || []

  const handleSave = async (e) => {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return
    setSaveError('')
    try {
      await performDeviceAuth(name.trim())
      const profileResponse = await fetchMemberApi('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          ministries: localStorage.getItem('gic_member_ministries') || '',
          center,
          serviceTime,
          birthday,
          membershipStatus,
          joinedMonth: joinedMonth ? Number(joinedMonth) : null,
          joinedYear: joinedYear ? Number(joinedYear) : null,
          avatar,
        }),
      })
      const savedProfile = profileResponse.profile
      localStorage.setItem('gic_member_name', savedProfile.name || '')
      localStorage.setItem('gic_member_phone', savedProfile.phone || '')
      localStorage.setItem('gic_member_email', savedProfile.email || '')
      localStorage.setItem('gic_member_ministries', savedProfile.ministries || '')
      localStorage.setItem('gic_member_center', savedProfile.center || '')
      localStorage.setItem('gic_member_service_time', savedProfile.serviceTime || '')
      localStorage.setItem('gic_member_birthday', savedProfile.birthday || '')
      localStorage.setItem('gic_membership_status', savedProfile.membershipStatus || '')
      localStorage.setItem('gic_member_joined_month', savedProfile.joinedMonth || '')
      localStorage.setItem('gic_member_joined_year', savedProfile.joinedYear || '')
      if (savedProfile.avatar) localStorage.setItem('gic_member_avatar', savedProfile.avatar)
      localStorage.setItem('gic_profile_completed', 'true')
      const notificationReady = !('Notification' in window) || Notification.permission !== 'default'
      if (isStandalonePwa() && notificationReady) {
        localStorage.setItem('gic_onboarding_completed', 'true')
        localStorage.removeItem('gic_onboarding_profile')
        navigate('/home', { replace: true })
      } else if (required || localStorage.getItem('gic_onboarding_profile') === 'true') {
        navigate('/onboarding?stage=install', { replace: true })
      } else {
        navigate('/profile')
      }
    } catch (error) {
      setSaveError(error.message || 'Profile could not be saved. Please try again.')
    }
  }

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setAvatar(reader.result)
    reader.readAsDataURL(file)
  }

  return <MemberShell active="profile" title="Edit Profile" backTo="/profile" lockProfile={required}>
    <div className="profile-head">
      <label className="avatar large avatar-picker">
        {avatar ? <img src={avatar} alt="Profile preview" /> : name.slice(0, 2).toUpperCase()}
        <span><Camera size={13} /></span>
        <input type="file" accept="image/*" onChange={handleAvatarChange} />
      </label>
    </div>
    {required && <p className="auth-inline-error" role="alert">Your account needs a name and phone number before you can continue.</p>}
    {saveError && <p className="auth-inline-error" role="alert">{saveError}</p>}
    <form onSubmit={handleSave} className="stack">
      <label className="field">
        <span>FULL NAME</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <Field label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 801 234 5678" icon={Phone} />
      <Field label="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@gic.org" icon={Mail} />
      <div className="field"><span>MINISTRIES</span><p className="muted">Ministry membership is added after admin approval. Apply from Browse Ministries to request to join.</p></div>
      <SelectField label="Center You Attend" value={center} onChange={(e) => { setCenter(e.target.value); setServiceTime('') }}>
        {serviceCenters.map((serviceCenter) => <option key={serviceCenter.name} value={serviceCenter.name}>{serviceCenter.name}</option>)}
      </SelectField>
      <SelectField label="Preferred Service Time" value={serviceTime} onChange={(e) => setServiceTime(e.target.value)} disabled={!center}>
        {availableServiceTimes.map((time) => <option key={time} value={time}>{time}</option>)}
      </SelectField>
      <Field label="Birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} icon={CalendarDays} />
      <SelectField label="New member?" value={membershipStatus} onChange={(e) => setMembershipStatus(e.target.value)}>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </SelectField>
      <SelectField label="Month joined (Optional)" value={joinedMonth} onChange={(e) => setJoinedMonth(e.target.value)}>
        <option value="">I'm not sure</option>
        {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index, 1).toLocaleString('en-US', { month: 'long' })}</option>)}
      </SelectField>
      <label className="field"><span>YEAR JOINED</span><input type="number" min="1900" max={new Date().getFullYear()} value={joinedYear} onChange={(e) => setJoinedYear(e.target.value)} required={required || !localStorage.getItem('gic_profile_completed')} /></label>
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
    }) : <div className="events-empty-state">
      <div className="events-empty-illustration" aria-hidden="true">
        <div className="events-empty-calendar"><CalendarDays size={86} strokeWidth={1.35} /></div>
        <span className="events-empty-cross">✦</span>
        <span className="events-empty-person person-one"><User size={18} /></span>
        <span className="events-empty-person person-two"><User size={16} /></span>
        <span className="events-empty-dot dot-one" />
        <span className="events-empty-dot dot-two" />
      </div>
      <h1>No events yet</h1>
      <p>Hey {localStorage.getItem('gic_member_name') || 'there'} <br />You haven't registered for any events.<br />Discover upcoming conferences, special programmes and services, there is always a place for you!</p>
      <Link className="btn primary wide events-empty-button" to="/events">Find Events</Link>
    </div>}
  </MemberShell>
}

export default function App() {
  return <NotificationProvider>
    <AudioPlayerProvider>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/recover" element={<Recovery />} />
        <Route path="/onboarding" element={<OnboardingFlow />} />
        <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/announcements" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />
        <Route path="/announcements/:id" element={<ProtectedRoute><AnnouncementDetails /></ProtectedRoute>} />
        <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
        <Route path="/events/:id" element={<ProtectedRoute><EventDetails /></ProtectedRoute>} />
        <Route path="/events/:id/register" element={<ProtectedRoute><EventRegistration /></ProtectedRoute>} />
        <Route path="/events/:id/success" element={<ProtectedRoute><RegistrationSuccess /></ProtectedRoute>} />
        <Route path="/my-registrations" element={<ProtectedRoute><MyRegistrations /></ProtectedRoute>} />
        <Route path="/forms" element={<ProtectedRoute><FormsPage /></ProtectedRoute>} />
        <Route path="/forms/prayer-request" element={<ProtectedRoute><PrayerRequest /></ProtectedRoute>} />
        <Route path="/ministries" element={<ProtectedRoute><MinistriesPage /></ProtectedRoute>} />
        <Route path="/ministries/browse" element={<ProtectedRoute><MinistryDirectory /></ProtectedRoute>} />
        <Route path="/ministries/:id/apply" element={<ProtectedRoute><MinistryApplication /></ProtectedRoute>} />
        <Route path="/ministries/:id" element={<ProtectedRoute><MinistryDetails /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/profile/edit" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AudioPlayerProvider>
  </NotificationProvider>
}
