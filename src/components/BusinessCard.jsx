import { useMemo, useState, useEffect, useCallback } from 'react'
import { CATEGORY_LABELS, SUBCATEGORY_LABELS } from '../tokens/categories'
import useLocalStatus from '../hooks/useLocalStatus'
import useGuardianStatus from '../hooks/useGuardianStatus'
import useCamera from '../hooks/useCamera'
import { getReviews, postReview, getEvents, postEvent, getBusinessTags } from '../lib/api'
import { getDeviceHash } from '../lib/device'
import ManageTab from './ManageTab'

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

  return <div className="flex gap-0.5">{stars}</div>
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

// ─── Detail row helper ───────────────────────────────────────────────
function DetailRow({ label, children }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-white/40">{label}</span>
      <span className="text-white/70 text-right">{children}</span>
    </div>
  )
}

// ─── Tab: Overview ───────────────────────────────────────────────────
function OverviewTab({ address, phone, website, hours, openStatus, formattedHours, building, category, subcategory, rentRange, amenities }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <svg className="w-4 h-4 text-white/40 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="text-sm text-white/70">{address ? `${address}, St. Louis, MO` : <em className="text-white/30">Address unknown</em>}</span>
      </div>

      {phone && (
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <a href={`tel:${phone}`} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">{phone}</a>
        </div>
      )}

      {website && (
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <a href={website} target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors truncate">
            {website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        </div>
      )}

      {rentRange && (
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-white/70">{rentRange}</span>
        </div>
      )}

      {formattedHours && (
        <details className="group mt-1">
          <summary className="cursor-pointer text-sm text-white/60 hover:text-white/80 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div key={day} className="flex justify-between text-xs">
                <span className="text-white/50">{day}</span>
                <span className={hours === 'Closed' ? 'text-white/30' : 'text-white/70'}>{hours}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {amenities && amenities.length > 0 && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1.5">
            {amenities.map((a, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-white/8 text-white/60 text-[10px]">{a}</span>
            ))}
          </div>
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
          <svg className={`w-5 h-5 ${(hover || value) >= i ? 'text-yellow-400' : 'text-white/20'} fill-current transition-colors`} viewBox="0 0 20 20">
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

// ─── Review form (locals only) ──────────────────────────────────────
function ReviewForm({ businessId, onSubmitted }) {
  const [text, setText] = useState('')
  const [rating, setRating] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim() || rating === 0) return
    setSubmitting(true)
    try {
      const dh = await getDeviceHash()
      await postReview(dh, businessId, text.trim(), rating)
      setText('')
      setRating(0)
      onSubmitted()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-b border-white/10 pb-4 mb-4">
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Share your experience..."
        rows={2}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-white/25"
      />
      <button
        type="submit"
        disabled={submitting || !text.trim() || rating === 0}
        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {submitting ? 'Posting...' : 'Post Review'}
      </button>
    </form>
  )
}

// ─── Tab: Reviews ────────────────────────────────────────────────────
function ReviewsTab({ businessId, isLocal }) {
  const [reviews, setReviews] = useState([])
  const [loaded, setLoaded] = useState(false)

  const fetchReviews = useCallback(async () => {
    try {
      const res = await getReviews(businessId)
      setReviews(res.data?.reviews || [])
    } catch { /* silent */ }
    setLoaded(true)
  }, [businessId])

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
      {isLocal && <ReviewForm businessId={businessId} onSubmitted={fetchReviews} />}

      {!isLocal && (
        <div className="text-center py-2 mb-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-white/40 text-xs">Scan a QR code at a local business to unlock reviews</p>
        </div>
      )}

      {reviews.length === 0 && loaded && (
        <div className="text-center py-6">
          <p className="text-white/40 text-sm">No reviews yet</p>
          {isLocal && <p className="text-white/30 text-xs mt-1">Be the first to review!</p>}
        </div>
      )}

      <div className="space-y-4">
        {reviews.map((review, idx) => (
          <div key={review.id || idx} className="border-b border-white/10 pb-4 last:border-0">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                L
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white/80">Local</span>
                  <span className="text-xs text-white/30">{relativeTime(review.created_at) || review.time}</span>
                </div>
                {review.rating && (
                  <div className="mt-0.5"><StarRating rating={review.rating} size="sm" /></div>
                )}
                <p className="text-sm text-white/70 mt-1.5">{review.text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: History ────────────────────────────────────────────────────
function HistoryTab({ history, description }) {
  return (
    <div className="space-y-3">
      {description && (
        <p className="text-xs text-white/60 leading-relaxed">{description}</p>
      )}
      {history && history.length > 0 && (
        <div className="relative ml-3 border-l border-white/15 pl-4 space-y-4 mt-3">
          {history.map((item, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-amber-500/70 border border-amber-400/50" />
              <div className="text-xs">
                <span className="text-amber-400/80 font-medium">{item.year}</span>
                <p className="text-white/60 mt-0.5 leading-relaxed">{item.event}</p>
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
        <div className="flex justify-between text-xs items-center">
          <span className="text-white/40">Historic Status</span>
          <span className="bg-amber-500/20 text-amber-400 text-xs px-1.5 py-0.5 rounded">{building.historic_status}</span>
        </div>
      )}
      {arch?.district && (
        <DetailRow label="District">{arch.district}</DetailRow>
      )}
      {arch?.materials && (
        <div className="mt-2">
          <span className="text-white/40 text-xs">Materials</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {arch.materials.map((m, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-white/8 text-white/60 text-[10px]">{m}</span>
            ))}
          </div>
        </div>
      )}
      {arch?.features && (
        <div className="mt-2">
          <span className="text-white/40 text-xs">Features</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {arch.features.map((f, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-white/8 text-white/60 text-[10px]">{f}</span>
            ))}
          </div>
        </div>
      )}
      {arch?.renovation_cost && (
        <DetailRow label="Renovation Cost">{arch.renovation_cost}</DetailRow>
      )}

      {/* Assessment section */}
      {(building.assessed_value || building.building_sqft || building.lot_acres || building.zoning) && (
        <>
          <div className="border-t border-white/10 mt-3 pt-2">
            <span className="text-white/30 text-[10px] uppercase tracking-wider">Assessment</span>
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

// ─── Tab: Photos ─────────────────────────────────────────────────────
function PhotosTab({ photos, facadeImage, name }) {
  const allPhotos = photos || (facadeImage ? [facadeImage.thumb_2048 || facadeImage.thumb_1024] : [])

  if (allPhotos.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-white/40 text-sm">No photos yet</p>
        <p className="text-white/30 text-xs mt-1">Be the first to add a photo</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {allPhotos.map((url, i) => (
        <img key={i} src={url} alt={`${name} ${i + 1}`} className="w-full rounded-lg" loading="lazy" />
      ))}
      {!photos && facadeImage && (
        <p className="text-white/40 text-xs text-center">Street view - Mapillary</p>
      )}
    </div>
  )
}

// ─── Event form (guardians only) ─────────────────────────────────────
function EventForm({ businessId, onSubmitted }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !startDate) return
    setSubmitting(true)
    try {
      const dh = await getDeviceHash()
      await postEvent(dh, businessId, title.trim(), description.trim(), startDate, endDate || startDate)
      setTitle('')
      setDescription('')
      setStartDate('')
      setEndDate('')
      onSubmitted()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-b border-white/10 pb-4 mb-4">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Event title"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/25"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-white/25"
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-white/40 block mb-0.5">Start</label>
          <input
            type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/25 [color-scheme:dark]"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-white/40 block mb-0.5">End</label>
          <input
            type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/25 [color-scheme:dark]"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting || !title.trim() || !startDate}
        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {submitting ? 'Posting...' : 'Post Event'}
      </button>
    </form>
  )
}

// ─── Tab: Events ─────────────────────────────────────────────────────
function EventsTab({ businessId, isGuardian }) {
  const [events, setEvents] = useState([])
  const [loaded, setLoaded] = useState(false)

  const fetchEvents = useCallback(async () => {
    try {
      const res = await getEvents()
      const all = res.data?.events || []
      const now = new Date().toISOString().slice(0, 10)
      setEvents(
        all
          .filter(e => e.business_id === businessId && e.end_date >= now)
          .sort((a, b) => a.start_date.localeCompare(b.start_date))
      )
    } catch { /* silent */ }
    setLoaded(true)
  }, [businessId])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  function formatDateRange(start, end) {
    const opts = { month: 'short', day: 'numeric' }
    const s = new Date(start + 'T12:00:00').toLocaleDateString('en-US', opts)
    if (!end || end === start) return s
    const e = new Date(end + 'T12:00:00').toLocaleDateString('en-US', opts)
    return `${s} – ${e}`
  }

  return (
    <div>
      {isGuardian && <EventForm businessId={businessId} onSubmitted={fetchEvents} />}

      {events.length === 0 && loaded && (
        <div className="text-center py-6">
          <p className="text-white/40 text-sm">No upcoming events</p>
          {isGuardian && <p className="text-white/30 text-xs mt-1">Post your first event above!</p>}
        </div>
      )}

      <div className="space-y-3">
        {events.map((event, idx) => (
          <div key={event.id || idx} className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-medium text-white">{event.title}</h4>
              <span className="text-[10px] text-white/40 whitespace-nowrap flex-shrink-0">
                {formatDateRange(event.start_date, event.end_date)}
              </span>
            </div>
            {event.description && (
              <p className="text-xs text-white/60 mt-1.5 leading-relaxed">{event.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// Main BusinessCard
// ═════════════════════════════════════════════════════════════════════
function BusinessCard({ landmark, building, onClose }) {
  const [activeTab, setActiveTab] = useState('overview')
  const { isLocal } = useLocalStatus()
  const { isGuardianOf } = useGuardianStatus()
  const panelOpen = useCamera((s) => s.panelOpen)

  // Merge data from landmark and building — landmark wins for shared fields
  const name = landmark?.name || building?.name || 'Unknown Building'
  const address = landmark?.address || building?.address || null
  const phone = landmark?.phone || building?.phone || null
  const website = landmark?.website || building?.website || null
  const category = landmark?.category || building?.category || null
  const subcategory = landmark?.subcategory || null
  const hours = landmark?.hours || building?.hours || null
  const rating = landmark?.rating || building?.rating || (landmark ? 3.5 + (name.length % 15) / 10 : null)
  const reviewCount = landmark?.review_count || building?.review_count || null
  const photos = landmark?.photos || building?.photos || null
  const facadeImage = building?.facade_image || null
  const heroPhoto = photos?.[0] || facadeImage?.thumb_1024 || null
  const rentRange = building?.rent_range || null
  const amenities = landmark?.amenities || building?.amenities || null
  const history = landmark?.history || building?.history || null
  const description = landmark?.description || building?.description || null
  const hasLandmarkInfo = !!landmark
  const businessId = landmark?.id || building?.id || null
  const isAdmin = import.meta.env.DEV
  const isGuardian = isAdmin || (businessId ? isGuardianOf(businessId) : false)

  // Fetch guardian tags
  const [guardianTags, setGuardianTags] = useState(null)
  useEffect(() => {
    if (!isGuardian || !businessId) return
    getBusinessTags(businessId).then(res => {
      const d = res.data
      if (d) setGuardianTags({ primary: d.primary_tag, tags: d.tags || [] })
    }).catch(() => {})
  }, [isGuardian, businessId])

  const openStatus = useMemo(() => getOpenStatus(hours), [hours])
  const formattedHours = useMemo(() => formatHoursDisplay(hours), [hours])
  const placeholderPhotos = getPlaceholderPhotos(category)

  // Build dynamic tabs based on available data
  const hasHistory = !!(history?.length || description)
  const hasArchitecture = !!(building && (building.year_built || building.style || building.architect || building.historic_status || building.architecture))

  const tabs = useMemo(() => {
    const t = [{ id: 'overview', label: 'Overview' }]
    if (hasLandmarkInfo) t.push({ id: 'reviews', label: 'Reviews' })
    if (hasLandmarkInfo) t.push({ id: 'events', label: 'Events' })
    if (hasHistory) t.push({ id: 'history', label: 'History' })
    if (hasArchitecture) t.push({ id: 'architecture', label: 'Details' })
    t.push({ id: 'photos', label: 'Photos' })
    if (isGuardian) t.push({ id: 'manage', label: 'Tags' })
    return t
  }, [hasLandmarkInfo, hasHistory, hasArchitecture, isGuardian])

  return (
    <div className="absolute top-3 left-3 right-3 bg-black/95 backdrop-blur-md rounded-xl text-white shadow-2xl border border-white/10 overflow-hidden flex flex-col z-50" style={{ bottom: 'calc(35dvh - 1.5rem + 18px)' }}>
      {/* Hero Photo Area */}
      <div className="relative h-28 bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden flex-shrink-0">
        {heroPhoto ? (
          <img src={heroPhoto} alt={name} className="w-full h-full object-cover" />
        ) : hasLandmarkInfo ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${placeholderPhotos[0]}, ${placeholderPhotos[1]})` }}
          >
            <div className="text-center text-white/30">
              <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-xs">No photos yet</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900">
            <div className="text-center text-white/20">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {photos && photos.length > 1 && (
          <div className="absolute bottom-2 right-3 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-white/70">
            {photos.length} photos
          </div>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {/* Title block */}
        <div className="p-4 pb-3">
          <h2 className="text-xl font-semibold text-white leading-tight">{name}</h2>

          {rating && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-white font-medium text-sm">{rating.toFixed(1)}</span>
              <StarRating rating={rating} />
              {reviewCount && <span className="text-white/50 text-xs">({reviewCount})</span>}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 mt-2">
            {(category || subcategory) && (
              <>
                {subcategory && (
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/70 text-xs">
                    {SUBCATEGORY_LABELS[subcategory] || subcategory}
                  </span>
                )}
                {category && !subcategory && (
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/70 text-xs">
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

        {/* Tab bar */}
        <div className="flex border-b border-white/10 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium transition-colors ${activeTab === tab.id ? 'text-white border-b-2 border-white' : 'text-white/50 hover:text-white/70'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4">
          {activeTab === 'overview' && (
            <OverviewTab
              address={address} phone={phone} website={website}
              hours={hours} openStatus={openStatus} formattedHours={formattedHours}
              building={building} category={category} subcategory={subcategory}
              rentRange={rentRange} amenities={amenities}
            />
          )}
          {activeTab === 'reviews' && <ReviewsTab businessId={businessId} isLocal={isLocal} />}
          {activeTab === 'events' && <EventsTab businessId={businessId} isGuardian={isGuardian} />}
          {activeTab === 'history' && <HistoryTab history={history} description={description} />}
          {activeTab === 'architecture' && <ArchitectureTab building={building} />}
          {activeTab === 'photos' && <PhotosTab photos={photos} facadeImage={facadeImage} name={name} />}
          {activeTab === 'manage' && isGuardian && (
            <ManageTab
              businessId={businessId}
              initialPrimary={guardianTags?.primary || subcategory}
              initialTags={guardianTags?.tags?.length ? guardianTags.tags : [subcategory].filter(Boolean)}
            />
          )}
        </div>
      </div>

      {hasLandmarkInfo && (
        <div className="p-4 pt-2 border-t border-white/10 bg-black/95 flex-shrink-0">
          {isGuardian ? (
            <div className="flex items-center justify-center gap-2 text-emerald-400/70 text-xs py-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              You are the guardian of this business
            </div>
          ) : (
            <button
              onClick={() => setActiveTab('events')}
              className="w-full py-2.5 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Is this your business?
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default BusinessCard
