import React, { useMemo, useState, useEffect, useCallback, useContext } from 'react'
import { CATEGORY_LABELS, SUBCATEGORY_LABELS } from '../tokens/categories'
import { TAGS_BY_GROUP, TAG_BY_ID, SUBCATEGORY_TAG_IDS, primaryTagToCategory } from '../tokens/tags'
import useGuardianStatus from '../hooks/useGuardianStatus'
import useListings from '../hooks/useListings'
import useCamera from '../hooks/useCamera'
import useSelectedBuilding from '../hooks/useSelectedBuilding'
import { getReviews, postReview, postReply, postEvent, updateListing as apiUpdateListing, getClaimSecret, getClaimSecretAdmin, getQrDesign, uploadPhoto as apiUploadPhoto, removePhoto as apiRemovePhoto } from '../lib/api'
import compressImage from '../lib/compressImage'
import { getDeviceHash } from '../lib/device'
import useHandle from '../hooks/useHandle'
import useEvents from '../hooks/useEvents'
import AvatarCircle from './AvatarCircle'

import QRCode from 'qrcode'
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
            <linearGradient id="half">
              <stop offset="50%" stopColor="currentColor" />
              <stop offset="50%" stopColor="#4a4a4a" />
            </linearGradient>
          </defs>
          <path fill="url(#half)" d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
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
              <svg className="w-3 h-3 transform group-open:rotate-180 transition-transform ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
