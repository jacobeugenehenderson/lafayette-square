import { useEffect, useState, useRef } from 'react'
import SunCalc from 'suncalc'
import Scene from './components/Scene'
import SceneBoundary from './components/SceneBoundary'
import Controls from './components/Controls'
import CompassRose from './components/CompassRose'
import SidePanel from './components/SidePanel'
import BulletinModal from './components/BulletinModal'
import ContactModal, { useContact } from './components/ContactModal'
import CodeDeskModal, { useCodeDesk } from './components/CodeDeskModal'
import EventTicker from './components/EventTicker'
import useCamera from './hooks/useCamera'
import useTimeOfDay from './hooks/useTimeOfDay'
import useSelectedBuilding from './hooks/useSelectedBuilding'
import useBulletin from './hooks/useBulletin'
import useListings from './hooks/useListings'
import useHandle from './hooks/useHandle'
import './hooks/useInit' // batch init — fires on import
import CheckinPage from './pages/CheckinPage'
import ClaimPage from './pages/ClaimPage'
import LinkPage from './pages/LinkPage'
import QRCode from 'qrcode'
import { createLinkToken, checkLinkToken } from './lib/api'

function LiveButton() {
  const isLive = useTimeOfDay((s) => s.isLive)
  if (isLive) return null

  return (
    <button
      onClick={() => useTimeOfDay.getState().returnToLive()}
      className="absolute top-[18px] right-[18px] z-50 w-9 h-9 rounded-full backdrop-blur-md bg-green-500/20 border border-green-400/40 text-green-400 transition-all duration-200 flex items-center justify-center hover:bg-green-500/30"
      aria-label="Return to live time"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        <path strokeLinecap="round" d="M8.5 8.5a5 5 0 0 0 0 7" />
        <path strokeLinecap="round" d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path strokeLinecap="round" d="M5.5 5.5a9 9 0 0 0 0 13" />
        <path strokeLinecap="round" d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  )
}

import AvatarCircle from './components/AvatarCircle'
import AvatarEditor from './components/AvatarEditor'
import InfoModal, { useInfo } from './components/InfoModal'

