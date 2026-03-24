import React, { useMemo, useState, useEffect, useCallback, useContext, useRef } from 'react'
import { CATEGORY_LABELS, SUBCATEGORY_LABELS } from '../tokens/categories'
import { TAGS_BY_GROUP, TAG_BY_ID, SUBCATEGORY_TAG_IDS, primaryTagToCategory } from '../tokens/tags'
import useGuardianStatus from '../hooks/useGuardianStatus'
import useListings from '../hooks/useListings'
import useCamera from '../hooks/useCamera'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import useResidence from '../hooks/useResidence'
import { getReviews, postReview, postReply, postEvent, updateListing as apiUpdateListing, getClaimSecret, getClaimSecretAdmin, getQrDesign, uploadPhoto as apiUploadPhoto, removePhoto as apiRemovePhoto, getResidentCount, getLobbyPosts, postLobbyPost, removeLobbyPost, leaveResidence, claimResidence } from '../lib/api'
import { FormattedTextarea, renderMarkdown, relativeTime as lobbyRelativeTime } from '../lib/markdown'
import compressImage from '../lib/compressImage'
import { getDeviceHash } from '../lib/device'
import useHandle from '../hooks/useHandle'
import useEvents from '../hooks/useEvents'
import useTimeOfDay from '../hooks/useTimeOfDay'
import AvatarCircle from './AvatarCircle'
import QRCode from 'qrcode'
import { useCourierAvailable } from './CourierDots'
import { useCodeDesk } from './CodeDeskModal'
import facadeMapping from '../data/facade_mapping.json'

const BASE = import.meta.env.BASE_URL
const assetUrl = (url) => url?.startsWith('http') ? url : `${BASE}${url?.replace(/^\//, '')}`

// Facade photo lookup: building_id -> { image path, description }
function getFacadeInfo(buildingId) {
  const entry = facadeMapping[buildingId]
  if (!entry) return null
  // Strip /public/ prefix — Vite serves public/ at root
  const photo = entry.image.replace(/^\/public\//, '/')
  return { photo, description: entry.description }
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_LABELS = {
  sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat'
}

const ZONING_LABELS = {
  A: 'Single-Family Residential',
  B: 'Two-Family Residential',
  C: 'Multi-Family Residential',
  D: 'Neighborhood Commercial',
  E: 'Multiple-Family Dwelling',
  F: 'Neighborhood Commercial',
  G: 'Local Commercial & Office',
  H: 'Area Commercial',
  J: 'Industrial',
  K: 'Unrestricted',
}

function formatTime(time) {
  if (!time) return null
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

function getOpenStatus(hours) {
  if (!hours) return { isOpen: null, text: 'Hours not available' }

  const now = new Date()
  const dayName = DAY_NAMES[now.getDay()]
  const todayHours = hours[dayName]

  if (!todayHours) {
    for (let i = 1; i <= 7; i++) {
      const nextDayIndex = (now.getDay() + i) % 7
      const nextDay = DAY_NAMES[nextDayIndex]
      if (hours[nextDay]) {
        return {
          isOpen: false,
          text: `Closed \u00B7 Opens ${DAY_LABELS[nextDay]} ${formatTime(hours[nextDay].open)}`
        }
      }
    }
    return { isOpen: false, text: 'Closed' }
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const [openH, openM] = todayHours.open.split(':').map(Number)
  const [closeH, closeM] = todayHours.close.split(':').map(Number)
  const openMinutes = openH * 60 + openM
  let closeMinutes = closeH * 60 + closeM

  if (closeMinutes < openMinutes) {
    closeMinutes += 24 * 60
    if (currentMinutes < openMinutes) {
      const adjustedCurrent = currentMinutes + 24 * 60
      if (adjustedCurrent < closeMinutes) {
        return { isOpen: true, text: `Open \u00B7 Closes ${formatTime(todayHours.close)}` }
      }
    }
  }

  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return { isOpen: true, text: `Open \u00B7 Closes ${formatTime(todayHours.close)}` }
  }

  if (currentMinutes < openMinutes) {
    return { isOpen: false, text: `Closed \u00B7 Opens ${formatTime(todayHours.open)}` }
  }

  for (let i = 1; i <= 7; i++) {
    const nextDayIndex = (now.getDay() + i) % 7
    const nextDay = DAY_NAMES[nextDayIndex]
    if (hours[nextDay]) {
      if (i === 1) {
        return { isOpen: false, text: `Closed \u00B7 Opens tomorrow ${formatTime(hours[nextDay].open)}` }
      }
      return { isOpen: false, text: `Closed \u00B7 Opens ${DAY_LABELS[nextDay]} ${formatTime(hours[nextDay].open)}` }
    }
  }

  return { isOpen: false, text: 'Closed' }
}

function formatHoursDisplay(hours) {
  if (!hours) return null
  const formatted = []
  DAY_NAMES.forEach(day => {
    const dayHours = hours[day]
    if (dayHours) {
      formatted.push({
        day: DAY_LABELS[day],
        hours: `${formatTime(dayHours.open)} - ${formatTime(dayHours.close)}`
      })
    } else {
      formatted.push({ day: DAY_LABELS[day], hours: 'Closed' })
    }
  })
  return formatted
}

// ── Fleur-de-lis rating (townie reviews) ─────────────────────────────
const FLEUR_BG = '#0055A4' // St. Louis flag blue
const FLEUR_EMPTY_BG = '#2a2a35'

function FleurRating({ rating, size = 'sm', count }) {
  const full = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.25
  const fleurSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-4xl' : 'text-xl'

  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`${rating} out of 5`}>
      <div className="flex gap-0.5">
        {[0, 1, 2, 3, 4].map(i => {
          const isFull = i < full
          const isHalf = i === full && hasHalf
          return (
            <span key={i} className={`${fleurSize} leading-none relative inline-block`}>
              {/* Base: silver/inactive fleur */}
              <span style={{ filter: 'grayscale(1)', opacity: isFull ? 0 : 0.2 }}>⚜️</span>
              {/* Overlay: full-color fleur, clipped for half */}
              {(isFull || isHalf) && (
                <span className="absolute inset-0" style={{ clipPath: isHalf ? 'inset(0 50% 0 0)' : undefined }}>⚜️</span>
              )}
            </span>
          )
        })}
      </div>
      {count != null && <span className="text-caption text-on-surface-subtle">({count})</span>}
    </div>
  )
}

// ── Google star rating (static, imported) ────────────────────────────
function StarRating({ rating, size = 'sm' }) {
  const stars = []
  const fullStars = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.25
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <svg key={i} className={`${sizeClass} text-yellow-400 fill-current`} viewBox="0 0 20 20">
          <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
        </svg>
      )
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <svg key={i} className={`${sizeClass} text-yellow-400`} viewBox="0 0 20 20">
          <defs>
            <linearGradient id={`half-star-${i}`}>
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="#4a4a4a" />
            </linearGradient>
          </defs>
          <path fill={`url(#half-star-${i})`} d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
        </svg>
      )
    } else {
      stars.push(
        <svg key={i} className={`${sizeClass} text-gray-600 fill-current`} viewBox="0 0 20 20">
          <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
        </svg>
      )
    }
  }

  return <div className="flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>{stars}</div>
}

function getEraLabel(year) {
  if (!year) return null
  if (year < 1840) return 'Antebellum'
  if (year <= 1865) return 'Civil War Era'
  if (year <= 1900) return 'Victorian Era'
  if (year <= 1919) return 'Progressive Era'
  if (year <= 1945) return 'Interwar Period'
  if (year <= 1969) return 'Mid-Century'
  return 'Modern'
}

function getPlaceholderPhotos(category) {
  const colors = {
    dining: ['#4a2d1a', '#3d1e0f'],
    historic: ['#2a3f5f', '#1e3a5f'],
    arts: ['#4a2d4a', '#3d1e3d'],
    shopping: ['#4a4a2d', '#3d3d1e'],
    services: ['#3d4a4a', '#2d3d3d'],
    community: ['#4a3d2d', '#3d2d1e'],
    parks: ['#2d4a2d', '#1e3d1e'],
  }
  return colors[category] || ['#3a3a3a', '#2a2a2a']
}

function getStyleGradient(styleGroup) {
  const gradients = {
    italianate: ['#5a2e1a', '#3d1a0a'],
    mansard: ['#2e3a4f', '#1a2840'],
    revival: ['#4a1e2e', '#331428'],
    craftsman: ['#1e3a22', '#142818'],
    modernistic: ['#3a3a40', '#28282e'],
  }
  return gradients[styleGroup] || ['#2a2a30', '#1a1a20']
}

function cleanAddress(addr) {
  if (!addr) return null
  return addr.replace(/\s+/g, ' ').trim()
}

// ─── Editable field wrapper (guardian inline editing) ────────────────
// ─── Shared edit context for unified Save/Cancel ─────────────────────
const EditContext = React.createContext(null)