function OverviewTab({ listing, building, isGuardian }) {
  const address = listing?.address || building?.address || null
  const phone = listing?.phone || null
  const website = listing?.website || null
  const hours = listing?.hours || null
  const rentRange = building?.rent_range || null
  const amenities = listing?.amenities || null
  const listingId = listing?.id

  const openStatus = useMemo(() => getOpenStatus(hours), [hours])
  const formattedHours = useMemo(() => formatHoursDisplay(hours), [hours])

  // Build contact items for inline/stacked layout
  const contactItems = []
  if (address || isGuardian) {
    contactItems.push(isGuardian
      ? <EditableField key="addr" value={address} field="address" isGuardian placeholder="Add address..." />
      : <span key="addr">{address ? `${address}, St. Louis, MO` : <em className="text-on-surface-disabled">Address unknown</em>}</span>
    )
  }
  if (phone || isGuardian) {
    contactItems.push(isGuardian
      ? <EditableField key="phone" value={phone} field="phone" isGuardian placeholder="Add phone..." />
      : phone ? <a key="phone" href={`tel:${phone}`} className="text-blue-400 hover:text-blue-300 transition-colors">{phone}</a> : null
    )
  }
  if (website || isGuardian) {
    contactItems.push(isGuardian
      ? <EditableField key="web" value={website} field="website" isGuardian placeholder="Add website..." />
      : website ? <a key="web" href={website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">{website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a> : null
    )
  }
  if (rentRange) {
    contactItems.push(<span key="rent">{rentRange}</span>)
  }
  const visibleItems = contactItems.filter(Boolean)

  return (
    <div className="space-y-3">
      {/* Contact info: inline with bullet separators, wrapping as needed */}
      {visibleItems.length > 0 && (
        <div className="text-body text-on-surface-variant flex flex-wrap items-center gap-x-1 gap-y-0.5">
          {visibleItems.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-on-surface-disabled mx-0.5">&bull;</span>}
              {item}
            </React.Fragment>
          ))}
        </div>
      )}

      {isGuardian ? (
        <HoursEditor hours={hours} listingId={listingId} />
      ) : formattedHours ? (
        <details className="group mt-1">
          <summary className="cursor-pointer text-body text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2">
            <svg className="w-4 h-4 text-on-surface-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className={openStatus.isOpen ? 'text-green-400' : openStatus.isOpen === false ? 'text-red-400' : ''}>
              {openStatus.text}
            </span>
            <svg className="w-3 h-3 transform group-open:rotate-180 transition-transform ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="mt-2 ml-6 space-y-1">
            {formattedHours.map(({ day, hours }) => (
              <div key={day} className="flex justify-between text-body-sm">
                <span className="text-on-surface-subtle">{day}</span>
                <span className={hours === 'Closed' ? 'text-on-surface-disabled' : 'text-on-surface-variant'}>{hours}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <TagPicker listing={listing} isGuardian={isGuardian} />

      {(listing?.description || isGuardian) && (
        <div className="mt-2">
          {isGuardian ? (
            <EditableField value={listing?.description || ''} field="description" isGuardian placeholder="Add description..." multiline>
              {listing?.description ? (
                <p className="text-body-sm text-on-surface-variant leading-relaxed">{listing.description}</p>
              ) : (
                <p className="text-body-sm text-on-surface-disabled italic">Add description...</p>
              )}
            </EditableField>
          ) : (
            <p className="text-body-sm text-on-surface-variant leading-relaxed">{listing.description}</p>
          )}
        </div>
      )}

      {/* Action links: reservations, menu */}
      {(listing?.reservation_url || listing?.menu_url || isGuardian) && (
        <div className="flex flex-wrap gap-2 mt-1">
          {isGuardian ? (
            <>
              <EditableField value={listing?.reservation_url || ''} field="reservation_url" isGuardian placeholder="Add reservations link...">
                {listing?.reservation_url ? (
                  <a href={listing.reservation_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-body-sm font-medium px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface hover:text-on-surface transition-colors" onClick={e => e.stopPropagation()}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Reservations
                  </a>
                ) : (
                  <span className="text-body-sm text-on-surface-disabled italic">+ Reservations link</span>
                )}
              </EditableField>
              <EditableField value={listing?.menu_url || ''} field="menu_url" isGuardian placeholder="Add menu link...">
                {listing?.menu_url ? (
                  <a href={listing.menu_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-body-sm font-medium px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface hover:text-on-surface transition-colors" onClick={e => e.stopPropagation()}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    Menu
                  </a>
                ) : (
                  <span className="text-body-sm text-on-surface-disabled italic">+ Menu link</span>
                )}
              </EditableField>
            </>
          ) : (
            <>
              {listing?.reservation_url && (
                <a href={listing.reservation_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-body-sm font-medium px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface hover:text-on-surface transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Reservations
                </a>
              )}
              {listing?.menu_url && (
                <a href={listing.menu_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-body-sm font-medium px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface hover:text-on-surface transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Menu
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Interactive star picker ─────────────────────────────────────────
function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i} type="button"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          className="p-0"
        >
          <svg className={`w-5 h-5 ${(hover || value) >= i ? 'text-yellow-400' : 'text-on-surface-disabled'} fill-current transition-colors`} viewBox="0 0 20 20">
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

// ─── Review form (shown to all non-guardians) ──────────────────────────────
function ReviewForm({ listingId, onSubmitted }) {
  const [text, setText] = useState('')
  const [rating, setRating] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [gateMessage, setGateMessage] = useState(null)
  const handle = useHandle(s => s.handle)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim() || rating === 0) return
    setSubmitting(true)
    setGateMessage(null)
    try {
      const dh = await getDeviceHash()
      const res = await postReview(dh, listingId, text.trim(), rating, handle)
      if (res?.data?.status === 'not_townie' || res?.status === 'not_townie') {
        setGateMessage(res?.data?.message || 'Become a Townie to post reviews \u2014 visit 3 local spots within 14 days by scanning their QR codes.')
      } else {
        setText('')
        setRating(0)
        onSubmitted()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-b border-outline-variant pb-4 mb-4">
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Share your experience..."
        rows={2}
        className="input w-full resize-none"
      />
      {gateMessage && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <p className="text-amber-300/90 text-xs leading-relaxed">{gateMessage}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={submitting || !text.trim() || rating === 0}
        className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {submitting ? 'Posting...' : 'Post Review'}
      </button>
    </form>
  )
}

// ─── Reply form (guardians only) ────────────────────────────────────────────
function ReplyForm({ reviewId, listingId, onSubmitted }) {
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
      onSubmitted()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-2 ml-10">
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Reply as guardian..."
        className="input flex-1 py-1.5"
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
function ReviewsTab({ listingId, isGuardian }) {
  const [reviews, setReviews] = useState([])
  const [loaded, setLoaded] = useState(false)

  const fetchReviews = useCallback(async () => {
    try {
      const res = await getReviews(listingId)
      const data = res.data
      setReviews(Array.isArray(data) ? data : data?.reviews || [])
    } catch { /* silent */ }
    setLoaded(true)
  }, [listingId])

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

  return (
    <div>
      {!isGuardian && <ReviewForm listingId={listingId} onSubmitted={fetchReviews} />}

      {reviews.length === 0 && loaded && (
        <div className="text-center py-6">
          <p className="text-on-surface-subtle text-body">No reviews yet</p>
          <p className="text-on-surface-disabled text-body-sm mt-1">Be the first to rate this place!</p>
        </div>
      )}

      <div className="space-y-4">
        {reviews.map((review, idx) => {
          const displayName = review.handle ? `@${review.handle}` : 'Local'
          const replies = review.replies || []
          return (
            <div key={review.id || idx} className="border-b border-outline-variant pb-4 last:border-0">
              <div className="flex items-start gap-3">
                <AvatarCircle emoji={review.avatar} vignette={review.vignette} size={7} fallback={review.handle ? review.handle[0].toUpperCase() : 'L'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium text-on-surface-medium">{displayName}</span>
                    <span className="text-body-sm text-on-surface-disabled">{relativeTime(review.created_at) || review.time}</span>
                  </div>
                  {review.rating && (
                    <div className="mt-0.5"><StarRating rating={review.rating} size="sm" /></div>
                  )}
                  <p className="text-body text-on-surface-variant mt-1.5">{review.text}</p>
                </div>
              </div>

              {/* Guardian replies */}
              {replies.map((reply, ri) => (
                <div key={reply.id || ri} className="flex items-start gap-2 mt-2 ml-10">
                  <svg className="w-4 h-4 text-emerald-400/70 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-emerald-400/80">{reply.handle ? `@${reply.handle}` : 'Guardian'}</span>
                      <span className="text-caption text-on-surface-disabled">{relativeTime(reply.created_at)}</span>
                    </div>
                    <p className="text-body-sm text-on-surface-variant mt-0.5">{reply.text}</p>
                  </div>
                </div>
              ))}

              {isGuardian && <ReplyForm reviewId={review.id} listingId={listingId} onSubmitted={fetchReviews} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab: History ────────────────────────────────────────────────────
function HistoryTab({ history, description }) {
  return (
    <div className="space-y-3">
      {description && (
        <p className="text-body-sm text-on-surface-variant leading-relaxed">{description}</p>
      )}
      {history && history.length > 0 && (
        <div className="relative ml-3 border-l border-outline pl-4 space-y-4 mt-3">
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
      )}
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
function PropertyTab({ building }) {
  if (!building) return null
  const arch = building.architecture || {}

  return (
    <div className="space-y-2">
      {arch.nps_context && (
        <p className="text-on-surface-variant text-body-sm italic leading-relaxed">
          &ldquo;{arch.nps_context.trim()}&rdquo;
          <span className="text-on-surface-disabled ml-1 not-italic">&mdash; NPS Nomination</span>
        </p>
      )}

      <div className="space-y-1.5">
        {arch.architect && <DetailRow label="Architect">{arch.architect}</DetailRow>}
        {arch.original_owner && <DetailRow label="Built For">{arch.original_owner}</DetailRow>}
        {arch.historic_name && <DetailRow label="Historic Name">{arch.historic_name}</DetailRow>}
        {building.stories && (
          <DetailRow label="Stories">{building.stories} {building.stories === 1 ? 'story' : 'stories'}</DetailRow>
        )}
        {building.year_built && building.year_renovated && (
          <DetailRow label="Renovated">{building.year_renovated}</DetailRow>
        )}
        {arch.nps_style_period && <DetailRow label="Style Period">{arch.nps_style_period}</DetailRow>}
        {arch.renovation_cost && <DetailRow label="Renovation Cost">{arch.renovation_cost}</DetailRow>}
      </div>

      {arch.materials && (
        <div className="mt-2">
          <span className="text-on-surface-subtle text-body-sm">Materials</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {arch.materials.map((m, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-caption">{m}</span>
            ))}
          </div>
        </div>
      )}
      {arch.features && (
        <div className="mt-2">
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

// ─── Tab: Assessment (bare buildings only) ───────────────────────────
function AssessmentTab({ building }) {
  if (!building) return null

  return (
    <div className="space-y-1.5">
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
      {building.units && (
        <DetailRow label="Units">{building.units}</DetailRow>
      )}
      {building.rent_range && (
        <DetailRow label="Rent Range">{building.rent_range}</DetailRow>
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
  const hasAny = lightboxEntries.length > 0

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

  const hero = allPhotos[0]
  const grid = allPhotos.slice(1)

  return (
    <div className="space-y-2">
      {/* Hero photo */}
      {hero && (
        <div className="relative group">
          <button onClick={() => openLightbox(0)} className="w-full block relative rounded-lg overflow-hidden">
            <img src={assetUrl(hero.url)} alt={`${name} 1`} className="w-full aspect-[4/3] object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            {lightboxEntries.length > 1 && (
              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-surface-dim text-on-surface-medium text-body-sm backdrop-blur-sm">
                1 / {lightboxEntries.length}
              </span>
            )}
          </button>
          {isGuardian && (
            <button
              onClick={() => handleRemove(hero.url)}
              disabled={removing === hero.url}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-surface-dim text-on-surface-variant hover:bg-red-500/80 hover:text-on-surface flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              title="Remove photo"
            >
              {removing === hero.url ? (
                <div className="w-3 h-3 border border-on-surface-disabled border-t-on-surface rounded-full animate-spin" />
              ) : (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              )}
            </button>
          )}
        </div>
      )}

      {/* Grid of remaining photos */}
      {grid.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {grid.map((photo, i) => (
            <div key={i} className="relative group">
              <button onClick={() => openLightbox(i + 1)} className="w-full relative rounded-lg overflow-hidden">
                <img src={assetUrl(photo.url)} alt={`${name} ${i + 2}`} className="w-full aspect-square object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </button>
              {isGuardian && (
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
          ))}
        </div>
      )}

      {/* Facade photo */}
      {hasFacade && (
        <div>
          <button onClick={() => openLightbox(allPhotos.length)} className="w-full block relative group rounded-lg overflow-hidden">
            <img src={assetUrl(facadeInfo.photo)} alt={`${name} facade`} className="w-full aspect-[4/3] object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>
          {facadeInfo.description && (
            <p className="text-on-surface-subtle text-body-sm mt-1.5 leading-relaxed">{facadeInfo.description}</p>
          )}
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
        {['event', 'special', 'sale', 'partnership'].map(t => (
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
        placeholder="Event title"
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
        {submitting ? 'Posting...' : 'Post Event'}
      </button>
    </form>
  )
}

// ─── Tab: Events ─────────────────────────────────────────────────────
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

  function formatDateRange(start, end) {
    const opts = { month: 'short', day: 'numeric' }
    const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', opts)
    if (!end || end === start) return s
    const e = new Date(end + 'T12:00:00').toLocaleDateString('en-US', opts)
    return `${s} \u2013 ${e}`
  }

  const TYPE_COLORS = {
    event: 'bg-blue-500/15 text-blue-400',
    special: 'bg-amber-500/15 text-amber-400',
    sale: 'bg-emerald-500/15 text-emerald-400',
    partnership: 'bg-purple-500/15 text-purple-400',
  }

  return (
    <div>
      {isGuardian && <EventForm listingId={listingId} onSubmitted={fetchEvents} />}

      {events.length === 0 && loaded && (
        <div className="text-center py-6">
          <p className="text-on-surface-subtle text-body">No upcoming events</p>
          {isGuardian && <p className="text-on-surface-disabled text-body-sm mt-1">Post your first event above!</p>}
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
                {formatDateRange(event.start_date, event.end_date)}
              </span>
            </div>
            {event.description && (
              <p className="text-body-sm text-on-surface-variant mt-1.5 leading-relaxed">{event.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: QR Codes (guardian / admin) ─────────────────────────────
function QrTab({ listingId, listingName, isAdmin }) {
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
      const local = localStorage.getItem(`lsq-qr-image-${listingId}-${type}`)
      if (local) return local
    } catch { /* silent */ }
    // Fallback: fetch from API (works across all devices)
    try {
      const res = await getQrDesign(listingId, type)
      const image = res?.data?.image
      if (image) {
        // Cache locally for next time
        try { localStorage.setItem(`lsq-qr-image-${listingId}-${type}`, image) } catch { /* silent */ }
        return image
      }
    } catch { /* silent */ }
    return null
  }, [listingId])

  // Listen for lsq-saved from QR Studio iframe to refresh QR codes
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'lsq-saved') setRefreshKey(k => k + 1)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  useEffect(() => {
    const vanity = 'https://jacobhenderson.studio/lafayette-square'
    let cancelled = false

    async function loadQrs() {
      // 1. Generate plain Townie QR instantly (client-side, no network)
      const tUrl = `${vanity}/checkin/${listingId}`
      setTownieUrl(tUrl)
      const plainTownie = await QRCode.toDataURL(tUrl, { width: 256, margin: 2 })
      if (!cancelled) {
        setTownieQr(plainTownie)
        setStyledLoading(true)
        setLoading(false) // Plain QRs ready — show UI immediately
      }

      // 2. Fetch guardian secret + generate plain Guardian QR
      try {
        const dh = await getDeviceHash()
        const res = isAdmin
          ? await getClaimSecretAdmin(listingId)
          : await getClaimSecret(listingId, dh)
        const secret = res?.data?.claim_secret
        if (secret && !cancelled) {
          setClaimSecret(secret)
          const gUrl = `${vanity}/claim/${listingId}/${secret}`
          setGuardianUrl(gUrl)
          const plainGuardian = await QRCode.toDataURL(gUrl, { width: 256, margin: 2 })
          if (!cancelled) setGuardianQr(plainGuardian)
        }
      } catch { /* silent */ }

      // 3. Upgrade to styled versions in background
      try {
        const styledTownie = await readStyledImage('Townie')
        if (styledTownie && !cancelled) setTownieQr(styledTownie)
      } catch { /* silent */ }
      try {
        const styledGuardian = await readStyledImage('Guardian')
        if (styledGuardian && !cancelled) setGuardianQr(prev => prev ? styledGuardian : prev)
      } catch { /* silent */ }
      if (!cancelled) setStyledLoading(false)
    }

    loadQrs()
    return () => { cancelled = true }
  }, [listingId, isAdmin, refreshKey, readStyledImage])

  const shareUrl = async (url, title) => {
    if (navigator.share) {
      try { await navigator.share({ title, url }) } catch { /* silent */ }
    } else {
      try { await navigator.clipboard.writeText(url) } catch { /* silent */ }
    }
  }

  const openQrStudio = () => {
    useCodeDesk.getState().setOpen(true, { listingId, qrType: 'Townie', claimSecret, mode: 'guardian', placeName: listingName })
  }

  return (
    <div className="space-y-4">
      {/* Townie QR */}
      <div className="rounded-lg bg-surface-container border border-outline-variant p-4">
        <div className="text-body font-medium text-on-surface mb-0.5">Townie</div>
        <div className="text-caption text-on-surface-subtle mb-3">For customers to check in</div>
        {townieQr && (
          <div className="flex justify-center mb-3">
            <img src={townieQr} alt="Townie QR" className={`w-48 rounded-lg transition-opacity duration-300${styledLoading ? ' opacity-60 animate-pulse' : ''}`} />
          </div>
        )}
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
      </div>

      {/* Guardian QR — hidden behind reveal toggle */}
      {(loading || (styledLoading && !guardianQr)) ? (
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
                className={`w-48 rounded-lg pointer-events-none select-none transition-opacity duration-300${styledLoading ? ' opacity-60 animate-pulse' : ''}`}
                draggable={false}
                style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Design button */}
      <button
        onClick={openQrStudio}
        className="w-full py-2.5 px-4 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface hover:text-on-surface text-body font-medium transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
        </svg>
        Design in QR Studio
      </button>
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
  const panelOpen = useCamera(s => s.panelOpen)
  const panelCollapsedPx = useCamera(s => s.panelCollapsedPx)
  const initialTab = useSelectedBuilding(s => s.initialTab)

  // Subscribe to store so guardian edits trigger re-render
  const storeListing = useListings(s => listingProp?.id ? s.listings.find(l => l.id === listingProp.id) : null)
  const storeAllListings = useListings(s => building?.id ? s.listings.filter(l => l.building_id === building.id) : [])
  const listing = storeListing || listingProp
  const allListings = storeAllListings.length > 0 ? storeAllListings : allListingsProp

  // Multi-tenant: if multiple listings for this building, show tabs
  const listings = allListings && allListings.length > 1 ? allListings : (listing ? [listing] : [])
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
  const heroPhoto = photos?.[0] || facadeImage?.thumb_1024 || facadeInfo?.photo || null
  const history = activeListing?.history || null
  const description = activeListing?.description || null
  const hasListingInfo = !!activeListing
  const listingId = activeListing?.id || null
  const isAdmin = import.meta.env.DEV || isStoreAdmin
  const isGuardian = isAdmin || (listingId ? isGuardianOf(listingId) : false)

  const placeholderPhotos = getPlaceholderPhotos(category)

  // Architecture data for property card (bare buildings)
  const arch = building?.architecture || {}
  const yearBuilt = building?.year_built || arch.year_built
  const styleName = arch.style || building?.style
  const hasPropertyData = !!(yearBuilt || styleName || arch.materials || arch.nps_context || arch.architect)
  const hasAssessment = !!(building?.assessed_value || building?.building_sqft || building?.lot_acres || building?.zoning)

  // Build dynamic tabs based on available data
  const hasHistory = !!(history?.length || description)
  const hasArchitecture = !!(building && (building.year_built || building.style || building.architect || building.historic_status || building.architecture))

  const tabs = useMemo(() => {
    if (hasListingInfo) {
      // ── Listing path ──
      const t = [{ id: 'overview', label: 'Overview' }]
      t.push({ id: 'reviews', label: 'Reviews' })
      t.push({ id: 'events', label: 'Events' })
      if (hasHistory) t.push({ id: 'history', label: 'History' })
      if (hasArchitecture) t.push({ id: 'architecture', label: 'Details' })
      t.push({ id: 'photos', label: 'Photos' })
      if (isGuardian || isAdmin) t.push({ id: 'qr', label: 'QR' })
      return t
    }
    // ── Property card path: bare buildings ──
    const t = []
    if (hasPropertyData) t.push({ id: 'property', label: 'Property' })
    if (hasHistory) t.push({ id: 'history', label: 'History' })
    t.push({ id: 'photos', label: 'Photos' })
    if (hasAssessment) t.push({ id: 'assessment', label: 'Assessment' })
    return t
  }, [hasListingInfo, hasHistory, hasArchitecture, hasPropertyData, hasAssessment, isGuardian, isAdmin])

  // Default tab: first available
  const defaultTab = tabs[0]?.id || 'photos'
  const currentTab = activeTab && tabs.some(t => t.id === activeTab) ? activeTab : defaultTab

  // Consume initialTab from store (e.g. EventTicker → Events tab)
  useEffect(() => {
    if (initialTab && tabs.some(t => t.id === initialTab)) {
      setActiveTab(initialTab)
      useSelectedBuilding.getState().clearInitialTab()
    }
  }, [initialTab, tabs])

  // Style-tinted gradient for bare buildings
  const styleGradient = !hasListingInfo ? getStyleGradient(arch.nps_style_group) : null


  return (
    <div role="dialog" aria-modal="true" aria-label={name} className="absolute top-3 left-3 right-3 bg-surface sm:bg-surface-glass sm:backdrop-blur-2xl sm:backdrop-saturate-150 rounded-2xl text-on-surface shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-outline overflow-hidden flex flex-col z-50" style={{ bottom: panelOpen ? 'calc(35dvh - 1.5rem + 18px)' : `${(panelCollapsedPx || 76) + 18}px` }}>
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
      <div className="overflow-y-auto flex-1">
        {hasListingInfo ? (
          <>
            {/* ── Listing path: everything unchanged ── */}

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
                {activeListing?.logo && (
                  <img src={assetUrl(activeListing.logo)} alt="" className="w-10 h-10 rounded-lg object-contain bg-surface-container-high flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-headline font-semibold text-on-surface leading-tight">
                    {isGuardian ? (
                      <EditableField value={name} field="name" isGuardian placeholder="Place name">
                        {name}
                      </EditableField>
                    ) : name}
                  </h2>

                  {hasListingInfo && (
                    <div className="flex items-center gap-2 mt-1">
                      {rating ? (
                        <>
                          <span className="text-on-surface font-medium text-body">{Number(rating).toFixed(1)}</span>
                          <StarRating rating={Number(rating)} />
                          {reviewCount && <span className="text-on-surface-subtle text-body-sm">({reviewCount})</span>}
                        </>
                      ) : (
                        <>
                          <StarRating rating={0} />
                          <span className="text-on-surface-disabled text-body-sm">No local reviews yet</span>
                        </>
                      )}
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
              {(yearBuilt || styleName) ? (
                <h2 className="text-headline font-medium text-on-surface leading-tight">
                  {yearBuilt && <span>{yearBuilt}</span>}
                  {yearBuilt && styleName && <span> </span>}
                  {styleName && <span>{styleName}</span>}
                </h2>
              ) : (
                <h2 className="text-headline font-medium text-on-surface-variant leading-tight">
                  {cleanAddress(building?.address) || 'Unknown Building'}
                </h2>
              )}

              {/* Address (below headline when we have year/style) */}
              {(yearBuilt || styleName) && building?.address && (
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
          {/* Listing tabs (unchanged) */}
          {currentTab === 'overview' && (
            <OverviewTab listing={activeListing} building={building} isGuardian={isGuardian} />
          )}
          {currentTab === 'reviews' && <ReviewsTab listingId={listingId} isGuardian={isGuardian} />}
          {currentTab === 'events' && <EventsTab listingId={listingId} isGuardian={isGuardian} />}
          {currentTab === 'architecture' && <ArchitectureTab building={building} />}
          {/* Shared tabs */}
          {currentTab === 'history' && <HistoryTab history={history} description={description} />}
          {currentTab === 'photos' && <PhotosTab photos={photos} facadeImage={facadeImage} facadeInfo={facadeInfo} name={name} isGuardian={isGuardian} listingId={listingId} />}
          {currentTab === 'qr' && <QrTab listingId={listingId} listingName={name} isAdmin={isAdmin} />}
          {/* Property card tabs */}
          {currentTab === 'property' && <PropertyTab building={building} />}
          {currentTab === 'assessment' && <AssessmentTab building={building} />}
        </div>
      </div>

      </EditProvider>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-outline bg-surface-container flex-shrink-0 flex items-center gap-2">
        {/* Left: guardian badge or claim CTA or house CTA */}
        {hasListingInfo && isGuardian && (
          <div className="flex-1 flex items-center gap-2 text-emerald-400/70 text-body-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            You are the guardian of this place
          </div>
        )}
        {hasListingInfo && !isGuardian && (
          <a
            href={`mailto:lafayette-square@jacobhenderson.studio?subject=${encodeURIComponent('My place: ' + name)}`}
            className="flex-1 py-1.5 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Is this your place?
          </a>
        )}
        {!hasListingInfo && (
          <a
            href={`mailto:lafayette-square@jacobhenderson.studio?subject=${encodeURIComponent('My place: ' + (cleanAddress(building?.address) || 'Unknown'))}`}
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
            const vanity = 'https://jacobhenderson.studio/lafayette-square'
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