function AccountButton() {
  const handle = useHandle((s) => s.handle)
  const avatar = useHandle((s) => s.avatar)
  const vignette = useHandle((s) => s.vignette)
  const { updateAvatar, adoptIdentity } = useHandle()
  const [open, setOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [accessible, setAccessible] = useState(() => {
    try { return localStorage.getItem('lsq-accessible') === '1' } catch { return false }
  })
  const popoverRef = useRef(null)

  // Accessible class is applied synchronously in index.html <script> to
  // avoid a post-mount CSS repaint that spikes GPU memory on mobile.

  // Link-device state
  const [linkToken, setLinkToken] = useState(null)
  const [linkQr, setLinkQr] = useState(null)
  const [linkStatus, setLinkStatus] = useState(null) // null | 'pending' | 'expired'
  const [linkRefresh, setLinkRefresh] = useState(0)
  const pollRef = useRef(null)

  // Fetch link token when popover opens and no handle
  useEffect(() => {
    if (!open || handle) return
    let cancelled = false
    async function fetchToken() {
      setLinkStatus(null)
      setLinkToken(null)
      setLinkQr(null)
      try {
        const res = await createLinkToken()
        if (cancelled) return
        const token = res.data?.token
        if (!token) return
        setLinkToken(token)
        setLinkStatus('pending')
        const base = window.location.origin + (import.meta.env.BASE_URL || '/')
        const url = base.replace(/\/$/, '') + '/link/' + token
        const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2, color: { dark: '#ffffff', light: '#00000000' } })
        if (!cancelled) setLinkQr(dataUrl)
      } catch {}
    }
    fetchToken()
    return () => { cancelled = true }
  }, [open, handle, linkRefresh])

  // Poll for link token claim
  useEffect(() => {
    if (!linkToken || !open || handle) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await checkLinkToken(linkToken)
        const s = res.data?.status
        if (s === 'claimed') {
          clearInterval(pollRef.current)
          adoptIdentity(res.data.device_hash, res.data.handle, res.data.avatar, res.data.vignette)
          setOpen(false)
        } else if (s === 'expired') {
          clearInterval(pollRef.current)
          setLinkStatus('expired')
        }
      } catch {}
    }, 5000)
    return () => clearInterval(pollRef.current)
  }, [linkToken, open, handle, adoptIdentity])

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const handleAvatarSave = async (newEmoji, newVignette) => {
    await updateAvatar(newEmoji, newVignette)
  }

  return (
    <div className="absolute top-[18px] right-[18px] z-50" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-9 h-9 rounded-full transition-all duration-200 flex items-center justify-center ${
          avatar ? '' : 'backdrop-blur-md bg-surface-container-high border border-outline hover:bg-surface-container-highest'
        }`}
        aria-label={handle ? `@${handle}` : 'Account'}
      >
        <AvatarCircle emoji={avatar} vignette={vignette} size={9} fallback={handle ? handle[0].toUpperCase() : null} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-56 rounded-xl bg-surface backdrop-blur-xl border border-outline p-3 space-y-3 shadow-2xl">
          {handle ? (
            <>
              <div className="text-center">
                <div className="flex justify-center mb-1">
                  <AvatarCircle emoji={avatar} vignette={vignette} size={12} fallback={handle[0].toUpperCase()} />
                </div>
                <p className="text-on-surface-variant text-body-sm font-medium">@{handle}</p>
              </div>

              <div className="border-t border-outline-variant pt-3 space-y-2">
                <button
                  onClick={() => { setOpen(false); setEditorOpen(true) }}
                  className="w-full py-2 rounded-lg text-body-sm font-medium bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors"
                >
                  Edit avatar
                </button>
                <button
                  onClick={() => {
                    const next = !accessible
                    document.documentElement.classList.toggle('accessible', next)
                    setAccessible(next)
                    try { localStorage.setItem('lsq-accessible', next ? '1' : '') } catch {}
                  }}
                  className="w-full py-2 rounded-lg text-body-sm font-medium bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="12" cy="4.5" r="2" />
                    <path strokeLinecap="round" d="M12 7.5v5m0 0l-3 5m3-5l3 5M7 10.5h10" />
                  </svg>
                  {accessible ? 'Standard mode' : 'Accessible mode'}
                </button>
              </div>
              <div className="border-t border-outline-variant pt-2 space-y-1">
                <button
                  onClick={() => { setOpen(false); useInfo.getState().openTo('about') }}
                  className="w-full py-1.5 rounded-lg text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors text-left px-3"
                >
                  About
                </button>
                <button
                  onClick={() => { setOpen(false); useInfo.getState().openTo('guidelines') }}
                  className="w-full py-1.5 rounded-lg text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors text-left px-3"
                >
                  Guidelines
                </button>
                <button
                  onClick={() => { setOpen(false); useInfo.getState().openTo('privacy') }}
                  className="w-full py-1.5 rounded-lg text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors text-left px-3"
                >
                  Privacy
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-2 space-y-2">
              {linkStatus === 'expired' ? (
                <>
                  <p className="text-on-surface-subtle text-body-sm">Code expired</p>
                  <button
                    onClick={() => setLinkRefresh(n => n + 1)}
                    className="text-body-sm text-on-surface-variant underline hover:text-on-surface"
                  >
                    Generate new code
                  </button>
                </>
              ) : linkQr ? (
                <>
                  <p className="text-on-surface-subtle text-caption mb-1">Scan from your signed-in device</p>
                  <img src={linkQr} alt="Link QR" className="w-36 h-36 mx-auto rounded-lg" />
                </>
              ) : (
                <p className="text-on-surface-disabled text-body-sm">Loading...</p>
              )}
              <div className="border-t border-outline-variant pt-2 mt-2">
                <button
                  onClick={() => {
                    const next = !accessible
                    document.documentElement.classList.toggle('accessible', next)
                    setAccessible(next)
                    try { localStorage.setItem('lsq-accessible', next ? '1' : '') } catch {}
                  }}
                  className="w-full py-1.5 rounded-lg text-caption font-medium bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="12" cy="4.5" r="2" />
                    <path strokeLinecap="round" d="M12 7.5v5m0 0l-3 5m3-5l3 5M7 10.5h10" />
                  </svg>
                  {accessible ? 'Standard mode' : 'Accessible mode'}
                </button>
                <div className="mt-2 pt-2 border-t border-outline-variant space-y-1">
                  <button
                    onClick={() => { setOpen(false); useInfo.getState().openTo('about') }}
                    className="w-full py-1 rounded-lg text-caption text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors text-left px-2"
                  >
                    About
                  </button>
                  <button
                    onClick={() => { setOpen(false); useInfo.getState().openTo('guidelines') }}
                    className="w-full py-1 rounded-lg text-caption text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors text-left px-2"
                  >
                    Guidelines
                  </button>
                  <button
                    onClick={() => { setOpen(false); useInfo.getState().openTo('privacy') }}
                    className="w-full py-1 rounded-lg text-caption text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors text-left px-2"
                  >
                    Privacy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <AvatarEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        currentEmoji={avatar}
        currentVignette={vignette}
        onSave={handleAvatarSave}
      />
    </div>
  )
}

function ModeOverlay() {
  const viewMode = useCamera((s) => s.viewMode)
  const showCard = useSelectedBuilding((s) => s.showCard)
  const bulletinOpen = useBulletin((s) => s.modalOpen)
  const codeDeskOpen = useCodeDesk((s) => s.open)
  const contactOpen = useContact((s) => s.open)
  const infoOpen = useInfo((s) => s.open)
  const isLive = useTimeOfDay((s) => s.isLive)

  // Close buttons now live inside each modal's own header
  if (codeDeskOpen || showCard || bulletinOpen || contactOpen || infoOpen) return null

  // Live button takes over the top-right slot when not live — any mode, including hero
  if (!isLive) return <LiveButton />

  // When live + hero: show account button as default idle state
  if (viewMode === 'hero') return <AccountButton />

  if (viewMode === 'planetarium') {
    return (
      <button
        onClick={() => useCamera.getState().exitPlanetarium()}
        className="absolute top-[18px] right-[18px] z-50 w-9 h-9 rounded-full backdrop-blur-md bg-amber-500/20 border border-amber-400/40 text-amber-300 transition-all duration-200 flex items-center justify-center hover:bg-amber-500/30"
        aria-label="Exit street view"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={() => useCamera.getState().goHero()}
      className="absolute top-[18px] right-[18px] z-50 w-9 h-9 rounded-full backdrop-blur-md bg-surface-container-high border border-outline text-on-surface-variant transition-all duration-200 flex items-center justify-center hover:bg-surface-container-highest hover:text-on-surface"
      aria-label="Return to hero view"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    </button>
  )
}

function PlaceOpener({ listingId }) {
  const listings = useListings(s => s.listings)
  useEffect(() => {
    // Start in browse view so recipient has locational context behind the card
    useCamera.getState().setMode('browse')
    const listing = listings.find(l => l.id === listingId)
    if (listing) {
      useSelectedBuilding.getState().select(listingId, listing.building_id)
    }
  }, [listingId, listings])
  return null
}

function BulletinOpener() {
  useEffect(() => {
    useCamera.getState().setMode('browse')
    useBulletin.getState().setModalOpen(true)
  }, [])
  return null
}

// ── Splash: time-pegged sky gradient + arch mark ─────────────────────
const SPLASH_LAT = 38.6160, SPLASH_LON = -90.2161

function splashSkyColors() {
  const now = new Date()
  const pos = SunCalc.getPosition(now, SPLASH_LAT, SPLASH_LON)
  const alt = pos.altitude // radians

  // Determine dawn vs dusk: sun azimuth < π means morning
  const isDawn = pos.azimuth < Math.PI

  const lerp = (a, b, t) => {
    t = Math.max(0, Math.min(1, t))
    const parse = (hex) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]
    const [ar, ag, ab] = parse(a)
    const [br, bg, bb] = parse(b)
    const r = Math.round(ar + (br - ar) * t)
    const g = Math.round(ag + (bg - ag) * t)
    const b2 = Math.round(ab + (bb - ab) * t)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`
  }

  // Keyframes matching CelestialBodies GradientSky (horizon, zenith pairs)
  const night   = { h: '#1a1525', z: '#050508' }
  const deep    = isDawn ? { h: '#3a2838', z: '#0a0c1a' } : { h: '#7a3828', z: '#0a0c1a' }
  const peak    = isDawn ? { h: '#c07050', z: '#141838' } : { h: '#cc6030', z: '#141835' }
  const early   = isDawn ? { h: '#dda065', z: '#223060' } : { h: '#dd8840', z: '#1a2555' }
  const golden  = isDawn ? { h: '#d0b888', z: '#3a6aaa' } : { h: '#ccaa70', z: '#3a68a8' }
  const day     = { h: '#9dc5e0', z: '#4a90e0' }

  let horizon, zenith
  if (alt < -0.12) {
    horizon = night.h; zenith = night.z
  } else if (alt < -0.02) {
    const t = (alt + 0.12) / 0.10
    horizon = lerp(night.h, deep.h, t); zenith = lerp(night.z, deep.z, t)
  } else if (alt < 0.03) {
    const t = (alt + 0.02) / 0.05
    horizon = lerp(deep.h, peak.h, t); zenith = lerp(deep.z, peak.z, t)
  } else if (alt < 0.08) {
    const t = (alt - 0.03) / 0.05
    horizon = lerp(peak.h, early.h, t); zenith = lerp(peak.z, early.z, t)
  } else if (alt < 0.22) {
    const t = (alt - 0.08) / 0.14
    horizon = lerp(early.h, golden.h, t); zenith = lerp(early.z, golden.z, t)
  } else if (alt < 0.35) {
    const t = (alt - 0.22) / 0.13
    horizon = lerp(golden.h, day.h, t); zenith = lerp(golden.z, day.z, t)
  } else {
    horizon = day.h; zenith = day.z
  }

  return { horizon, zenith }
}