function EditProvider({ listingId, children }) {
  const [edits, setEdits] = useState({})  // { field: newValue }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const hasEdits = Object.keys(edits).length > 0

  const setField = useCallback((field, value) => {
    setEdits(prev => ({ ...prev, [field]: value }))
    setError(null)
  }, [])

  const clearField = useCallback((field) => {
    setEdits(prev => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const saveAll = useCallback(async () => {
    if (!hasEdits) return
    setSaving(true)
    setError(null)
    try {
      const dh = await getDeviceHash()
      const res = await apiUpdateListing(dh, listingId, edits)
      if (res?.data?.error || res?.error) {
        setError(res?.data?.message || res?.message || 'Save failed')
        setSaving(false)
        return
      }
      useListings.getState().updateListing(listingId, edits)
      setEdits({})
    } catch (err) {
      console.error('Save failed:', err)
      setError('Could not reach server')
    }
    setSaving(false)
  }, [edits, hasEdits, listingId])

  const cancelAll = useCallback(() => { setEdits({}); setError(null) }, [])

  return (
    <EditContext.Provider value={{ edits, setField, clearField, saveAll, cancelAll, saving, hasEdits }}>
      {children}
      {(hasEdits || error) && (
        <div className="sticky bottom-0 bg-surface-dim backdrop-blur-sm border-t border-outline-variant px-4 py-2 flex items-center justify-end gap-3 z-10">
          {error && <span className="text-red-400 text-body-sm mr-auto">{error}</span>}
          <button onClick={cancelAll} disabled={saving} className="text-body-sm text-on-surface-subtle hover:text-on-surface-variant">
            Cancel
          </button>
          <button onClick={saveAll} disabled={saving} className="text-body-sm text-emerald-400 hover:text-emerald-300 disabled:opacity-50 bg-emerald-500/15 rounded-lg px-3 py-1 font-medium">
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      )}
    </EditContext.Provider>
  )
}

function EditableField({ value, field, isGuardian, placeholder, multiline, children }) {
  const ctx = useContext(EditContext)
  const [editing, setEditing] = useState(false)
  const pendingValue = ctx?.edits[field]
  const displayValue = pendingValue !== undefined ? pendingValue : (value || '')

  if (!isGuardian || !ctx) return children || <span>{value}</span>

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { ctx.clearField(field); setEditing(false) }
  }

  if (editing) {
    const cls = "w-full bg-surface-container border border-outline rounded px-2 py-1 text-body text-on-surface focus:outline-none focus:border-outline"
    return multiline ? (
      <textarea
        value={displayValue}
        onChange={e => ctx.setField(field, e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={handleKeyDown}
        autoFocus
        rows={3}
        className={cls + " resize-none"}
      />
    ) : (
      <input
        value={displayValue}
        onChange={e => ctx.setField(field, e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={handleKeyDown}
        autoFocus
        className={cls}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="cursor-pointer hover:bg-surface-container rounded px-0.5 -mx-0.5 transition-colors"
      title="Click to edit"
    >
      {displayValue || <em className="text-on-surface-disabled">{placeholder || `Add ${field}...`}</em>}
    </span>
  )
}

// ─── Listing logo (with initials fallback + guardian upload) ──────────
function getInitials(name) {
  if (!name) return '?'
  const words = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function nameToColor(name) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 35%, 30%)`
}

function ListingLogo({ listing, isGuardian }) {
  const ctx = useContext(EditContext)
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const logo = listing?.logo
  const name = listing?.name || ''

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !listing?.id) return
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      if (!compressed) { setUploading(false); return }
      const dh = await getDeviceHash()
      const res = await apiUploadPhoto(dh, listing.id, compressed.base64)
      if (res.data?.success && res.data?.url) {
        ctx?.setField('logo', res.data.url)
      }
    } finally {
      setUploading(false)
    }
  }

  const content = logo ? (
    <img
      src={assetUrl(logo)}
      alt=""
      className="w-full max-h-16 object-contain object-left"
    />
  ) : (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white/80 font-semibold text-sm select-none"
      style={{ backgroundColor: nameToColor(name) }}
    >
      {getInitials(name)}
    </div>
  )

  if (!isGuardian || !ctx) return <div className="flex-shrink-0 mt-0.5">{content}</div>

  return (
    <div className="flex-shrink-0 mt-0.5 relative">
      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      <button
        onClick={() => fileRef.current?.click()}
        className="relative group"
        title="Change logo"
        disabled={uploading}
      >
        {content}
        <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? (
            <span className="text-white text-caption">...</span>
          ) : (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          )}
        </div>
      </button>
    </div>
  )
}

// ─── Hours editor (guardian inline editing) ───────────────────────────
function HoursEditor({ hours, listingId }) {
  const ctx = useContext(EditContext)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => {
    const d = {}
    DAY_NAMES.forEach(day => {
      d[day] = hours?.[day]
        ? { enabled: true, open: hours[day].open, close: hours[day].close }
        : { enabled: false, open: '09:00', close: '17:00' }
    })
    return d
  })

  // Push draft changes into EditContext whenever draft changes while editing
  useEffect(() => {
    if (!editing || !ctx) return
    const result = {}
    DAY_NAMES.forEach(day => {
      if (draft[day].enabled) {
        result[day] = { open: draft[day].open, close: draft[day].close }
      }
    })
    ctx.setField('hours', result)
  }, [draft, editing])

  const stopEditing = () => {
    setEditing(false)
    if (ctx) ctx.clearField('hours')
    // Reset draft to match current hours
    const d = {}
    DAY_NAMES.forEach(day => {
      d[day] = hours?.[day]
        ? { enabled: true, open: hours[day].open, close: hours[day].close }
        : { enabled: false, open: '09:00', close: '17:00' }
    })
    setDraft(d)
  }

  const openStatus = useMemo(() => getOpenStatus(hours), [hours])
  const formattedHours = useMemo(() => formatHoursDisplay(hours), [hours])

  if (!editing) {
    return (
      <div className="group/hours">
        {formattedHours ? (
          <details className="group">
            <summary className="cursor-pointer text-body text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2">
              <svg className="w-4 h-4 text-on-surface-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={openStatus.isOpen ? 'text-green-400' : openStatus.isOpen === false ? 'text-red-400' : ''}>
                {openStatus.text}
              </span>
              <svg className={`w-3 h-3 transform group-open:rotate-180 transition-transform ml-1 ${openStatus.isOpen ? 'text-green-400' : openStatus.isOpen === false ? 'text-red-400' : 'text-on-surface-disabled'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true) }}
                className="text-on-surface-disabled text-caption opacity-0 group-hover/hours:opacity-100 transition-opacity hover:text-on-surface-subtle"
              >edit</button>
            </summary>
            <div className="mt-2 ml-6 space-y-1">
              {formattedHours.map(({ day, hours: h }) => (
                <div key={day} className="flex justify-between text-body-sm">
                  <span className="text-on-surface-subtle">{day}</span>
                  <span className={h === 'Closed' ? 'text-on-surface-disabled' : 'text-on-surface-variant'}>{h}</span>
                </div>
              ))}
            </div>
          </details>
        ) : (
          <div
            onClick={() => setEditing(true)}
            className="cursor-pointer flex items-center gap-2 text-body text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <svg className="w-4 h-4 text-on-surface-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <em className="text-on-surface-disabled">Add hours...</em>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-body-sm text-on-surface-subtle font-medium">Hours</span>
        <button onClick={stopEditing} className="text-caption text-on-surface-subtle hover:text-on-surface-variant">Done</button>
      </div>
      <div className="space-y-1">
        {DAY_NAMES.map(day => (
          <div key={day} className="flex items-center gap-2 text-body-sm">
            <span className="w-10 flex-shrink-0 text-on-surface-subtle">{DAY_LABELS[day]}</span>
            <button
              type="button"
              onClick={() => setDraft(d => ({ ...d, [day]: { ...d[day], enabled: !d[day].enabled } }))}
              className={`w-10 h-5 rounded-full transition-colors relative ${draft[day].enabled ? 'bg-emerald-500/30' : 'bg-surface-container-high'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${draft[day].enabled ? 'left-5 bg-emerald-400' : 'left-0.5 bg-on-surface-disabled'}`} />
            </button>
            {draft[day].enabled ? (
              <>
                <input
                  type="time"
                  value={draft[day].open}
                  onChange={e => setDraft(d => ({ ...d, [day]: { ...d[day], open: e.target.value } }))}
                  className="bg-surface-container border border-outline-variant rounded px-1.5 py-0.5 text-on-surface text-body-sm min-w-0 flex-1 focus:outline-none focus:border-outline [color-scheme:dark]"
                />
                <span className="text-on-surface-disabled flex-shrink-0">&ndash;</span>
                <input
                  type="time"
                  value={draft[day].close}
                  onChange={e => setDraft(d => ({ ...d, [day]: { ...d[day], close: e.target.value } }))}
                  className="bg-surface-container border border-outline-variant rounded px-1.5 py-0.5 text-on-surface text-body-sm min-w-0 flex-1 focus:outline-none focus:border-outline [color-scheme:dark]"
                />
              </>
            ) : (
              <span className="text-on-surface-disabled text-body-sm">Closed</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Service Toggles (delivery/takeout — guardian only) ───────────────

function ServiceToggles({ listing }) {
  const editCtx = useContext(EditContext)
  const tags = listing?.tags || []
  const hasTakeout = tags.includes('takeout')
  const hasDelivery = tags.includes('delivery')

  const toggle = (tagId) => {
    const current = [...tags]
    const idx = current.indexOf(tagId)
    if (idx >= 0) current.splice(idx, 1)
    else current.push(tagId)
    editCtx?.setField('tags', current)
    // Optimistic update
    useListings.getState().updateListing(listing.id, { tags: current })
  }

  return (
    <div className="flex gap-2 mt-1">
      <button
        onClick={() => toggle('takeout')}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-body-sm font-medium transition-all ${
          hasTakeout
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            : 'bg-surface-container-high border-outline-variant text-on-surface-disabled hover:text-on-surface-variant'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        Takeout
        {hasTakeout && <span className="text-emerald-400">On</span>}
      </button>
      <button
        onClick={() => toggle('delivery')}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-body-sm font-medium transition-all ${
          hasDelivery
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            : 'bg-surface-container-high border-outline-variant text-on-surface-disabled hover:text-on-surface-variant'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21M3.375 14.25h.008M21 12.75V7.5a.75.75 0 00-.75-.75h-4.5m0 0V3.75a.75.75 0 00-.75-.75h-6a.75.75 0 00-.75.75V6.75m7.5 0h-7.5" />
        </svg>
        Delivery
        {hasDelivery && <span className="text-emerald-400">On</span>}
      </button>
    </div>
  )
}

// ─── Tag Picker (guardian tag management) ─────────────────────────────
function TagPicker({ listing, isGuardian }) {
  const [editing, setEditing] = useState(false)
  const tags = listing?.tags || []
  const listingId = listing?.id
  const category = listing?.category

  // Derive current state from tags
  const currentSubcatId = tags.find(t => SUBCATEGORY_TAG_IDS.has(t)) || null
  const currentFeatures = tags.filter(t => TAG_BY_ID[t]?.level === 'feature')
  const currentAmenities = tags.filter(t => TAG_BY_ID[t]?.level === 'amenity')

  const [selectedSubcat, setSelectedSubcat] = useState(currentSubcatId || listing?.subcategory || null)
  const [selectedFeatures, setSelectedFeatures] = useState(new Set(currentFeatures))
  const [selectedAmenities, setSelectedAmenities] = useState(new Set(currentAmenities))
  const [saving, setSaving] = useState(false)

  const toggleFeature = (id) => setSelectedFeatures(s => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAmenity = (id) => setSelectedAmenities(s => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const save = async () => {
    setSaving(true)
    try {
      const allTags = [
        ...(selectedSubcat ? [selectedSubcat] : []),
        ...selectedFeatures,
        ...selectedAmenities,
      ]
      const derivedCategory = selectedSubcat ? primaryTagToCategory(selectedSubcat) : category
      const dh = await getDeviceHash()
      await apiUpdateListing(dh, listingId, {
        tags: allTags,
        category: derivedCategory,
        subcategory: selectedSubcat,
      })
      useListings.getState().updateListing(listingId, {
        tags: allTags,
        category: derivedCategory,
        subcategory: selectedSubcat,
      })
    } catch { /* silent */ }
    setSaving(false)
    setEditing(false)
  }

  // Display mode: show active tags as pills
  if (!editing) {
    const displayTags = tags.filter(t => TAG_BY_ID[t] && !SUBCATEGORY_TAG_IDS.has(t))
    const fallbackAmenities = (!tags.length && listing?.amenities) ? listing.amenities : null

    return (
      <div className="mt-2">
        <div className="flex flex-wrap gap-1.5">
          {displayTags.map(t => (
            <span key={t} className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-caption">
              {TAG_BY_ID[t].label}
            </span>
          ))}
          {fallbackAmenities && fallbackAmenities.map((a, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-caption">{a}</span>
          ))}
          {isGuardian && (
            <button
              onClick={() => setEditing(true)}
              className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-disabled text-caption hover:text-on-surface-subtle hover:bg-surface-container-high transition-colors"
            >
              {displayTags.length || fallbackAmenities?.length ? 'edit tags' : '+ add tags'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Edit mode: grouped tag sections
  const catGroup = primaryTagToCategory(selectedSubcat) || category
  const featureTags = catGroup ? (TAGS_BY_GROUP[catGroup] || []).filter(t => t.level === 'feature') : []
  const amenityTagsList = TAGS_BY_GROUP['amenities'] || []

  // Group subcategory tags by parent category for the type selector
  const subcatsByCategory = {}
  for (const [catId, group] of Object.entries(TAGS_BY_GROUP)) {
    if (catId === 'amenities') continue
    const subs = group.filter(t => t.level === 'subcategory')
    if (subs.length) subcatsByCategory[catId] = subs
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-body-sm text-on-surface-subtle font-medium">Tags</span>
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="text-caption text-on-surface-subtle hover:text-on-surface-variant">Cancel</button>
          <button onClick={save} disabled={saving} className="text-caption text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Type (subcategory) — single select */}
      <div>
        <span className="text-caption text-on-surface-subtle uppercase tracking-wider">Type</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(subcatsByCategory).map(([catId, subs]) =>
            subs.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedSubcat(t.id === selectedSubcat ? null : t.id)}
                className={`px-2 py-0.5 rounded text-caption transition-colors ${
                  t.id === selectedSubcat
                    ? 'bg-surface-container-highest text-on-surface'
                    : 'bg-surface-container text-on-surface-subtle hover:text-on-surface-variant'
                }`}
              >
                {t.label}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Features — multi-select, filtered to category */}
      {featureTags.length > 0 && (
        <div>
          <span className="text-caption text-on-surface-subtle uppercase tracking-wider">Features</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {featureTags.map(t => (
              <button
                key={t.id}
                onClick={() => toggleFeature(t.id)}
                className={`px-2 py-0.5 rounded text-caption transition-colors ${
                  selectedFeatures.has(t.id)
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-surface-container text-on-surface-subtle hover:text-on-surface-variant'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Amenities — multi-select, always shown */}
      <div>
        <span className="text-caption text-on-surface-subtle uppercase tracking-wider">Amenities</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {amenityTagsList.map(t => (
            <button
              key={t.id}
              onClick={() => toggleAmenity(t.id)}
              className={`px-2 py-0.5 rounded text-caption transition-colors ${
                selectedAmenities.has(t.id)
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-surface-container text-on-surface-subtle hover:text-on-surface-variant'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Detail row helper ───────────────────────────────────────────────
function DetailRow({ label, children }) {
  return (
    <div className="flex justify-between text-body-sm">
      <span className="text-on-surface-subtle">{label}</span>
      <span className="text-on-surface-variant text-right">{children}</span>
    </div>
  )
}

// ─── Tab: Overview ───────────────────────────────────────────────────
function OverviewTab({ listing, building, isGuardian, isResidential }) {
  const address = listing?.address || building?.address || null
  const phone = listing?.phone || null
  const website = listing?.website || null
  const hours = listing?.hours || null
  const rentRange = building?.rent_range || null
  const tags = listing?.tags || []
  const listingId = listing?.id

  const openStatus = useMemo(() => getOpenStatus(hours), [hours])
  const formattedHours = useMemo(() => formatHoursDisplay(hours), [hours])

  // Public-facing tags (exclude subcategory-level tags which are shown as chips in the header)
  const displayTags = tags.filter(t => TAG_BY_ID[t] && TAG_BY_ID[t].level !== 'subcategory').map(t => TAG_BY_ID[t])

  return (
    <div className="space-y-2.5">
      {/* Tags — at top */}
      {isGuardian ? (
        <TagPicker listing={listing} isGuardian={isGuardian} />
      ) : displayTags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {displayTags.map(t => (
            <span key={t.id} className="px-2 py-0.5 rounded text-caption bg-surface-container-high text-on-surface-subtle">
              {t.label}
            </span>
          ))}
        </div>
      ) : null}

      {/* Reservation link — at top */}
      {!isResidential && listing?.reservation_url && !isGuardian && (
        <a href={listing.reservation_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-body-sm text-on-surface-variant hover:text-on-surface transition-colors">
          <svg className="w-3.5 h-3.5 text-on-surface-disabled flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          Make a reservation
        </a>
      )}
      {isGuardian && !isResidential && (
        <div className="space-y-1">
          <EditableField value={listing?.reservation_url || ''} field="reservation_url" isGuardian placeholder="Add reservations link...">
            <div className="flex items-center gap-2 text-body-sm text-on-surface-subtle">
              <svg className="w-3.5 h-3.5 text-on-surface-disabled flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              {listing?.reservation_url ? 'Reservations' : <span className="italic text-on-surface-disabled">+ Reservations link</span>}
            </div>
          </EditableField>
        </div>
      )}

      {/* Compact contact rows — icon + value */}
      <div className="space-y-1">
        {(address || (isGuardian)) && (
          <div className="flex items-center gap-2 text-body-sm">
            <svg className="w-3.5 h-3.5 text-on-surface-disabled flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            {isGuardian ? (
              <EditableField value={address} field="address" isGuardian placeholder="Add address..." />
            ) : (
              <span className="text-on-surface-variant">{address}</span>
            )}
          </div>
        )}
        {(phone || isGuardian) && (
          <div className="flex items-center gap-2 text-body-sm">
            <svg className="w-3.5 h-3.5 text-on-surface-disabled flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            {isGuardian ? (
              <EditableField value={phone} field="phone" isGuardian placeholder="Add phone..." />
            ) : (
              <a href={`tel:${phone}`} className="text-on-surface-variant hover:text-on-surface transition-colors">{phone}</a>
            )}
          </div>
        )}
        {(website || isGuardian) && (
          <div className="flex items-center gap-2 text-body-sm">
            <svg className="w-3.5 h-3.5 text-on-surface-disabled flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
            {isGuardian ? (
              <EditableField value={website} field="website" isGuardian placeholder="Add website..." />
            ) : (
              <a href={website} target="_blank" rel="noopener noreferrer" className="text-on-surface-variant hover:text-on-surface transition-colors truncate">{website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
            )}
          </div>
        )}
        {rentRange && (
          <div className="flex items-center gap-2 text-body-sm">
            <svg className="w-3.5 h-3.5 text-on-surface-disabled flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-on-surface-variant">{rentRange}</span>
          </div>
        )}
      </div>

      {/* Hours — compact inline with expandable detail */}
      {!isResidential && (isGuardian ? (
        <HoursEditor hours={hours} listingId={listingId} />
      ) : formattedHours ? (
        <details className="group">
          <summary className="cursor-pointer text-body-sm text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-on-surface-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className={openStatus.isOpen ? 'text-green-400' : openStatus.isOpen === false ? 'text-red-400/80' : 'text-on-surface-variant'}>
              {openStatus.text}
            </span>
            <svg className={`w-3 h-3 transform group-open:rotate-180 transition-transform ml-1 ${openStatus.isOpen ? 'text-green-400' : openStatus.isOpen === false ? 'text-red-400/80' : 'text-on-surface-disabled'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="mt-1.5 ml-[22px] space-y-0.5">
            {formattedHours.map(({ day, hours }) => (
              <div key={day} className="flex justify-between text-caption">
                <span className="text-on-surface-disabled">{day}</span>
                <span className={hours === 'Closed' ? 'text-on-surface-disabled' : 'text-on-surface-subtle'}>{hours}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null)}

      {/* Description */}
      {(listing?.description || isGuardian) && (
        isGuardian ? (
          <EditableField value={listing?.description || ''} field="description" isGuardian placeholder="Add description..." multiline>
            {listing?.description ? (
              <p className="text-body-sm text-on-surface-variant leading-relaxed">{listing.description}</p>
            ) : (
              <p className="text-body-sm text-on-surface-disabled italic">Add description...</p>
            )}
          </EditableField>
        ) : listing?.description ? (
          <p className="text-body-sm text-on-surface-variant leading-relaxed">{listing.description}</p>
        ) : null
      )}

    </div>
  )
}

// ─── Interactive star picker ─────────────────────────────────────────
const FLEUR_LABELS = { 0.5: 'Poor', 1: 'Poor', 1.5: 'Fair', 2: 'Fair', 2.5: 'Okay', 3: 'Okay', 3.5: 'Good', 4: 'Great', 4.5: 'Amazing', 5: 'Amazing' }

function FleurPicker({ value, onChange }) {
  const [hover, setHover] = useState(0)
  const active = hover || value

  return (
    <div className="flex items-center gap-2">
      <div className="flex">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="relative cursor-pointer select-none">
            {/* Left half = half rating */}
            <div
              className="absolute inset-y-0 left-0 w-1/2 z-10"
              onMouseEnter={() => setHover(i - 0.5)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onChange(i - 0.5)}
            />
            {/* Right half = full rating */}
            <div
              className="absolute inset-y-0 right-0 w-1/2 z-10"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onChange(i)}
            />
            <span className="text-2xl leading-none transition-all relative inline-block">
              {/* Base: silver/inactive fleur */}
              <span style={{ filter: 'grayscale(1)', opacity: active >= i ? 0 : 0.2 }}>⚜️</span>
              {/* Overlay: full-color, clipped to left half for half-ratings */}
              {(active >= i - 0.5) && (
                <span className="absolute inset-0" style={{ clipPath: active >= i ? undefined : 'inset(0 50% 0 0)' }}>⚜️</span>
              )}
            </span>
          </div>
        ))}
      </div>
      <span className="text-body-sm text-on-surface-subtle min-w-[3.5rem]">
        {active ? FLEUR_LABELS[active] || '' : 'Tap to rate'}
      </span>
    </div>
  )
}

// ─── Rating summary bar ─────────────────────────────────────────────
function RatingSummary({ rating, reviewCount, distribution }) {
  if (!reviewCount) return null
  const maxCount = Math.max(...Object.values(distribution), 1)
  return (
    <div className="flex gap-4 mb-4 pb-4 border-b border-outline-variant">
      <div className="flex flex-col items-center justify-center min-w-[4.5rem]">
        <span className="text-3xl font-semibold text-on-surface leading-none">{rating.toFixed(1)}</span>
        <FleurRating rating={rating} size="sm" />
        <span className="text-caption text-on-surface-subtle mt-1">{reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}</span>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-0.5">
        {[5, 4, 3, 2, 1].map(star => {
          const count = distribution[star] || 0
          const pct = (count / maxCount) * 100
          return (
            <div key={star} className="flex items-center gap-2">
              <span className="text-caption text-on-surface-subtle w-2 text-right">{star}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: FLEUR_BG }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Review form (shown to all non-guardians) ──────────────────────────────
const MAX_REVIEW_CHARS = 500

function ReviewForm({ listingId, onSubmitted, hasExisting, anonymous }) {
  const [text, setText] = useState('')
  const [rating, setRating] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [gateMessage, setGateMessage] = useState(null)
  const [success, setSuccess] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoData, setPhotoData] = useState(null)
  const fileRef = useRef(null)
  const handle = useHandle(s => s.handle)
  const avatar = useHandle(s => s.avatar)
  const vignette = useHandle(s => s.vignette)

  const charPct = text.length / MAX_REVIEW_CHARS

  const handlePhoto = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await compressImage(file)
    if (result) { setPhotoPreview(result.base64); setPhotoData(result.base64) }
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const clearPhoto = useCallback(() => { setPhotoPreview(null); setPhotoData(null) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (rating === 0) return
    setSubmitting(true)
    setGateMessage(null)
    try {
      const dh = await getDeviceHash()
      const res = await postReview(dh, listingId, text.trim().slice(0, MAX_REVIEW_CHARS), rating || null, handle, avatar, vignette, photoData)
      if (res?.data?.status === 'not_townie' || res?.status === 'not_townie') {
        setGateMessage(res?.data?.message || 'Become a Townie to post reviews \u2014 visit 3 local spots within 14 days by scanning their QR codes.')
      } else {
        setText('')
        setRating(0)
        clearPhoto()
        setSuccess(true)
        onSubmitted()
        setTimeout(() => setSuccess(false), 3000)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="border-b border-outline-variant pb-4 mb-4 text-center py-4">
        <span className="text-lg">&#10024;</span>
        <p className="text-on-surface-medium text-body font-medium mt-1">{anonymous ? 'Posted!' : 'Thanks for your review!'}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-b border-outline-variant pb-4 mb-4">
      <div className="flex items-center gap-2.5">
        <AvatarCircle emoji={avatar} vignette={vignette} size={9} fallback={handle ? handle[0].toUpperCase() : '?'} />
        <div>
          <p className="text-on-surface-medium text-body-sm font-medium">{handle ? `@${handle}` : 'Anonymous'}</p>
          {anonymous && <p className="text-caption text-on-surface-disabled">Visible to others as Resident</p>}
        </div>
      </div>
      <FleurPicker value={rating} onChange={setRating} />
      <div className="relative">
        <textarea
          value={text}
          onChange={e => { if (e.target.value.length <= MAX_REVIEW_CHARS) setText(e.target.value) }}
          placeholder={anonymous ? 'Post to the community...' : 'Write a review...'}
          rows={3}
          className="input w-full resize-none"
        />
        {text.length > 0 && (
          <span className={`absolute bottom-2 right-2 text-caption ${charPct >= 0.9 ? 'text-amber-400' : 'text-on-surface-disabled'}`}>
            {text.length}/{MAX_REVIEW_CHARS}
          </span>
        )}
      </div>
      {photoPreview && (
        <div className="relative inline-block">
          <img src={photoPreview} alt="Upload preview" className="rounded-lg max-h-32" />
          <button type="button" onClick={clearPhoto} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-container border border-outline-variant text-on-surface-disabled hover:text-on-surface-variant text-xs flex items-center justify-center">&times;</button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="px-2 py-1 rounded-lg text-on-surface-disabled hover:text-on-surface-variant hover:bg-surface-container-high transition-colors"
          title="Add photo"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21zM8.25 8.625a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0z" />
          </svg>
        </button>
      </div>
      {gateMessage && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <p className="text-amber-300/90 text-xs leading-relaxed">{gateMessage}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={submitting || rating === 0}
        className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {submitting ? 'Posting...' : 'Post'}
      </button>
      {!anonymous && (
        <p className="text-caption text-on-surface-disabled leading-relaxed">
          Become a Townie to rate and review — visit 3 local spots within 14 days by scanning their QR codes.
        </p>
      )}
    </form>
  )
}

// ─── Reply form (guardians only) ────────────────────────────────────────────
function ReplyForm({ reviewId, listingId, onSubmitted }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    try {
      const dh = await getDeviceHash()
      await postReply(dh, reviewId, listingId, text.trim())
      setText('')
      setOpen(false)
      onSubmitted()
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 ml-10 text-body-sm text-emerald-400/80 hover:text-emerald-400 transition-colors"
      >
        Reply
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-2 ml-10 pl-3 border-l-2 border-emerald-500/20">
      <input
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Reply as guardian..."
        className="input flex-1 py-1.5"
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setText('') } }}
      />
      <button
        type="submit"
        disabled={submitting || !text.trim()}
        className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-body-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {submitting ? '...' : 'Reply'}
      </button>
    </form>
  )
}

// ─── Tab: Reviews ────────────────────────────────────────────────────
function ReviewsTab({ listingId, isGuardian, anonymous }) {
  const [reviews, setReviews] = useState([])
  const [stats, setStats] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const updateListing = useListings(s => s.updateListing)
  const listing = useListings(s => s.listings.find(l => l.id === listingId))

  const fetchReviews = useCallback(async () => {
    try {
      const res = await getReviews(listingId)
      const data = res.data
      if (Array.isArray(data)) {
        setReviews(data)
      } else {
        setReviews(data?.reviews || [])
        if (data?.review_count != null) {
          setStats({ rating: data.rating, review_count: data.review_count, distribution: data.distribution })
          updateListing(listingId, { townie_rating: data.rating, townie_review_count: data.review_count })
        }
      }
    } catch { /* silent */ }
    setLoaded(true)
  }, [listingId, updateListing])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  function relativeTime(iso) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return `${Math.floor(days / 7)}w ago`
  }

  const handle = useHandle(s => s.handle)
  const hasExisting = reviews.some(r => r.handle && r.handle === handle)

  return (
    <div>
      {(!isGuardian || anonymous) && <ReviewForm listingId={listingId} onSubmitted={fetchReviews} hasExisting={hasExisting} anonymous={anonymous} />}

      {reviews.length === 0 && loaded && (
        <div className="text-center py-6">
          <p className="text-on-surface-disabled text-body-sm">No posts yet. Be the first to share.</p>
        </div>
      )}

      <div className="space-y-3">
        {reviews.map((review, idx) => {
          const isMine = anonymous && handle && review.handle === handle
          const hideIdentity = anonymous && !isMine
          const displayName = hideIdentity ? 'Resident' : (review.handle ? `@${review.handle}` : 'Local')
          const replies = review.replies || []
          const hasText = review.text && review.text.trim()

          // Rating-only: compact single row
          if (!hasText) {
            return (
              <div key={review.id || idx} className="border-b border-outline-variant pb-3 last:border-0">
                <div className="flex items-center gap-2.5">
                  <AvatarCircle emoji={hideIdentity ? null : review.avatar} vignette={hideIdentity ? null : review.vignette} size={7} fallback={hideIdentity ? 'R' : (review.handle ? review.handle[0].toUpperCase() : 'L')} />
                  <span className="text-body-sm font-medium text-on-surface">{displayName}</span>
                  {review.rating && <FleurRating rating={review.rating} size="sm" />}
                  <span className="text-caption text-on-surface-disabled ml-auto">{relativeTime(review.created_at || review.timestamp)}</span>
                </div>
              </div>
            )
          }

          // Full review with text
          return (
            <div key={review.id || idx} className="border-b border-outline-variant pb-4 last:border-0">
              <div className="flex items-start gap-3">
                <AvatarCircle emoji={hideIdentity ? null : review.avatar} vignette={hideIdentity ? null : review.vignette} size={9} fallback={hideIdentity ? 'R' : (review.handle ? review.handle[0].toUpperCase() : 'L')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-body font-medium text-on-surface">{displayName}</span>
                    <span className="text-caption text-on-surface-disabled">{relativeTime(review.created_at || review.timestamp)}</span>
                  </div>
                  {review.rating && (
                    <div className="mt-1"><FleurRating rating={review.rating} size="sm" /></div>
                  )}
                  <p className="text-body text-on-surface-medium leading-relaxed mt-1.5">{review.text}</p>
                </div>
              </div>

              {/* Guardian replies */}
              {replies.map((reply, ri) => {
                const isMyReply = handle && reply.handle === handle
                const hideReplyIdentity = anonymous && !isMyReply
                const guardianLogo = listing?.logo
                  ? (listing.logo.startsWith('http') ? listing.logo : `${BASE}${listing.logo.replace(/^\//, '')}`)
                  : null
                return (
                <div key={reply.id || ri} className="flex items-start gap-2.5 mt-3 ml-10 pl-3 border-l-2 border-emerald-500/30">
                  <div className="flex-shrink-0 relative">
                    {hideReplyIdentity && guardianLogo ? (
                      <img src={guardianLogo} alt="" className="w-5 h-5 rounded-full object-contain bg-white/5" />
                    ) : (
                      <AvatarCircle emoji={hideReplyIdentity ? null : reply.avatar} vignette={hideReplyIdentity ? null : reply.vignette} size={5} fallback="G" />
                    )}
                    {/* Guardian badge */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border border-surface flex items-center justify-center">
                      <svg className="w-1.5 h-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-body-sm font-medium text-emerald-400/90">{hideReplyIdentity ? (listing?.name || 'Guardian') : (reply.handle ? `@${reply.handle}` : 'Guardian')}</span>
                      <span className="text-caption text-on-surface-disabled">{relativeTime(reply.created_at)}</span>
                    </div>
                    <p className="text-body-sm text-on-surface-medium mt-0.5 leading-relaxed">{reply.text}</p>
                  </div>
                </div>
              )})}

              {isGuardian && <ReplyForm reviewId={review.id} listingId={listingId} onSubmitted={fetchReviews} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── History timeline (no description — that lives in Overview) ─────
function HistoryTimeline({ history }) {
  if (!history || !history.length) return null
  return (
    <div className="relative ml-3 border-l border-outline pl-4 space-y-4">
      {history.map((item, i) => (
        <div key={i} className="relative">
          <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-amber-500/70 border border-amber-400/50" />
          <div className="text-body-sm">
            <span className="text-amber-400/80 font-medium">{item.year}</span>
            <p className="text-on-surface-variant mt-0.5 leading-relaxed">{item.event}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Architecture ───────────────────────────────────────────────
function ArchitectureTab({ building }) {
  if (!building) return null
  const arch = building.architecture

  return (
    <div className="space-y-1.5">
      {building.year_built && (
        <DetailRow label="Year Built">
          {building.year_built}
          {building.year_renovated ? ` (renovated ${building.year_renovated})` : ''}
          {getEraLabel(building.year_built) ? ` \u00B7 ${getEraLabel(building.year_built)}` : ''}
        </DetailRow>
      )}
      {building.stories && (
        <DetailRow label="Stories">{building.stories} {building.stories === 1 ? 'story' : 'stories'}</DetailRow>
      )}
      {(building.style || arch?.style) && (
        <DetailRow label="Style">{arch?.style || building.style}</DetailRow>
      )}
      {building.architect && (
        <DetailRow label="Architect">{building.architect}</DetailRow>
      )}
      {building.units && (
        <DetailRow label="Units">{building.units}</DetailRow>
      )}
      {building.historic_status && (
        <div className="flex justify-between text-body-sm items-center">
          <span className="text-on-surface-subtle">Historic Status</span>
          <span className="bg-amber-500/20 text-amber-400 text-body-sm px-1.5 py-0.5 rounded">{building.historic_status}</span>
        </div>
      )}
      {arch?.district && (
        <DetailRow label="District">{arch.district}</DetailRow>
      )}
      {arch?.materials && (
        <div className="mt-2">
          <span className="text-on-surface-subtle text-body-sm">Materials</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {arch.materials.map((m, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-caption">{m}</span>
            ))}
          </div>
        </div>
      )}
      {arch?.features && (
        <div className="mt-2">
          <span className="text-on-surface-subtle text-body-sm">Features</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {arch.features.map((f, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-caption">{f}</span>
            ))}
          </div>
        </div>
      )}
      {arch?.renovation_cost && (
        <DetailRow label="Renovation Cost">{arch.renovation_cost}</DetailRow>
      )}

      {(building.assessed_value || building.building_sqft || building.lot_acres || building.zoning) && (
        <>
          <div className="border-t border-outline-variant mt-3 pt-2">
            <span className="text-on-surface-disabled text-caption uppercase tracking-wider">Assessment</span>
          </div>
          {building.assessed_value && (
            <DetailRow label="Assessed Value">${building.assessed_value.toLocaleString()}</DetailRow>
          )}
          {building.building_sqft && (
            <DetailRow label="Building Area">{building.building_sqft.toLocaleString()} sq ft</DetailRow>
          )}
          {building.lot_acres && (
            <DetailRow label="Lot Size">{building.lot_acres} acres</DetailRow>
          )}
          {building.zoning && (
            <DetailRow label="Zoning">{building.zoning}{ZONING_LABELS[building.zoning] ? ` \u2013 ${ZONING_LABELS[building.zoning]}` : ''}</DetailRow>
          )}
          {building.size && (
            <>
              <DetailRow label="Footprint">{building.size[0].toFixed(0)} x {building.size[2].toFixed(0)}m</DetailRow>
              <DetailRow label="Height">{building.size[1].toFixed(0)}m</DetailRow>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── Tab: Property (bare buildings only) ─────────────────────────────
function PropertyTab({ building, facadeInfo }) {
  if (!building) return null
  const arch = building.architecture || {}

  return (
    <div className="space-y-3">
      {/* Wikimedia architectural description — richest text we have */}
      {facadeInfo?.description && (
        <p className="text-on-surface text-body-sm leading-relaxed">
          {facadeInfo.description}
          <span className="text-on-surface-disabled text-caption ml-1">— Wikimedia Commons</span>
        </p>
      )}

      {/* NPS nomination context */}
      {arch.nps_context && !facadeInfo?.description && (
        <p className="text-on-surface-variant text-body-sm italic leading-relaxed">
          &ldquo;{arch.nps_context.trim()}&rdquo;
          <span className="text-on-surface-disabled ml-1 not-italic">&mdash; NPS Nomination</span>
        </p>
      )}

      {/* Key facts grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {arch.architect && <DetailRow label="Architect">{arch.architect}</DetailRow>}
        {arch.original_owner && <DetailRow label="Built For">{arch.original_owner}</DetailRow>}
        {arch.historic_name && <DetailRow label="Historic Name">{arch.historic_name}</DetailRow>}
        {building.stories && (
          <DetailRow label="Stories">{building.stories}</DetailRow>
        )}
        {arch.nps_style_period && <DetailRow label="Era">{arch.nps_style_period}</DetailRow>}
        {building.building_sqft && (
          <DetailRow label="Size">{building.building_sqft.toLocaleString()} sq ft</DetailRow>
        )}
        {building.assessed_value && (
          <DetailRow label="Assessed">${building.assessed_value.toLocaleString()}</DetailRow>
        )}
        {building.year_built && building.year_renovated && (
          <DetailRow label="Renovated">{building.year_renovated}</DetailRow>
        )}
        {arch.renovation_cost && <DetailRow label="Renovation">{arch.renovation_cost}</DetailRow>}
      </div>

      {/* NPS context shown below facts if we already showed Wikimedia above */}
      {arch.nps_context && facadeInfo?.description && (
        <p className="text-on-surface-variant text-body-sm italic leading-relaxed mt-1">
          &ldquo;{arch.nps_context.trim()}&rdquo;
          <span className="text-on-surface-disabled ml-1 not-italic">&mdash; NPS Nomination</span>
        </p>
      )}

      {arch.materials && (
        <div>
          <span className="text-on-surface-subtle text-body-sm">Materials</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {arch.materials.map((m, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-caption">{m}</span>
            ))}
          </div>
        </div>
      )}
      {arch.features && (
        <div>
          <span className="text-on-surface-subtle text-body-sm">Features</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {arch.features.map((f, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-caption">{f}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Photos ─────────────────────────────────────────────────────
// Photo entries can be strings ("/photos/foo.jpg") or objects ({ url, credit, credit_url })
function normalizePhoto(entry) {
  if (typeof entry === 'string') return { url: entry, credit: null, credit_url: null }
  return { url: entry.url, credit: entry.credit || null, credit_url: entry.credit_url || null }
}

function PhotoCredit({ credit, credit_url, className = '' }) {
  if (!credit) return null
  if (credit_url) {
    return (
      <a href={credit_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        className={`text-on-surface-subtle hover:text-on-surface-variant underline decoration-outline hover:decoration-outline transition-colors ${className}`}
      >{credit}</a>
    )
  }
  return <span className={`text-on-surface-subtle ${className}`}>{credit}</span>
}

function PhotosTab({ photos, facadeImage, facadeInfo, name, isGuardian, listingId }) {
  const rawPhotos = photos || (facadeImage ? [facadeImage.thumb_2048 || facadeImage.thumb_1024] : [])
  const allPhotos = rawPhotos.map(normalizePhoto)
  const [lightbox, setLightbox] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(null) // url being removed
  const [editingCredit, setEditingCredit] = useState(null) // { idx, credit, credit_url }
  const [savingCredit, setSavingCredit] = useState(false)
  const fileInputRef = React.useRef(null)

  const hasFacade = !!facadeInfo?.photo
  // Build combined list for lightbox navigation (includes facade at end)
  const lightboxEntries = [...allPhotos, ...(hasFacade ? [{ url: facadeInfo.photo, credit: 'w_lemay / Wikimedia Commons', credit_url: null }] : [])]
  const hasAny = lightboxEntries.length > 0 || hasFacade

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !listingId) return
    setUploading(true)
    try {
      const compressed = await compressImage(file)
      if (!compressed) { setUploading(false); return }
      const dh = await getDeviceHash()
      const res = await apiUploadPhoto(dh, listingId, compressed.base64)
      if (res.data?.success && res.data?.url) {
        // Optimistic update
        const currentPhotos = photos || []
        useListings.getState().updateListing(listingId, { photos: [...currentPhotos, res.data.url] })
      }
    } catch (err) { console.warn('Upload failed', err) }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemove = async (photoUrl) => {
    if (!listingId || removing) return
    setRemoving(photoUrl)
    try {
      const dh = await getDeviceHash()
      const res = await apiRemovePhoto(dh, listingId, photoUrl)
      if (res.data?.success) {
        const currentPhotos = (photos || []).filter(p => {
          const pUrl = typeof p === 'object' ? p.url : p
          return pUrl !== photoUrl
        })
        useListings.getState().updateListing(listingId, { photos: currentPhotos })
        if (lightbox !== null) closeLightbox()
      }
    } catch (err) { console.warn('Remove failed', err) }
    setRemoving(null)
  }

  const handleSaveCredit = async () => {
    if (!editingCredit || !listingId) return
    setSavingCredit(true)
    try {
      const currentPhotos = [...(photos || [])]
      const idx = editingCredit.idx
      if (idx >= 0 && idx < currentPhotos.length) {
        const entry = currentPhotos[idx]
        const url = typeof entry === 'string' ? entry : entry.url
        const credit = editingCredit.credit.trim()
        const credit_url = editingCredit.credit_url.trim()
        // Convert to object if adding credit, or back to string if removing
        currentPhotos[idx] = credit ? { url, credit, ...(credit_url ? { credit_url } : {}) } : url
        const dh = await getDeviceHash()
        await apiUpdateListing(dh, listingId, { photos: currentPhotos })
        useListings.getState().updateListing(listingId, { photos: currentPhotos })
      }
    } catch (err) { console.warn('Credit save failed', err) }
    setSavingCredit(false)
    setEditingCredit(null)
  }

  const openLightbox = (idx) => setLightbox(idx)
  const closeLightbox = () => setLightbox(null)
  const prev = () => setLightbox(i => (i > 0 ? i - 1 : lightboxEntries.length - 1))
  const next = () => setLightbox(i => (i < lightboxEntries.length - 1 ? i + 1 : 0))

  // Swipe support for lightbox
  const touchStart = React.useRef(null)
  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX }
  const handleTouchEnd = (e) => {
    if (touchStart.current === null) return
    const dx = e.changedTouches[0].clientX - touchStart.current
    touchStart.current = null
    if (Math.abs(dx) > 50) dx > 0 ? prev() : next()
  }

  // Keyboard navigation
  useEffect(() => {
    if (lightbox === null) return
    const handleKey = (e) => {
      if (e.key === 'Escape') closeLightbox()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightbox])

  // Merge facade into the gallery grid (at the end)
  const gridPhotos = [...allPhotos, ...(hasFacade ? [{ url: facadeInfo.photo, credit: 'w_lemay / Wikimedia Commons', credit_url: null, _isFacade: true }] : [])]
  const VISIBLE_LIMIT = 6

  return (
    <div className="space-y-3">
      {/* Gallery grid — 3 columns, restrained thumbnails */}
      {gridPhotos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {gridPhotos.slice(0, VISIBLE_LIMIT).map((photo, i) => {
            const isLast = i === VISIBLE_LIMIT - 1 && gridPhotos.length > VISIBLE_LIMIT
            const overflow = gridPhotos.length - VISIBLE_LIMIT
            return (
              <div key={i} className="relative group">
                <button onClick={() => openLightbox(i)} className="w-full relative rounded-lg overflow-hidden">
                  <img src={assetUrl(photo.url)} alt={`${name} ${i + 1}`} className="w-full aspect-[4/3] object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  {isLast && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-on-surface text-body font-medium">+{overflow}</span>
                    </div>
                  )}
                </button>
                {photo.credit && (
                  <p className="text-caption text-on-surface-disabled mt-0.5 truncate" title={photo.credit}>{photo.credit}</p>
                )}
                {isGuardian && !photo._isFacade && (
                  <button
                    onClick={() => handleRemove(photo.url)}
                    disabled={removing === photo.url}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-surface-dim text-on-surface-variant hover:bg-red-500/80 hover:text-on-surface flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Remove photo"
                  >
                    {removing === photo.url ? (
                      <div className="w-3 h-3 border border-on-surface-disabled border-t-on-surface rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Guardian: Add photo button */}
      {isGuardian && (
        <div className="mt-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-2.5 rounded-lg border border-dashed border-outline text-on-surface-subtle text-body-sm hover:border-outline hover:text-on-surface-variant transition-colors disabled:opacity-40"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-on-surface-disabled border-t-on-surface-variant rounded-full animate-spin" />
                Uploading...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add photo
              </span>
            )}
          </button>
        </div>
      )}

      {!hasAny && !isGuardian && (
        <div className="text-center py-8">
          <p className="text-on-surface-subtle text-body">No photos yet</p>
        </div>
      )}

      {!photos && !hasFacade && facadeImage && (
        <p className="text-on-surface-subtle text-body-sm text-center">Street view - Mapillary</p>
      )}

      {/* Lightbox overlay */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-[200] bg-surface flex items-center justify-center"
          onClick={closeLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <img
            src={assetUrl(lightboxEntries[lightbox]?.url)}
            alt={`${name} ${lightbox + 1}`}
            className="max-w-full max-h-[85vh] object-contain select-none"
            onClick={(e) => e.stopPropagation()}
          />
          {/* Counter */}
          <span className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-surface-dim text-on-surface-variant text-body-sm backdrop-blur-sm">
            {lightbox + 1} / {lightboxEntries.length}
          </span>
          {/* Credit at bottom */}
          {editingCredit && editingCredit.idx === lightbox ? (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-72 max-w-[90vw] p-3 rounded-xl bg-surface backdrop-blur-sm border border-outline space-y-2" onClick={e => e.stopPropagation()}>
              <input
                type="text" value={editingCredit.credit} placeholder="Credit (e.g. photographer name)"
                onChange={e => setEditingCredit({ ...editingCredit, credit: e.target.value })}
                className="input w-full"
                autoFocus
              />
              <input
                type="text" value={editingCredit.credit_url} placeholder="Link (optional)"
                onChange={e => setEditingCredit({ ...editingCredit, credit_url: e.target.value })}
                className="input w-full"
              />
              <div className="flex gap-2">
                <button onClick={handleSaveCredit} disabled={savingCredit} className="flex-1 py-1.5 rounded-lg text-body-sm font-medium bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40">
                  {savingCredit ? '...' : 'Save'}
                </button>
                <button onClick={() => setEditingCredit(null)} className="px-3 py-1.5 rounded-lg text-body-sm text-on-surface-subtle hover:text-on-surface-variant">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2" onClick={e => e.stopPropagation()}>
              {lightboxEntries[lightbox]?.credit ? (
                <div className="px-3 py-1.5 rounded-full bg-surface-dim text-body-sm backdrop-blur-sm flex items-center gap-2">
                  <PhotoCredit credit={lightboxEntries[lightbox].credit} credit_url={lightboxEntries[lightbox].credit_url} />
                  {isGuardian && lightbox < allPhotos.length && (
                    <button
                      onClick={() => setEditingCredit({ idx: lightbox, credit: lightboxEntries[lightbox].credit || '', credit_url: lightboxEntries[lightbox].credit_url || '' })}
                      className="text-on-surface-disabled hover:text-on-surface-variant transition-colors"
                      title="Edit credit"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                  )}
                </div>
              ) : isGuardian && lightbox < allPhotos.length ? (
                <button
                  onClick={() => setEditingCredit({ idx: lightbox, credit: '', credit_url: '' })}
                  className="px-3 py-1.5 rounded-full bg-surface-dim text-on-surface-disabled text-body-sm hover:text-on-surface-subtle backdrop-blur-sm transition-colors"
                >
                  + Add credit
                </button>
              ) : null}
            </div>
          )}
          {/* Close */}
          <button onClick={closeLightbox} aria-label="Close lightbox" className="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest flex items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          {/* Guardian: delete from lightbox */}
          {isGuardian && lightbox < allPhotos.length && (
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(lightboxEntries[lightbox]?.url) }}
              className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-red-500/20 text-red-300 text-xs hover:bg-red-500/30 transition-colors backdrop-blur-sm"
            >
              Remove photo
            </button>
          )}
          {/* Prev / Next */}
          {lightboxEntries.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); prev() }} aria-label="Previous photo" className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); next() }} aria-label="Next photo" className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest flex items-center justify-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Event form (guardians only) ─────────────────────────────────────
function EventForm({ listingId, onSubmitted }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [type, setType] = useState('event')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !startDate) return
    setSubmitting(true)
    try {
      const dh = await getDeviceHash()
      await postEvent(dh, listingId, title.trim(), description.trim(), startDate, endDate || startDate, type)
      setTitle('')
      setDescription('')
      setStartDate('')
      setEndDate('')
      setType('event')
      onSubmitted()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-b border-outline-variant pb-4 mb-4">
      <div className="flex gap-2">
        {['event', 'recurring', 'special', 'sale', 'partnership'].map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`px-2 py-0.5 rounded text-caption transition-colors ${type === t ? 'bg-surface-container-highest text-on-surface' : 'bg-surface-container text-on-surface-subtle hover:text-on-surface-variant'}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="What's happening? (e.g. Live jazz tonight)"
        className="input w-full"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="input w-full resize-none"
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-caption text-on-surface-subtle block mb-0.5">Start</label>
          <input
            type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="input w-full py-1.5 [color-scheme:dark]"
          />
        </div>
        <div className="flex-1">
          <label className="text-caption text-on-surface-subtle block mb-0.5">End</label>
          <input
            type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="input w-full py-1.5 [color-scheme:dark]"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting || !title.trim() || !startDate}
        className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {submitting ? 'Posting...' : 'Post to Ticker'}
      </button>
    </form>
  )
}

// ─── Tab: Ticker ─────────────────────────────────────────────────────
function EventsTab({ listingId, isGuardian }) {
  // Read from shared events store (populated by init) instead of separate fetch
  const events = useEvents((s) => s.getForListing(listingId))
  const loaded = useEvents((s) => s.fetched) || events.length > 0

  // Refresh callback for after posting a new event
  const fetchEvents = useCallback(async () => {
    try {
      const { getEvents } = await import('../lib/api')
      const res = await getEvents()
      const all = Array.isArray(res.data) ? res.data : res.data?.events || []
      useEvents.getState().setEvents(all)
    } catch { /* silent */ }
  }, [])

  function formatTime12(t) {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    const suffix = h >= 12 ? 'pm' : 'am'
    const hr = h === 0 ? 12 : h > 12 ? h - 12 : h
    return m === 0 ? `${hr}${suffix}` : `${hr}:${String(m).padStart(2, '0')}${suffix}`
  }

  const DOW_LABELS = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' }

  function formatEventSchedule(event) {
    // Recurring events: show schedule (e.g. "Thu 4–9pm" or "Daily 3–6pm")
    if (event.type === 'recurring') {
      const dayLabel = event.recurrence === 'daily' ? 'Daily' : (DOW_LABELS[event.day_of_week] || '')
      if (event.start_time && event.end_time) {
        return `${dayLabel} ${formatTime12(event.start_time)}\u2013${formatTime12(event.end_time)}`
      }
      return dayLabel
    }
    // One-off events: show date range
    const opts = { month: 'short', day: 'numeric' }
    const s = new Date(event.start_date + 'T12:00:00').toLocaleDateString('en-US', opts)
    if (!event.end_date || event.end_date === event.start_date) {
      if (event.start_time && event.end_time) return `${s} ${formatTime12(event.start_time)}\u2013${formatTime12(event.end_time)}`
      return s
    }
    const e = new Date(event.end_date + 'T12:00:00').toLocaleDateString('en-US', opts)
    return `${s} \u2013 ${e}`
  }

  const TYPE_COLORS = {
    event: 'bg-blue-500/15 text-blue-400',
    recurring: 'bg-teal-500/15 text-teal-400',
    special: 'bg-amber-500/15 text-amber-400',
    sale: 'bg-emerald-500/15 text-emerald-400',
    partnership: 'bg-purple-500/15 text-purple-400',
  }

  return (
    <div>
      {isGuardian && <EventForm listingId={listingId} onSubmitted={fetchEvents} />}

      {events.length === 0 && loaded && (
        <div className="text-center py-6">
          <p className="text-on-surface-subtle text-body">Nothing posted yet</p>
          {isGuardian && <p className="text-on-surface-disabled text-body-sm mt-1">Post to the ticker above!</p>}
        </div>
      )}

      <div className="space-y-3">
        {events.map((event, idx) => (
          <div key={event.id || idx} className="rounded-lg bg-surface-container border border-outline-variant p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="text-body font-medium text-on-surface">{event.title}</h4>
                {event.type && event.type !== 'event' && (
                  <span className={`text-caption px-1.5 py-0.5 rounded ${TYPE_COLORS[event.type] || ''}`}>
                    {event.type}
                  </span>
                )}
              </div>
              <span className="text-caption text-on-surface-subtle whitespace-nowrap flex-shrink-0">
                {formatEventSchedule(event)}
              </span>
            </div>
            {event.description && (
              <p className="text-body-sm text-on-surface-variant mt-1.5 leading-relaxed">
                {event.description.split(/(https?:\/\/\S+)/g).map((part, i) =>
                  /^https?:\/\//.test(part)
                    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">{part}</a>
                    : part
                )}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Cary Action Button (inline in PlaceCard) ────────────────────
function CaryButton({ placeName, placeId, buildingPosition, isResidential }) {
  const [tapped, setTapped] = useState(false)
  const label = isResidential ? 'Pick me up here' : `Deliver from ${placeName}`
  const comingSoon = isResidential ? 'Rides coming soon' : 'Delivery coming soon'

  if (tapped) {
    return (
      <div className="w-full py-2.5 rounded-xl border border-outline-variant bg-surface-container text-on-surface-disabled text-body-sm font-medium flex items-center justify-center gap-2">
        {comingSoon}
      </div>
    )
  }

  return (
    <button
      onClick={() => setTapped(true)}
      className="w-full py-2.5 rounded-xl border border-outline-variant bg-surface-container text-on-surface-variant text-body-sm font-medium hover:border-on-surface-subtle hover:text-on-surface transition-colors flex items-center justify-center gap-2"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        {isResidential
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H21a.75.75 0 00.75-.75V11.25L18 6H5.25A2.25 2.25 0 003 8.25v6" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        }
      </svg>
      {label}
    </button>
  )
}

// ─── Tab: QR Codes (guardian / admin) ─────────────────────────────
function QrTab({ listingId, buildingId, listingName, isAdmin, isResidential }) {
  // For residential buildings, the QR encodes the building ID (not the listing ID)
  const qrId = isResidential ? (buildingId || listingId) : listingId
  const [townieQr, setTownieQr] = useState(null)
  const [guardianQr, setGuardianQr] = useState(null)
  const [townieUrl, setTownieUrl] = useState('')
  const [guardianUrl, setGuardianUrl] = useState('')
  const [claimSecret, setClaimSecret] = useState(null)
  const [loading, setLoading] = useState(true)
  const [styledLoading, setStyledLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [guardianRevealed, setGuardianRevealed] = useState(false)

  // Read styled QR image: localStorage first, then API fallback
  const readStyledImage = useCallback(async (type) => {
    try {
      const local = localStorage.getItem(`lsq-qr-image-${qrId}-${type}`)
      if (local) return local
    } catch { /* silent */ }
    // Fallback: fetch from API (works across all devices)
    try {
      const res = await getQrDesign(qrId, type)
      const image = res?.data?.image
      if (image) {
        // Cache locally for next time
        try { localStorage.setItem(`lsq-qr-image-${qrId}-${type}`, image) } catch { /* silent */ }
        return image
      }
    } catch { /* silent */ }
    return null
  }, [qrId])

  // Listen for lsq-saved from QR Studio iframe to refresh QR codes
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'lsq-saved') setRefreshKey(k => k + 1)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  useEffect(() => {
    const vanity = 'https://lafayette-square.com'
    let cancelled = false

    async function loadQrs() {
      // 1. Generate plain QR instantly (client-side, no network)
      const tUrl = `${vanity}/checkin/${qrId}`
      setTownieUrl(tUrl)
      const plainTownie = await QRCode.toDataURL(tUrl, { width: 256, margin: 2 })
      if (!cancelled) {
        setTownieQr(plainTownie)
        setStyledLoading(true)
        setLoading(false) // Plain QRs ready — show UI immediately
      }

      // 2. Fetch guardian secret + generate plain Guardian QR (non-residential only)
      if (!isResidential) {
        try {
          const dh = await getDeviceHash()
          const res = isAdmin
            ? await getClaimSecretAdmin(qrId)
            : await getClaimSecret(qrId, dh)
          const secret = res?.data?.claim_secret
          if (secret && !cancelled) {
            setClaimSecret(secret)
            const gUrl = `${vanity}/claim/${qrId}/${secret}`
            setGuardianUrl(gUrl)
            const plainGuardian = await QRCode.toDataURL(gUrl, { width: 256, margin: 2 })
            if (!cancelled) setGuardianQr(plainGuardian)
          }
        } catch { /* silent */ }
      }

      // 3. Upgrade to styled versions in background
      try {
        const styledType = isResidential ? 'Resident' : 'Townie'
        const styledTownie = await readStyledImage(styledType)
        if (styledTownie && !cancelled) setTownieQr(styledTownie)
      } catch { /* silent */ }
      if (!isResidential) {
        try {
          const styledGuardian = await readStyledImage('Guardian')
          if (styledGuardian && !cancelled) setGuardianQr(prev => prev ? styledGuardian : prev)
        } catch { /* silent */ }
      }
      if (!cancelled) setStyledLoading(false)
    }

    loadQrs()
    return () => { cancelled = true }
  }, [qrId, isAdmin, isResidential, refreshKey, readStyledImage])

  const shareUrl = async (url, title) => {
    if (navigator.share) {
      try { await navigator.share({ title, url }) } catch { /* silent */ }
    } else {
      try { await navigator.clipboard.writeText(url) } catch { /* silent */ }
    }
  }

  const openQrStudio = () => {
    useCodeDesk.getState().setOpen(true, { listingId: qrId, qrType: isResidential ? 'Resident' : 'Townie', claimSecret, mode: 'guardian', placeName: listingName })
  }

  return (
    <div className="space-y-4">
      {/* Townie / Resident QR */}
      <div className="rounded-lg bg-surface-container border border-outline-variant p-4">
        <div className="text-body font-medium text-on-surface mb-0.5">{isResidential ? 'Resident' : 'Townie'}</div>
        <div className="text-caption text-on-surface-subtle mb-3">{isResidential ? 'Show to a neighbor to invite them' : 'For customers to check in'}</div>
        {townieQr && (
          <div className="flex justify-center mb-3">
            <img src={townieQr} alt={isResidential ? 'Resident QR' : 'Townie QR'} className={`w-48 rounded-lg transition-opacity duration-300${styledLoading ? ' opacity-60 animate-pulse' : ''}`} />
          </div>
        )}
        {!isResidential && (
          <div className="flex gap-2">
            <button
              onClick={() => shareUrl(townieUrl, 'Check in here')}
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-body-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3v11.25" />
              </svg>
              Share
            </button>
            {townieQr && (
              <button
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = townieQr
                  a.download = `${listingName || 'townie'}-qr.png`
                  a.click()
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-body-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download
              </button>
            )}
          </div>
        )}
      </div>

      {/* Guardian QR — hidden behind reveal toggle (non-residential only) */}
      {!isResidential && (
        (loading || (styledLoading && !guardianQr)) ? (
          <div className="rounded-lg bg-surface-container border border-outline-variant p-4">
            <div className="text-body font-medium text-on-surface mb-0.5">Guardian</div>
            <div className="text-caption text-on-surface-subtle mb-3">To onboard a new guardian</div>
            <div className="text-center py-6 text-on-surface-disabled text-body-sm">Loading...</div>
          </div>
        ) : guardianQr && (
          <div className="rounded-lg bg-surface-container border border-outline-variant p-4">
            <button
              onClick={() => setGuardianRevealed(r => !r)}
              className="w-full flex items-center justify-between"
            >
              <div className="text-left">
                <div className="text-sm font-medium text-on-surface mb-0.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-amber-400/70" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                  </svg>
                  Guardian
                </div>
                <div className="text-caption text-on-surface-subtle">Scan only — do not share digitally</div>
              </div>
              <svg className={`w-4 h-4 text-on-surface-subtle transition-transform ${guardianRevealed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {guardianRevealed && (
              <div className="mt-3 flex justify-center" onContextMenu={e => e.preventDefault()}>
                <img
                  src={guardianQr}
                  alt="Guardian QR"
                  className={`w-48 rounded-lg pointer-events-none no-select transition-opacity duration-300${styledLoading ? ' opacity-60 animate-pulse' : ''}`}
                  draggable={false}
                />
              </div>
            )}
          </div>
        )
      )}

      {/* Residential: how-it-works note */}
      {isResidential && (
        <div className="rounded-lg bg-surface-container border border-outline-variant p-4 space-y-2">
          <div className="text-body-sm font-medium text-on-surface flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#7A8B6F]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How it works
          </div>
          <ol className="text-caption text-on-surface-subtle space-y-1 list-decimal list-inside">
            <li>Show this QR to a neighbor in person</li>
            <li>They scan it and they're verified instantly</li>
            <li>They can then invite their own neighbors</li>
          </ol>
        </div>
      )}

      {/* Design button */}
      {!isResidential && (
        <button
          onClick={openQrStudio}
          className="w-full py-2.5 px-4 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface hover:text-on-surface text-body font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          Design in QR Studio
        </button>
      )}
    </div>
  )
}

// ─── Tab: Lobby (verified residents only) ─────────────────────────
function LobbyTab({ buildingId }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoData, setPhotoData] = useState(null)
  const fileRef = useRef(null)

  const fetchPosts = useCallback(async () => {
    try {
      const dh = await getDeviceHash()
      const res = await getLobbyPosts(dh, buildingId)
      setPosts(res?.data?.posts || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [buildingId])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  // Auto-refresh when tab becomes visible
  useEffect(() => {
    const handler = () => { if (!document.hidden) fetchPosts() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [fetchPosts])

  const handlePhoto = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await compressImage(file)
    if (result) {
      setPhotoPreview(result.base64)
      setPhotoData(result.base64)
    }
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const clearPhoto = useCallback(() => { setPhotoPreview(null); setPhotoData(null) }, [])

  const handlePost = async () => {
    if ((!text.trim() && !photoData) || posting) return
    setPosting(true)
    try {
      const dh = await getDeviceHash()
      await postLobbyPost(dh, buildingId, text.trim(), null, photoData)
      setText('')
      clearPhoto()
      await fetchPosts()
    } catch { /* silent */ }
    setPosting(false)
  }

  const handleDelete = async (postId) => {
    try {
      const dh = await getDeviceHash()
      await removeLobbyPost(dh, postId)
      setPosts(prev => prev.filter(p => p.id !== postId))
    } catch { /* silent */ }
  }

  if (loading) {
    return <div className="text-on-surface-subtle text-body-sm text-center py-6">Loading...</div>
  }

  return (
    <div className="space-y-4">
      {/* Compose */}
      <div className="space-y-2">
        <FormattedTextarea
          value={text}
          onChange={setText}
          placeholder="Post to the lobby..."
          rows={3}
          maxChars={2000}
        />
        {/* Photo preview */}
        {photoPreview && (
          <div className="relative inline-block">
            <img src={photoPreview} alt="Upload preview" className="rounded-lg max-h-32" />
            <button onClick={clearPhoto} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-container border border-outline-variant text-on-surface-disabled hover:text-on-surface-variant text-xs flex items-center justify-center">&times;</button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="px-2 py-1 rounded-lg text-on-surface-disabled hover:text-on-surface-variant hover:bg-surface-container-high transition-colors"
              title="Add photo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21zM8.25 8.625a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0z" />
              </svg>
            </button>
          </div>
          <button
            onClick={handlePost}
            disabled={(!text.trim() && !photoData) || posting}
            className="px-3 py-1 rounded-lg text-[#7A8B6F] text-body-sm font-medium disabled:opacity-40 transition-colors"
            style={{ backgroundColor: (text.trim() || photoData) ? 'rgba(122,139,111,0.2)' : undefined }}
          >
            {posting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg bg-surface-container-high px-3 py-2 text-caption text-on-surface-subtle">
        Only verified residents can see or write here.
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="text-center py-6 text-on-surface-disabled text-body-sm">
          No posts yet. Be the first to say hello.
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(p => (
            <div key={p.id} className="rounded-lg bg-surface-container px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {p.handle ? (
                      <span className="text-label-sm text-on-surface-variant font-medium inline-flex items-center gap-1">
                        <AvatarCircle emoji={p.avatar} size={5} />
                        @{p.handle}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-[#7A8B6F]/20 text-[#7A8B6F] text-caption font-medium">Resident</span>
                    )}
                    <span className="text-caption text-on-surface-disabled">{lobbyRelativeTime(p.created_at)}</span>
                  </div>
                  <div className="text-label-sm text-on-surface-variant leading-relaxed break-words">
                    {renderMarkdown(p.text)}
                  </div>
                  {p.photo_url && (
                    <img src={p.photo_url} alt="" className="rounded-lg max-h-48 mt-1.5" loading="lazy" />
                  )}
                </div>
                {p.is_mine && (
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-caption px-2 py-1 rounded bg-surface-container text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Residential About Tab (mirrors restaurant layout) ──────────────
function ResidentialAboutTab({ listing, building, isGuardian, history, description, hasArchitecture, photos, facadeImage, facadeInfo, name, listingId }) {
  const hasPhotos = !!(photos?.length || facadeImage || facadeInfo)

  return (
    <div className="space-y-5">
      {/* About card — overview + history inside (same as restaurant) */}
      <div className="card space-y-3">
        <OverviewTab listing={listing} building={building} isGuardian={isGuardian} isResidential={true} />

        {history?.length > 0 && (
          <details className="group">
            <summary className="history-toggle">
              <span className="group-open:hidden">{history[0]?.year || ''} – Present</span>
              <span className="hidden group-open:inline">Less</span>
              <svg className="w-3.5 h-3.5 transform group-open:rotate-180 transition-transform duration-300 ease-out" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-3 pt-3 border-t border-outline-variant space-y-3">
              <h4 className="section-heading">History</h4>
              <HistoryTimeline history={history} />
              {hasArchitecture && (<>
                <div className="h-2" />
                <div className="rounded-lg border border-outline p-3">
                  <h4 className="section-heading mb-2">Building Details</h4>
                  <ArchitectureTab building={building} />
                </div>
              </>)}
            </div>
          </details>
        )}
      </div>

      {/* Photos */}
      {hasPhotos && (
        <div className="card">
          <h3 className="section-heading mb-3">Photos</h3>
          <PhotosTab photos={photos} facadeImage={facadeImage} facadeInfo={facadeInfo} name={name} isGuardian={isGuardian} listingId={listingId} />
        </div>
      )}
    </div>
  )
}

// ─── Non-Residential About Tab (consolidated single-scroll) ──────────
function PlaceAboutTab({ listing, building, isGuardian, history, description, hasArchitecture, photos, facadeImage, facadeInfo, name, listingId }) {
  const hasPhotos = !!(photos?.length || facadeImage || facadeInfo)
  const hasMore = !!(history?.length || hasArchitecture)

  return (
    <div className="space-y-5">
      {/* About card — overview + history inside */}
      <div className="card space-y-3">
        <OverviewTab listing={listing} building={building} isGuardian={isGuardian} isResidential={false} />

        {history?.length > 0 && (
          <details className="group">
            <summary className="history-toggle">
              <span className="group-open:hidden">{history[0]?.year || ''} – Present</span>
              <span className="hidden group-open:inline">Less</span>
              <svg className="w-3.5 h-3.5 transform group-open:rotate-180 transition-transform duration-300 ease-out" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-3 pt-3 border-t border-outline-variant space-y-3">
              <h4 className="section-heading">History</h4>
              <HistoryTimeline history={history} />
              {hasArchitecture && (<>
                <div className="h-2" />
                <div className="rounded-lg border border-outline p-3">
                  <h4 className="section-heading mb-2">Building Details</h4>
                  <ArchitectureTab building={building} />
                </div>
              </>)}
            </div>
          </details>
        )}
      </div>


      {/* Photos */}
      {hasPhotos && (
        <div className="card">
          <h3 className="section-heading mb-3">Photos</h3>
          <PhotosTab photos={photos} facadeImage={facadeImage} facadeInfo={facadeInfo} name={name} isGuardian={isGuardian} listingId={listingId} />
        </div>
      )}
    </div>
  )
}

// ─── Menu Tab ─────────────────────────────────────────────────────────

const MENU_LABELS = {
  dinner: 'Dinner', lunch: 'Lunch', brunch: 'Brunch', drinks: 'Drinks',
  dessert: 'Dessert', all_day: 'All Day', happy_hour: 'Happy Hour', specials: 'Specials', market: 'Market',
}
const MENU_ORDER = ['all_day', 'lunch', 'dinner', 'brunch', 'drinks', 'dessert', 'happy_hour', 'specials', 'market']

function MenuTab({ listing, building, isGuardian, isAdmin }) {
  const menu = listing?.menu || null
  const sections = menu?.sections || []
  const editCtx = useContext(EditContext)
  const [editingMenu, setEditingMenu] = useState(false)
  const [addingMenu, setAddingMenu] = useState(false)
  const hasDelivery = (listing?.tags || []).includes('delivery')
  const courierAvailable = useCourierAvailable()
  const canOrder = hasDelivery && courierAvailable

  // Admin can scrub time to demo menu availability; regular users always see real time.
  const simTime = useTimeOfDay((s) => s.currentTime)
  const isLiveTime = useTimeOfDay((s) => s.isLive)
  const menuTime = isAdmin && !isLiveTime ? simTime : new Date()

  // Group sections by menu type — known types appear in MENU_ORDER,
  // custom types (e.g. "bridal_brunch") appear after them.
  const menus = useMemo(() => {
    const groups = {}
    sections.forEach(s => {
      const key = s.menu || 'all_day'
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    })
    const known = MENU_ORDER.filter(k => groups[k]).map(k => ({ key: k, label: MENU_LABELS[k] || k, sections: groups[k] }))
    const custom = Object.keys(groups).filter(k => !MENU_ORDER.includes(k)).map(k => ({ key: k, label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), sections: groups[k] }))
    return [...known, ...custom]
  }, [sections])

  // Pick the default pill based on the menu schedule — latest start time wins.
  const listingId = listing?.id
  const [activeMenu, setActiveMenu] = useState(() => {
    if (!menus.length) return null
    const available = new Set(menus.map(m => m.key))
    const sched = menu?.schedule || {}
    const now = menuTime
    const dayAbbrev = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()]
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    // Find all menu types active right now, pick the one with latest start time
    let best = null
    let bestStart = ''
    for (const [menuKey, daySched] of Object.entries(sched)) {
      if (!available.has(menuKey)) continue
      const todaySlot = daySched[dayAbbrev]
      if (todaySlot && todaySlot.start && todaySlot.end && timeStr >= todaySlot.start && timeStr < todaySlot.end) {
        if (todaySlot.start > bestStart) { best = menuKey; bestStart = todaySlot.start }
      }
    }
    if (best) return best
    return menus[0].key
  })

  // Reset active menu when data changes (e.g. new sections added)
  useEffect(() => {
    if (menus.length > 0 && !menus.find(m => m.key === activeMenu)) {
      setActiveMenu(menus[0].key)
    }
  }, [menus, activeMenu])

  const currentMenu = menus.find(m => m.key === activeMenu)

  // Ordering state
  const [ordering, setOrdering] = useState(false)
  const [cart, setCart] = useState({}) // { "sectionIdx-itemIdx": qty }
  const [orderNote, setOrderNote] = useState('')
  const [orderPlaced, setOrderPlaced] = useState(false)

  // A menu type is orderable when the menu schedule says it's active right now.
  const schedule = menu?.schedule || {}
  const DAY_ABBREVS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  const orderableMenus = useMemo(() => {
    const dayAbbrev = DAY_ABBREVS[menuTime.getDay()]
    const timeStr = String(menuTime.getHours()).padStart(2, '0') + ':' + String(menuTime.getMinutes()).padStart(2, '0')

    const available = new Set()
    for (const [menuKey, daySched] of Object.entries(schedule)) {
      const todaySlot = daySched[dayAbbrev]
      if (todaySlot && todaySlot.start && todaySlot.end && timeStr >= todaySlot.start && timeStr < todaySlot.end) {
        available.add(menuKey)
      }
    }
    return available
  }, [schedule, menuTime])

  // Only count cart items from currently orderable menus
  const orderableSections = useMemo(() => {
    const set = new Set()
    menus.forEach(m => {
      if (orderableMenus.has(m.key)) {
        m.sections.forEach(s => set.add(sections.indexOf(s)))
      }
    })
    return set
  }, [menus, orderableMenus, sections])

  const cartCount = Object.entries(cart).reduce((acc, [key, qty]) => {
    const si = parseInt(key.split('-')[0], 10)
    return acc + (orderableSections.has(si) ? qty : 0)
  }, 0)

  const cartTotal = useMemo(() => {
    let total = 0
    sections.forEach((section, si) => {
      if (!orderableSections.has(si)) return
      ;(section.items || []).forEach((item, ii) => {
        const key = `${si}-${ii}`
        const qty = cart[key] || 0
        if (qty > 0 && item.price != null) total += item.price * qty
      })
    })
    return total
  }, [cart, sections, orderableSections])

  const MIN_ORDER = 4000 // $40 minimum order for delivery
  const STL_TAX_RATE = 0.08725 // Missouri 4.225% + St. Louis city 4.5%
  const salesTax = Math.round(cartTotal * STL_TAX_RATE) // tax on food only, not delivery
  const caryFee = Math.round(cartTotal * 0.22) // 22% service charge — courier keeps 75%, platform keeps 25%
  const processingFee = cartTotal > 0 ? Math.round((cartTotal + salesTax + caryFee) * 0.029) + 30 : 0 // Stripe 2.9% + $0.30
  const orderTotal = cartTotal + salesTax + caryFee + processingFee
  const belowMinimum = cartTotal > 0 && cartTotal < MIN_ORDER

  const setQty = (sectionIdx, itemIdx, delta) => {
    const key = `${sectionIdx}-${itemIdx}`
    setCart(prev => {
      const cur = prev[key] || 0
      const next = Math.max(0, cur + delta)
      if (next === 0) {
        const { [key]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: next }
    })
  }

  const getQty = (sectionIdx, itemIdx) => cart[`${sectionIdx}-${itemIdx}`] || 0

  if (!sections.length && !isGuardian) return <p className="text-on-surface-disabled text-body-sm">No menu available yet.</p>

  return (
    <div className="space-y-4">
      {/* Delivery CTA — only show when menus are actually orderable right now.
          To go live for everyone: remove the isAdmin gate. */}
      {hasDelivery && sections.length > 0 && !ordering && (
        orderableMenus.size > 0 ? (
          isAdmin ? (
            <button
              onClick={() => setOrdering(true)}
              className="w-full py-3 px-4 rounded-xl font-mono font-medium text-sm bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.98] transition-all duration-200"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                Order delivery from {listing?.name}
              </span>
            </button>
          ) : (
            <div className="w-full py-3 px-4 rounded-xl font-mono text-sm text-center border border-emerald-500/20 bg-emerald-500/5">
              <span className="flex items-center justify-center gap-2 text-emerald-400/90">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                Cary delivery — coming soon
              </span>
            </div>
          )
        ) : null
      )}

      {ordering && (
        <div className="flex items-center justify-between">
          <span className="text-body-sm font-mono font-medium text-emerald-400">
            Ordering from {listing?.name}
          </span>
          <button
            onClick={() => { setOrdering(false); setCart({}); setOrderNote(''); setOrderPlaced(false) }}
            className="text-caption text-on-surface-disabled hover:text-on-surface-variant transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Menu type pills */}
      {(menus.length > 1 || isGuardian) && (
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 items-center">
          {menus.map(m => (
            <button
              key={m.key}
              onClick={() => setActiveMenu(m.key)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-body-sm font-medium transition-colors ${
                activeMenu === m.key
                  ? 'bg-on-surface text-surface'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              {m.label}
            </button>
          ))}
          {isGuardian && !addingMenu && (
            <button
              onClick={() => setAddingMenu(true)}
              className="flex-shrink-0 w-7 h-7 rounded-full border border-dashed border-outline-variant text-on-surface-variant hover:border-on-surface-subtle hover:text-on-surface transition-colors flex items-center justify-center"
              title="Add menu"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Add menu picker — guardian only */}
      {isGuardian && addingMenu && (
        <div className="rounded-lg bg-surface-container border border-outline-variant p-3 space-y-2">
          <p className="text-body-sm text-on-surface-variant font-medium">Add a new menu</p>
          <div className="flex flex-wrap gap-1.5">
            {MENU_ORDER.filter(k => !menus.find(m => m.key === k)).map(k => (
              <button
                key={k}
                onClick={() => {
                  const newSection = { name: '', menu: k, items: [{ name: '', description: '', price: null, tags: [], modifiers: [] }] }
                  const newMenu = { sections: [...sections, newSection] }
                  editCtx?.setField('menu', newMenu)
                  setActiveMenu(k)
                  setAddingMenu(false)
                  setEditingMenu(true)
                }}
                className="px-3 py-1.5 rounded-full text-body-sm font-medium bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
              >
                {MENU_LABELS[k]}
              </button>
            ))}
          </div>
          <form className="flex gap-2 pt-1" onSubmit={e => {
            e.preventDefault()
            const input = e.target.elements.customMenu
            const raw = (input.value || '').trim()
            if (!raw) return
            const key = raw.toLowerCase().replace(/\s+/g, '_')
            if (menus.find(m => m.key === key)) return
            const newSection = { name: '', menu: key, items: [{ name: '', description: '', price: null, tags: [], modifiers: [] }] }
            const newMenu = { sections: [...sections, newSection] }
            editCtx?.setField('menu', newMenu)
            setActiveMenu(key)
            setAddingMenu(false)
            setEditingMenu(true)
          }}>
            <input
              name="customMenu"
              placeholder="Custom (e.g. Bridal Brunch)"
              className="flex-1 bg-surface-container-high text-on-surface text-body-sm rounded-full px-3 py-1.5 border border-outline-variant focus:border-on-surface-subtle outline-none"
            />
            <button type="submit" className="px-3 py-1.5 rounded-full text-body-sm font-medium bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors">
              Add
            </button>
          </form>
          <button
            onClick={() => setAddingMenu(false)}
            className="text-caption text-on-surface-disabled hover:text-on-surface-variant transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Guardian nudge: menu has no schedule yet → not deliverable */}
      {isGuardian && activeMenu && hasDelivery && !schedule[activeMenu] && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <p className="text-body-sm text-amber-400/90 leading-snug">
            This menu won't be available for delivery until you set its hours. Tap "Edit Menu" and set the days and times you serve it.
          </p>
        </div>
      )}

      {/* Sections for active menu — collapsible */}
      {currentMenu?.sections.map((section, si) => {
        const absSi = sections.indexOf(section)
        const canOrderSection = ordering && orderableSections.has(absSi)
        // Count cart items in this section
        const sectionCartCount = (section.items || []).reduce((acc, _, ii) => acc + getQty(absSi, ii), 0)
        return (
          <MenuSection
            key={si}
            section={section}
            absSi={absSi}
            ordering={canOrderSection}
            sectionCartCount={sectionCartCount}
            getQty={getQty}
            setQty={setQty}
            defaultOpen={si === 0}
          />
        )
      })}

      {/* Order summary */}
      {ordering && cartCount > 0 && (
        <div className="card space-y-2 font-mono">
          <div className="flex justify-between text-body-sm text-on-surface-variant">
            <span>Subtotal ({cartCount} item{cartCount !== 1 ? 's' : ''})</span>
            <span className="tabular-nums">${(cartTotal / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-body-sm text-on-surface-subtle">
            <span>Tax (8.725%)</span>
            <span className="tabular-nums">${(salesTax / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-body-sm text-on-surface-subtle">
            <span>Service charge (22%)</span>
            <span className="tabular-nums">${(caryFee / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-body-sm text-on-surface-subtle">
            <span>Processing</span>
            <span className="tabular-nums">${(processingFee / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-body font-medium text-on-surface pt-2 border-t border-outline-variant">
            <span>Total</span>
            <span className="tabular-nums">${(orderTotal / 100).toFixed(2)}</span>
          </div>

          {belowMinimum && (
            <p className="text-caption text-amber-400/80 mt-1">
              ${((MIN_ORDER - cartTotal) / 100).toFixed(2)} more to meet the $40 minimum
            </p>
          )}

          {/* Order notes — special requests for the kitchen */}
          <div className="pt-2 border-t border-outline-variant space-y-1.5">
            <textarea
              value={orderNote}
              onChange={e => setOrderNote(e.target.value)}
              placeholder="Special requests for the kitchen (allergies, substitutions, etc.)"
              rows={2}
              maxLength={500}
              className="w-full bg-surface-container-high text-on-surface text-body-sm rounded-lg px-3 py-2 border border-outline-variant focus:border-on-surface-subtle outline-none resize-none font-sans placeholder:text-on-surface-disabled"
            />
            <p className="text-caption text-on-surface-disabled leading-snug">
              Your note goes directly to the kitchen. They'll do their best to accommodate.
            </p>
          </div>

          {!orderPlaced ? (
            <button
              onClick={() => setOrderPlaced(true)}
              disabled={belowMinimum}
              className={`w-full mt-2 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                belowMinimum
                  ? 'bg-surface-container-high border border-outline-variant text-on-surface-disabled cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.98]'
              }`}
            >
              {belowMinimum ? `$40 minimum order` : `Place order — $${(orderTotal / 100).toFixed(2)}`}
            </button>
          ) : (
            <div className="text-center py-3 rounded-xl bg-surface-container-high border border-outline-variant">
              <p className="text-body-sm text-on-surface-variant font-medium">Coming soon</p>
              <p className="text-caption text-on-surface-disabled mt-0.5">Cary delivery is launching this spring</p>
            </div>
          )}
        </div>
      )}

      {/* Guardian: edit menu button */}
      {isGuardian && (
        <div className={sections.length > 0 ? 'pt-2 border-t border-outline-variant' : ''}>
          {!editingMenu ? (
            sections.length === 0 ? (
              <button
                onClick={() => setEditingMenu(true)}
                className="w-full py-6 rounded-xl border-2 border-dashed border-outline-variant text-on-surface-variant text-body-sm hover:border-on-surface-subtle hover:text-on-surface transition-colors flex flex-col items-center justify-center gap-1.5"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Menu
              </button>
            ) : (
              <button
                onClick={() => setEditingMenu(true)}
                className="w-full text-center py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-body-sm hover:bg-surface-container-highest transition-colors"
              >
                Edit Menu
              </button>
            )
          ) : (
            <MenuEditor
              menu={menu}
              activeMenuType={activeMenu}
              onSave={(newMenu) => {
                editCtx?.setField('menu', newMenu)
                setEditingMenu(false)
              }}
              onCancel={() => setEditingMenu(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function MenuSection({ section, absSi, ordering, sectionCartCount, getQty, setQty, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const itemCount = section.items?.length || 0

  // Auto-open if cart has items in this section
  useEffect(() => {
    if (sectionCartCount > 0 && !open) setOpen(true)
  }, [sectionCartCount])

  return (
    <div className="border border-outline-variant/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-container/50 transition-colors"
      >
        <svg
          className={`w-3 h-3 text-on-surface-disabled transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-body-sm font-semibold text-on-surface-variant uppercase tracking-wider flex-1">{section.name}</span>
        {sectionCartCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-caption font-medium tabular-nums">
            {sectionCartCount}
          </span>
        )}
        {!sectionCartCount && (
          <span className="text-caption text-on-surface-disabled">{itemCount}</span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-2">
          {section.items?.map((item, ii) => (
            <MenuItemRow
              key={ii}
              item={item}
              ordering={ordering}
              qty={getQty(absSi, ii)}
              onAdd={() => setQty(absSi, ii, 1)}
              onRemove={() => setQty(absSi, ii, -1)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MenuItemRow({ item, ordering, qty, onAdd, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const hasMods = item.modifiers?.length > 0
  const tags = item.tags || []
  const hasPrice = item.price != null
  const hasDesc = !!item.description
  const longDesc = hasDesc && item.description.length > 60
  return (
    <div className={`flex gap-2 py-1.5 border-b border-outline-variant/30 last:border-0 transition-colors ${qty > 0 ? 'bg-emerald-500/5 -mx-1 px-1 rounded' : ''}`}>
      <div className="flex-1 min-w-0" onClick={hasDesc ? () => setExpanded(e => !e) : undefined} style={hasDesc ? { cursor: 'pointer' } : undefined}>
        <div className="flex items-baseline gap-1.5">
          <span className="text-body-sm font-medium text-on-surface">{item.name}</span>
          {tags.length > 0 && (
            <span className="text-caption text-on-surface-disabled/60 flex-shrink-0">
              {tags.map(t => t === 'gf' ? 'GF' : t === 'v' ? 'V' : t === 'vg' ? 'VG' : t.toUpperCase()).join(' · ')}
            </span>
          )}
        </div>
        {hasDesc && (
          <p className={`text-caption text-on-surface-subtle/70 mt-0.5 leading-snug ${!expanded && longDesc ? 'line-clamp-1' : ''}`}>
            {item.description}
          </p>
        )}
        {hasMods && expanded && (
          <div className="flex flex-wrap gap-x-2 mt-0.5">
            {item.modifiers.map((mod, mi) => (
              <span key={mi} className="text-caption text-on-surface-disabled">
                {mod.name} {mod.price != null ? `+$${(mod.price / 100).toFixed(2)}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {hasPrice && (
          <span className={`text-body-sm tabular-nums ${qty > 0 ? 'text-emerald-400 font-medium' : 'text-on-surface-subtle'}`}>
            {(item.price / 100).toFixed(0)}
          </span>
        )}
        {ordering && hasPrice && (
          <div className="flex items-center gap-0.5">
            {qty > 0 && (
              <>
                <button
                  onClick={onRemove}
                  className="w-5 h-5 rounded-full bg-surface-container-high border border-outline-variant text-on-surface-variant hover:bg-surface-container-highest flex items-center justify-center text-xs leading-none transition-colors"
                >
                  &minus;
                </button>
                <span className="w-4 text-center text-caption font-medium text-on-surface tabular-nums">{qty}</span>
              </>
            )}
            <button
              onClick={onAdd}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs leading-none transition-colors ${
                qty > 0
                  ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-surface-container-high border border-outline-variant text-on-surface-disabled hover:text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Guardian Menu Editor ──────────────────────────────────────────────
const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABEL = { mon: 'M', tue: 'T', wed: 'W', thu: 'Th', fri: 'F', sat: 'Sa', sun: 'Su' }

function MenuEditor({ menu, activeMenuType, onSave, onCancel }) {
  // Work on a deep copy of the full menu
  const [allSections, setAllSections] = useState(() => {
    const s = menu?.sections || []
    return s.length ? JSON.parse(JSON.stringify(s)) : []
  })
  const [scheduleData, setScheduleData] = useState(() => JSON.parse(JSON.stringify(menu?.schedule || {})))
  const [taglines, setTaglines] = useState(() => JSON.parse(JSON.stringify(menu?.taglines || {})))

  // Only show sections for the active menu type
  const editType = activeMenuType || 'all_day'
  const filteredIndices = allSections.map((s, i) => s.menu === editType ? i : -1).filter(i => i >= 0)

  // Schedule for this menu type — per-day format: { mon: { start, end }, tue: { start, end }, ... }
  const daySched = scheduleData[editType] || {}
  const toggleDay = (day) => {
    setScheduleData(prev => {
      const typeSched = { ...(prev[editType] || {}) }
      if (typeSched[day]) {
        delete typeSched[day]
      } else {
        // Default new day to the times of an existing day, or empty
        const existing = Object.values(typeSched)[0]
        typeSched[day] = existing ? { ...existing } : { start: '', end: '' }
      }
      return { ...prev, [editType]: typeSched }
    })
  }
  const updateDayTime = (day, field, val) => {
    setScheduleData(prev => ({
      ...prev,
      [editType]: { ...(prev[editType] || {}), [day]: { ...(prev[editType]?.[day] || { start: '', end: '' }), [field]: val } }
    }))
  }

  const addSection = () => setAllSections(prev => [...prev, { name: '', menu: editType, items: [{ name: '', description: '', price: null, tags: [], modifiers: [] }] }])
  const removeSection = (absIdx) => setAllSections(prev => prev.filter((_, i) => i !== absIdx))
  const updateSection = (absIdx, field, val) => setAllSections(prev => prev.map((s, i) => i === absIdx ? { ...s, [field]: val } : s))

  const addItem = (absIdx) => setAllSections(prev => prev.map((s, i) => i === absIdx ? { ...s, items: [...s.items, { name: '', description: '', price: null, tags: [], modifiers: [] }] } : s))
  const removeItem = (absIdx, ii) => setAllSections(prev => prev.map((s, i) => i === absIdx ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s))
  const updateItem = (absIdx, ii, field, val) => setAllSections(prev => prev.map((s, i) => i === absIdx ? { ...s, items: s.items.map((item, j) => j === ii ? { ...item, [field]: val } : item) } : s))

  const handleSave = () => {
    const cleaned = allSections
      .map(s => ({ ...s, items: s.items.filter(item => item.name.trim()) }))
      .filter(s => s.name.trim() && s.items.length > 0)
    // Clean empty schedules — remove days with no times, remove empty menu types
    const cleanSched = {}
    for (const [menuType, days] of Object.entries(scheduleData)) {
      const cleanDays = {}
      for (const [day, slot] of Object.entries(days)) {
        if (slot.start && slot.end) cleanDays[day] = slot
      }
      if (Object.keys(cleanDays).length > 0) cleanSched[menuType] = cleanDays
    }
    // Clean empty taglines
    const cleanTaglines = {}
    for (const [k, v] of Object.entries(taglines)) {
      if (v && v.trim()) cleanTaglines[k] = v.trim()
    }
    onSave({ sections: cleaned, schedule: cleanSched, taglines: cleanTaglines })
  }

  const menuLabel = MENU_LABELS[editType] || editType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="space-y-4">
      {/* Schedule controls for this menu type */}
      <div className="rounded-lg bg-surface-container p-3 space-y-2">
        <p className="text-caption font-semibold text-on-surface-variant uppercase tracking-wider">When is {menuLabel} served?</p>
        <div className="flex gap-1">
          {ALL_DAYS.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`w-8 h-8 rounded-full text-caption font-medium transition-colors ${
                daySched[d]
                  ? 'bg-on-surface text-surface'
                  : 'bg-surface-container-high text-on-surface-disabled hover:text-on-surface-variant'
              }`}
            >
              {DAY_LABEL[d]}
            </button>
          ))}
        </div>
        {ALL_DAYS.filter(d => daySched[d]).map(d => (
          <div key={d} className="flex gap-2 items-center">
            <span className="text-caption text-on-surface-variant w-6 flex-shrink-0">{DAY_LABEL[d]}</span>
            <input
              type="time"
              value={daySched[d]?.start || ''}
              onChange={e => updateDayTime(d, 'start', e.target.value)}
              className="flex-1 bg-surface-container-high text-on-surface text-body-sm rounded px-2 py-1.5 border border-outline-variant outline-none [color-scheme:dark]"
            />
            <span className="text-on-surface-disabled text-caption">to</span>
            <input
              type="time"
              value={daySched[d]?.end || ''}
              onChange={e => updateDayTime(d, 'end', e.target.value)}
              className="flex-1 bg-surface-container-high text-on-surface text-body-sm rounded px-2 py-1.5 border border-outline-variant outline-none [color-scheme:dark]"
            />
          </div>
        ))}
        <input
          value={taglines[editType] || ''}
          onChange={e => setTaglines(prev => ({ ...prev, [editType]: e.target.value }))}
          placeholder="Ticker tagline (e.g. rooftop cocktails in the old power plant)"
          className="w-full bg-surface-container-high text-on-surface text-body-sm rounded px-2 py-1.5 border border-outline-variant focus:border-on-surface-subtle outline-none"
        />
      </div>

      {/* Sections for this menu type only */}
      {filteredIndices.map(absIdx => {
        const section = allSections[absIdx]
        return (
          <div key={absIdx} className="rounded-lg bg-surface-container p-3 space-y-3">
            <div className="flex gap-2">
              <input
                value={section.name}
                onChange={e => updateSection(absIdx, 'name', e.target.value)}
                placeholder="Section name (e.g. Appetizers)"
                className="flex-1 bg-surface-container-high text-on-surface text-body-sm rounded px-2 py-1.5 border border-outline-variant focus:border-on-surface-subtle outline-none"
              />
              <button onClick={() => removeSection(absIdx)} className="text-on-surface-disabled hover:text-rose-400 p-1" title="Remove section">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>

            {section.items.map((item, ii) => (
              <div key={ii} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <input
                    value={item.name}
                    onChange={e => updateItem(absIdx, ii, 'name', e.target.value)}
                    placeholder="Item name"
                    className="w-full bg-surface-container-high text-on-surface text-body-sm rounded px-2 py-1 border border-outline-variant focus:border-on-surface-subtle outline-none"
                  />
                  <input
                    value={item.description || ''}
                    onChange={e => updateItem(absIdx, ii, 'description', e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full bg-surface-container-high text-on-surface-subtle text-caption rounded px-2 py-1 border border-outline-variant focus:border-on-surface-subtle outline-none"
                  />
                </div>
                <input
                  value={item.price != null ? (item.price / 100).toFixed(2) : ''}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, '')
                    updateItem(absIdx, ii, 'price', v ? Math.round(parseFloat(v) * 100) : null)
                  }}
                  placeholder="$"
                  className="w-16 bg-surface-container-high text-on-surface text-body-sm rounded px-2 py-1 border border-outline-variant focus:border-on-surface-subtle outline-none text-right tabular-nums"
                />
                <button onClick={() => removeItem(absIdx, ii)} className="text-on-surface-disabled hover:text-rose-400 p-0.5 mt-1" title="Remove item">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}

            <button
              onClick={() => addItem(absIdx)}
              className="text-on-surface-disabled hover:text-on-surface-variant text-caption flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add item
            </button>
          </div>
        )
      })}

      <button
        onClick={addSection}
        className="w-full py-2 rounded-lg border border-dashed border-outline-variant text-on-surface-variant text-body-sm hover:bg-surface-container transition-colors"
      >
        + Add Section (e.g. Appetizers, Entrées)
      </button>

      <div className="flex gap-2">
        <button onClick={handleSave} className="flex-1 py-2 rounded-lg bg-on-surface text-surface text-body-sm font-medium hover:bg-on-surface/90 transition-colors">
          Save
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface-variant text-body-sm hover:bg-surface-container-highest transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Community Tab (Reviews + Ticker) ────────────────────────────────
function CommunityTab({ listingId, isGuardian }) {
  return (
    <div className="space-y-5">
      <div className="card">
        <h3 className="section-heading mb-3">Reviews</h3>
        <ReviewsTab listingId={listingId} isGuardian={isGuardian} />
      </div>

      <div className="card">
        <h3 className="section-heading mb-3">Ticker</h3>
        <EventsTab listingId={listingId} isGuardian={isGuardian} />
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// Main PlaceCard
// ═════════════════════════════════════════════════════════════════════
function PlaceCard({ listing: listingProp, building, onClose, allListings: allListingsProp }) {
  const [activeTab, setActiveTab] = useState(null)
  const [activeListingIdx, setActiveListingIdx] = useState(0)
  const { isGuardianOf, isAdmin: isStoreAdmin } = useGuardianStatus()
  const residenceBuildingId = useResidence(s => s.buildingId)
  const residenceStatus = useResidence(s => s.status)
  const handle = useHandle(s => s.handle)
  const panelState = useCamera(s => s.panelState)
  const panelCollapsedPx = useCamera(s => s.panelCollapsedPx)
  const initialTab = useSelectedBuilding(s => s.initialTab)
  const [residentCount, setResidentCount] = useState(null)
  const [claimingResidence, setClaimingResidence] = useState(false)

  // Subscribe to store so guardian edits trigger re-render
  const storeListing = useListings(s => listingProp?.id ? s.listings.find(l => l.id === listingProp.id) : null)
  const storeAllListings = useListings(s => building?.id ? s.listings.filter(l => l.building_id === building.id) : [])
  const listing = storeListing || listingProp
  const allListings = storeAllListings.length > 0 ? storeAllListings : allListingsProp

  // Multi-tenant: if multiple listings for this building, show tabs
  const listings = allListings && allListings.length > 1 ? allListings : (listing ? [listing] : [])

  // When the clicked listing changes, jump to it in the multi-tenant list
  useEffect(() => {
    if (listing && listings.length > 1) {
      const idx = listings.findIndex(l => l.id === listing.id)
      if (idx >= 0) setActiveListingIdx(idx)
    }
  }, [listing?.id])

  const activeListing = listings[activeListingIdx] || listing

  const name = activeListing?.name || building?.name || 'Unknown Building'
  const category = activeListing?.category || null
  const subcategory = activeListing?.subcategory || null
  const hours = activeListing?.hours || null
  const rating = activeListing?.rating || null
  const reviewCount = activeListing?.review_count || null
  const photos = activeListing?.photos || null
  const facadeImage = building?.facade_image || null
  const facadeInfo = building?.id ? getFacadeInfo(building.id) : null
  const rawHero = photos?.[0]
  const heroPhoto = (rawHero ? (typeof rawHero === 'string' ? rawHero : rawHero.url) : null) || facadeImage?.thumb_1024 || facadeInfo?.photo || null
  const history = activeListing?.history || null
  const description = activeListing?.description || null
  const hasListingInfo = !!activeListing
  const listingId = activeListing?.id || null
  const isAdmin = isStoreAdmin
  const isGuardian = isAdmin || (listingId ? isGuardianOf(listingId) : false)

  const placeholderPhotos = getPlaceholderPhotos(category)
  const scrollRef = useRef(null)

  // Architecture data for property card (bare buildings)
  const arch = building?.architecture || {}
  const yearBuilt = building?.year_built || arch.year_built
  const styleName = arch.style || building?.style
  const hasPropertyData = !!(yearBuilt || styleName || arch.materials || arch.nps_context || arch.architect)


  // Build dynamic tabs based on available data
  const hasHistory = !!(history?.length || description)
  const hasArchitecture = !!(building && (building.year_built || building.style || building.architect || building.historic_status || building.architecture))

  const isResidential = activeListing?.category === 'residential'
  const isResidentHere = isResidential && residenceBuildingId === building?.id && residenceStatus === 'verified'


  const tabs = useMemo(() => {
    if (hasListingInfo) {
      if (isResidential) {
        // ── Residential: About + Community (public) + Lobby (residents only) ──
        const t = [{ id: 'about', label: 'About' }]
        t.push({ id: 'community', label: 'Community' })
        if (isResidentHere || isAdmin) t.push({ id: 'lobby', label: 'Lobby' })
        return t
      }
      // ── Non-residential listing path: About + Menu + Reviews + Guardians ──
      const t = [{ id: 'about', label: 'About' }]
      if (activeListing?.menu?.sections?.length || isGuardian) t.push({ id: 'menu', label: 'Menu' })
      t.push({ id: 'reviews', label: 'Reviews' })
      if (isGuardian || isAdmin) t.push({ id: 'guardians', label: 'Guardians' })
      return t
    }
    // ── Property card path: bare buildings ──
    const t = []
    if (hasPropertyData) t.push({ id: 'property', label: 'Property' })
    if (hasHistory) t.push({ id: 'history', label: 'History' })
    t.push({ id: 'photos', label: 'Photos' })
    return t
  }, [hasListingInfo, hasHistory, hasArchitecture, hasPropertyData, isGuardian, isAdmin, isResidential, isResidentHere, activeListing?.menu])

  // Default tab: first available
  const defaultTab = tabs[0]?.id || 'photos'
  const currentTab = activeTab && tabs.some(t => t.id === activeTab) ? activeTab : defaultTab

  // Consume initialTab from store
  useEffect(() => {
    const mapped = (initialTab === 'ticker' || initialTab === 'events') ? 'guardians'
      : initialTab === 'community' ? 'reviews'
      : initialTab === 'qr' ? 'guardians'
      : initialTab
    if (mapped && tabs.some(t => t.id === mapped)) {
      setActiveTab(mapped)
      useSelectedBuilding.getState().clearInitialTab()
    }
  }, [initialTab, tabs])

  // Fetch resident count for residential buildings
  useEffect(() => {
    if (!isResidential || !building?.id) return
    getResidentCount(building.id).then(res => {
      setResidentCount(res?.data?.count ?? null)
    }).catch(() => {})
  }, [isResidential, building?.id])

  // Claim residence handler (backend auto-verifies if admin or handle matches a verified resident)
  const handleClaimResidence = useCallback(async () => {
    if (!building?.id || claimingResidence) return
    setClaimingResidence(true)
    try {
      const dh = await getDeviceHash()
      const res = await claimResidence(dh, building.id, false, isStoreAdmin)
      const d = res?.data
      if (d && !d.error) {
        useResidence.setState({
          buildingId: d.building_id || building.id,
          status: d.status || 'pending',
        })
      }
    } catch { /* silent */ }
    setClaimingResidence(false)
  }, [building?.id, claimingResidence, isStoreAdmin])

  // Leave residence handler
  const handleLeaveResidence = useCallback(async () => {
    try {
      const dh = await getDeviceHash()
      await leaveResidence(dh)
      useResidence.setState({ buildingId: null, status: null })
    } catch { /* silent */ }
  }, [])

  // Style-tinted gradient for bare buildings
  const styleGradient = !hasListingInfo ? getStyleGradient(arch.nps_style_group) : null


  return (
    <div role="dialog" aria-modal="true" aria-label={name} className="absolute left-3 right-3 bg-surface sm:bg-surface-glass sm:backdrop-blur-2xl sm:backdrop-saturate-150 rounded-2xl text-on-surface shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-outline overflow-hidden flex flex-col z-50" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', bottom: panelState === 'browse' ? 'calc(30dvh - 1rem + 18px)' : `${(panelCollapsedPx || 76) + 18}px` }}>
      {/* Hero Photo Area */}
      <div className="relative h-28 bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden flex-shrink-0">
        {heroPhoto ? (
          <img src={assetUrl(heroPhoto)} alt={name} className="w-full h-full object-cover" />
        ) : hasListingInfo ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${placeholderPhotos[0]}, ${placeholderPhotos[1]})` }}
          >
            <div className="text-center text-on-surface-disabled">
              <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-body-sm">No photos yet</p>
            </div>
          </div>
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${styleGradient[0]}, ${styleGradient[1]})` }}
          >
            {styleName ? (
              <span className="text-on-surface-disabled text-lg font-light tracking-wide">{styleName}</span>
            ) : (
              <svg className="w-16 h-16 text-on-surface-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            )}
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-9 h-9 rounded-full backdrop-blur-md bg-rose-500/20 border border-rose-400/40 text-rose-300 transition-all duration-200 flex items-center justify-center hover:bg-rose-500/30"
          aria-label="Close"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {photos && photos.length > 1 && (
          <div className="absolute bottom-2 right-3 bg-surface-dim backdrop-blur-sm px-2 py-0.5 rounded text-caption text-on-surface-variant">
            {photos.length} photos
          </div>
        )}
      </div>

      <EditProvider listingId={listingId}>
      <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden flex-1">
        {hasListingInfo ? (
          <>
            {/* ── Listing path ── */}

            {/* Multi-tenant pill tabs */}
            {listings.length > 1 && (
              <div className="flex gap-1.5 px-4 pt-3 overflow-x-auto">
                {listings.map((l, idx) => (
                  <button
                    key={l.id}
                    onClick={() => { setActiveListingIdx(idx); setActiveTab('overview') }}
                    className={`flex-shrink-0 px-3 py-1 rounded-full text-body-sm transition-colors ${
                      idx === activeListingIdx
                        ? 'bg-surface-container-highest text-on-surface'
                        : 'bg-surface-container text-on-surface-subtle hover:text-on-surface-variant'
                    }`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}


            {/* Title block */}
            <div className="p-4 pb-3">
              <div className="flex items-start gap-3">
                <ListingLogo listing={activeListing} isGuardian={isGuardian} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-headline font-semibold text-on-surface leading-tight">
                    {isGuardian ? (
                      <EditableField value={name} field="name" isGuardian placeholder="Place name">
                        {name}
                      </EditableField>
                    ) : name}
                  </h2>

                  {hasListingInfo && !isResidential && (
                    <div className="mt-1.5 space-y-0.5">
                      {/* Google stars — from imported data */}
                      {rating && (
                        <div className="flex items-center">
                          <span className="text-on-surface font-medium text-body w-8">{Number(rating).toFixed(1)}</span>
                          <StarRating rating={Number(rating)} />
                          {reviewCount && <span className="text-on-surface-subtle text-caption ml-2">({reviewCount}) google</span>}
                        </div>
                      )}
                      {/* Townie fleur-de-lis — community rating */}
                      <div className="flex items-center">
                        <span className="text-on-surface-disabled font-medium text-body w-8">—</span>
                        <FleurRating rating={0} count={0} />
                        <span className="text-on-surface-disabled text-caption ml-2">townie</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {(category || subcategory) && (
                  <>
                    {subcategory && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant text-body-sm">
                        {SUBCATEGORY_LABELS[subcategory] || subcategory}
                      </span>
                    )}
                    {category && !subcategory && (
                      <span className="px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant text-body-sm">
                        {CATEGORY_LABELS[category] || category}
                      </span>
                    )}
                  </>
                )}
                {building?.historic_status && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400/80 text-xs">Historic</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ── Property card path: bare buildings ── */}

            {/* Property headline */}
            <div className="px-4 pt-3 pb-2">
              {styleName ? (
                <>
                  <h2 className="text-headline font-medium text-on-surface leading-tight">{styleName}</h2>
                  {yearBuilt && (
                    <p className="text-body text-on-surface-variant mt-0.5">Built {yearBuilt}</p>
                  )}
                </>
              ) : yearBuilt ? (
                <h2 className="text-headline font-medium text-on-surface leading-tight">Built {yearBuilt}</h2>
              ) : (
                <h2 className="text-headline font-medium text-on-surface-variant leading-tight">
                  {cleanAddress(building?.address) || 'Unknown Building'}
                </h2>
              )}

              {/* Address */}
              {building?.address && (
                <p className="text-body-sm text-on-surface-subtle mt-0.5">{cleanAddress(building.address)}</p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {arch.contributing && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400/80 text-label-sm">Contributing</span>
                )}
                {arch.nps_listed && (
                  <span className="px-2 py-0.5 rounded-md bg-yellow-500/20 text-yellow-300/90 text-label-sm">NPS Listed</span>
                )}
                {arch.district && (
                  <span className="text-on-surface-disabled text-label-sm">{arch.district.replace(' Historic District', '')}</span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Tab bar */}
        <nav aria-label="Place card tabs" className="flex border-b border-outline-variant overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-selected={currentTab === tab.id}
              role="tab"
              className={`flex-shrink-0 px-3 py-2 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-surface-subtle ${currentTab === tab.id ? 'text-on-surface border-b-2 border-on-surface' : 'text-on-surface-subtle hover:text-on-surface-variant'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="p-4">
          {/* About tab: residential or non-residential */}
          {currentTab === 'about' && (
            isResidential ? (
              <ResidentialAboutTab
                listing={activeListing}
                building={building}
                isGuardian={isGuardian}
                history={history}
                description={description}
                hasArchitecture={hasArchitecture}
                photos={photos}
                facadeImage={facadeImage}
                facadeInfo={facadeInfo}
                name={name}
                listingId={listingId}
              />
            ) : (
              <PlaceAboutTab
                listing={activeListing}
                building={building}
                isGuardian={isGuardian}
                history={history}
                description={description}
                hasArchitecture={hasArchitecture}
                photos={photos}
                facadeImage={facadeImage}
                facadeInfo={facadeInfo}
                name={name}
                listingId={listingId}
              />
            )
          )}
          {/* Menu tab */}
          {currentTab === 'menu' && <MenuTab listing={activeListing} building={building} isGuardian={isGuardian} isAdmin={isAdmin} />}
          {/* Reviews tab: ratings + reviews (public) */}
          {currentTab === 'reviews' && (
            <div className="card">
              <ReviewsTab listingId={listingId} isGuardian={isGuardian} />
            </div>
          )}
          {/* Guardians tab: ticker posts + QR codes (guardian/admin only) */}
          {currentTab === 'guardians' && (
            <div className="space-y-5">
              <div className="card">
                <h3 className="section-heading mb-3">Ticker</h3>
                <EventsTab listingId={listingId} isGuardian={isGuardian} />
              </div>
              <div className="card">
                <h3 className="section-heading mb-3">QR Codes</h3>
                <QrTab listingId={listingId} buildingId={building?.id} listingName={name} isAdmin={isAdmin} isResidential={isResidential} />
              </div>
            </div>
          )}
          {/* Community tab: residential public reviews */}
          {currentTab === 'community' && (
            <div className="card">
              <ReviewsTab listingId={listingId} isGuardian={isGuardian} anonymous />
            </div>
          )}
          {/* Lobby tab: private resident posts + QR */}
          {currentTab === 'lobby' && (
            <div className="space-y-5">
              <LobbyTab buildingId={building?.id} />
              <div className="card">
                <h3 className="section-heading mb-3">Resident QR</h3>
                <QrTab listingId={listingId} buildingId={building?.id} listingName={name} isAdmin={isAdmin} isResidential={isResidential} />
              </div>
            </div>
          )}
          {/* Property card tabs */}
          {currentTab === 'property' && (
            <>
              <PropertyTab building={building} facadeInfo={facadeInfo} />
              <div className="mt-3">
                <CaryButton
                  placeName={name}
                  placeId={building?.id}
                  buildingPosition={building?.position}
                  isResidential={true}
                />
              </div>
            </>
          )}
          {currentTab === 'history' && (
            <div className="space-y-3">
              {activeListing?.history?.length > 0 ? (
                <div className="space-y-2">
                  {activeListing.history.map((entry, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-on-surface-subtle text-body-sm font-medium w-12 flex-shrink-0">{entry.year}</span>
                      <p className="text-on-surface-variant text-body-sm leading-relaxed">{entry.event}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-on-surface-disabled text-body-sm italic">No history recorded yet.</p>
              )}
              {building?.architecture?.district && (
                <p className="text-on-surface-variant text-body-sm leading-relaxed">
                  This building is a {building.architecture.contributing ? 'contributing' : 'non-contributing'} structure in the {building.architecture.district}{building.architecture.nps_listed ? ', listed on the National Register of Historic Places' : ''}.
                </p>
              )}
            </div>
          )}
          {currentTab === 'photos' && (
            <PhotosTab photos={null} facadeImage={facadeImage} facadeInfo={facadeInfo} name={name} isGuardian={false} listingId={null} />
          )}
        </div>
      </div>

      </EditProvider>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-outline bg-surface-container flex-shrink-0 flex items-center gap-2">
        {/* Left: context-sensitive status / CTA */}

        {/* Residential: verified resident badge */}
        {isResidential && isResidentHere && (
          <div className="flex-1 flex items-center gap-2 text-[#7A8B6F] text-body-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
            </svg>
            <span>Verified Resident</span>
            {residentCount != null && residentCount > 1 && (
              <span className="text-on-surface-disabled">&middot; {residentCount} neighbors</span>
            )}
          </div>
        )}

        {/* Residential: pending resident — gentle nudge */}
        {isResidential && !isResidentHere && residenceBuildingId === building?.id && residenceStatus === 'pending' && (
          <div className="flex-1 text-on-surface-disabled text-caption">
            Scan a Resident QR in your building or ask a neighbor to share theirs.
          </div>
        )}

        {/* Residential: not a resident — admin gets "I live here", others see info text */}
        {isResidential && !isResidentHere && !(residenceBuildingId === building?.id && residenceStatus === 'pending') && (
          isStoreAdmin ? (
            <button
              onClick={handleClaimResidence}
              disabled={claimingResidence}
              className="flex-1 py-1.5 px-3 rounded-lg bg-[#7A8B6F]/20 hover:bg-[#7A8B6F]/30 text-[#7A8B6F] text-body-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
              </svg>
              {claimingResidence ? 'Claiming...' : 'I live here'}
            </button>
          ) : (
            <div className="flex-1 flex items-center gap-2 text-on-surface-subtle text-body-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
              </svg>
              <span>Live here? Ask a neighbor for their Resident code.</span>
            </div>
          )
        )}

        {/* Residential: verified resident — manage link */}
        {isResidential && isResidentHere && (
          <a
            href={`mailto:hello@lafayette-square.com?subject=${encodeURIComponent('Manage: ' + name)}`}
            className="text-caption text-on-surface-disabled hover:text-on-surface-subtle transition-colors"
          >
            Manage?
          </a>
        )}

        {/* Non-residential: guardian badge */}
        {!isResidential && hasListingInfo && isGuardian && (
          <div className="flex-1 flex items-center gap-2 text-emerald-400/70 text-body-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            You are the guardian of this place
          </div>
        )}

        {/* Non-residential: claim CTA */}
        {!isResidential && hasListingInfo && !isGuardian && (
          <a
            href={`mailto:hello@lafayette-square.com?subject=${encodeURIComponent('My place: ' + name)}`}
            className="flex-1 py-1.5 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Is this your place?
          </a>
        )}

        {/* Bare building: house CTA */}
        {!hasListingInfo && (
          <a
            href={`mailto:hello@lafayette-square.com?subject=${encodeURIComponent('My place: ' + (cleanAddress(building?.address) || 'Unknown'))}`}
            className="flex-1 py-1.5 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
            </svg>
            This is my house
          </a>
        )}

        {/* Right: share icon */}
        <button
          onClick={() => {
            const typeLabel = hasListingInfo ? 'place' : 'house'
            const vanity = 'https://lafayette-square.com'
            const placeUrl = listingId ? `${vanity}/place/${listingId}` : vanity
            const shareText = `Check out this ${typeLabel} in Lafayette Square!\n${placeUrl}`

            if (navigator.share) {
              navigator.share({ text: shareText }).catch(() => {})
            } else {
              navigator.clipboard?.writeText(shareText).catch(() => {})
            }
          }}
          className="w-9 h-9 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors flex items-center justify-center"
          aria-label="Share"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3v11.25" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default PlaceCard