const _splashColors = splashSkyColors()

// Generate static star dots for night splashes
const _splashStars = (() => {
  const pos = SunCalc.getPosition(new Date(), SPLASH_LAT, SPLASH_LON)
  if (pos.altitude > -0.02) return [] // no stars during day/golden hour
  // Fade in stars as it gets darker
  const baseOpacity = Math.min(1, (-pos.altitude - 0.02) / 0.10)
  const stars = []
  // Seeded pseudo-random for consistent layout
  let seed = 12345
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647 }
  const count = 60
  for (let i = 0; i < count; i++) {
    stars.push({
      left: `${rand() * 100}%`,
      top: `${rand() * 85}%`, // keep above horizon
      size: 1 + rand() * 1.5,
      opacity: (0.3 + rand() * 0.7) * baseOpacity,
    })
  }
  return stars
})()

function Splash() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 2500)
    const t2 = setTimeout(() => setVisible(false), 3300)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{
        background: `radial-gradient(ellipse at 50% 100%, ${_splashColors.horizon}, ${_splashColors.zenith} 70%)`,
        opacity: fading ? 0 : 1,
        transition: 'opacity 800ms ease-out',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {_splashStars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
          }}
        />
      ))}
      <img
        src={import.meta.env.BASE_URL + 'favicon.svg'}
        alt="Lafayette Square"
        className="w-20 h-20"
        style={{ filter: 'invert(1) brightness(0.87)', opacity: 0.7 }}
      />
    </div>
  )
}

function App() {
  const route = parseRoute()

  if (route.page === 'checkin') {
    return <CheckinPage locationId={route.locationId} />
  }
  if (route.page === 'claim') {
    return <ClaimPage listingId={route.listingId} secret={route.secret} />
  }
  if (route.page === 'link') {
    return <LinkPage token={route.token} />
  }

  const isGround = window.location.search.includes('ground')

  return (
    <div className="w-full h-full relative">
      <SceneBoundary><Scene /></SceneBoundary>
      {route.page === 'place' && <PlaceOpener listingId={route.listingId} />}
      {route.page === 'bulletin' && <BulletinOpener />}
      {!isGround && <div className="fade-in" style={{ animationDelay: '1.2s' }}><Controls /></div>}
      {!isGround && <div className="fade-in" style={{ animationDelay: '1.4s' }}><CompassRose /></div>}
      {!isGround && <div className="fade-in" style={{ animationDelay: '1.0s' }}><SidePanel /></div>}
      {!isGround && <div className="fade-in" style={{ animationDelay: '0.8s' }}><EventTicker /></div>}
      {!isGround && <BulletinModal />}
      {!isGround && <ContactModal />}
      {!isGround && <CodeDeskModal />}
      {!isGround && <div className="fade-in" style={{ animationDelay: '1.4s' }}><ModeOverlay /></div>}
      {!isGround && <InfoModal />}
      <Splash />
    </div>
  )
}

function parseRoute() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const raw = window.location.pathname
  const path = base && raw.startsWith(base) ? raw.slice(base.length) || '/' : raw
  const checkinMatch = path.match(/^\/checkin\/([^/]+)$/)
  if (checkinMatch) return { page: 'checkin', locationId: checkinMatch[1] }
  const claimMatch = path.match(/^\/claim\/([^/]+)\/([^/]+)$/)
  if (claimMatch) return { page: 'claim', listingId: claimMatch[1], secret: claimMatch[2] }
  const linkMatch = path.match(/^\/link\/([A-Za-z0-9]+)$/)
  if (linkMatch) return { page: 'link', token: linkMatch[1] }
  const placeMatch = path.match(/^\/place\/([^/]+)$/)
  if (placeMatch) return { page: 'place', listingId: placeMatch[1] }
  if (path === '/bulletin') return { page: 'bulletin' }
  return { page: 'scene' }
}

export default App
