import { useEffect, useState, useRef } from 'react'
import Scene from './components/Scene'
import Controls from './components/Controls'
import CompassRose from './components/CompassRose'
import SidePanel from './components/SidePanel'
import BulletinModal from './components/BulletinModal'
import CodeDeskModal, { useCodeDesk } from './components/CodeDeskModal'
import EventTicker from './components/EventTicker'
import useCamera from './hooks/useCamera'
import useTimeOfDay from './hooks/useTimeOfDay'
import useSelectedBuilding from './hooks/useSelectedBuilding'
import useBulletin from './hooks/useBulletin'
import useListings from './hooks/useListings'
import useHandle from './hooks/useHandle'
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
      className="absolute top-4 right-4 z-50 w-9 h-9 rounded-full backdrop-blur-md bg-green-500/20 border border-green-400/40 text-green-400 transition-all duration-200 flex items-center justify-center hover:bg-green-500/30"
      title="Return to live time"
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

function AccountButton() {
  const handle = useHandle((s) => s.handle)
  const avatar = useHandle((s) => s.avatar)
  const vignette = useHandle((s) => s.vignette)
  const { updateAvatar, adoptIdentity } = useHandle()
  const [open, setOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const popoverRef = useRef(null)

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
    }, 2000)
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
    <div className="absolute top-4 right-4 z-50" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full backdrop-blur-md bg-white/10 border border-white/20 transition-all duration-200 flex items-center justify-center hover:bg-white/20"
        title={handle ? `@${handle}` : 'Account'}
      >
        <AvatarCircle emoji={avatar} vignette={vignette} size={7} fallback={handle ? handle[0].toUpperCase() : null} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-56 rounded-xl bg-black/80 backdrop-blur-xl border border-white/15 p-3 space-y-3 shadow-2xl">
          {handle ? (
            <>
              <div className="text-center">
                <div className="flex justify-center mb-1">
                  <AvatarCircle emoji={avatar} vignette={vignette} size={12} fallback={handle[0].toUpperCase()} />
                </div>
                <p className="text-white/70 text-xs font-medium">@{handle}</p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <button
                  onClick={() => { setOpen(false); setEditorOpen(true) }}
                  className="w-full py-2 rounded-lg text-xs font-medium bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80 transition-colors"
                >
                  Change avatar
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-2 space-y-2">
              {linkStatus === 'expired' ? (
                <>
                  <p className="text-white/40 text-xs">Code expired</p>
                  <button
                    onClick={() => setLinkRefresh(n => n + 1)}
                    className="text-xs text-white/60 underline hover:text-white/80"
                  >
                    Generate new code
                  </button>
                </>
              ) : linkQr ? (
                <>
                  <p className="text-white/40 text-[10px] mb-1">Scan from your signed-in device</p>
                  <img src={linkQr} alt="Link QR" className="w-36 h-36 mx-auto rounded-lg" />
                </>
              ) : (
                <p className="text-white/30 text-xs">Loading...</p>
              )}
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
  const isLive = useTimeOfDay((s) => s.isLive)

  // Close buttons now live inside each modal's own header
  if (codeDeskOpen || showCard || bulletinOpen) return null

  // Live button takes over the top-right slot when not live — any mode, including hero
  if (!isLive) return <LiveButton />

  // When live + hero: show account button as default idle state
  if (viewMode === 'hero') return <AccountButton />

  if (viewMode === 'planetarium') {
    return (
      <button
        onClick={() => useCamera.getState().exitPlanetarium()}
        className="absolute top-4 right-4 z-50 w-9 h-9 rounded-full backdrop-blur-md bg-amber-500/20 border border-amber-400/40 text-amber-300 transition-all duration-200 flex items-center justify-center hover:bg-amber-500/30"
        title="Exit street view"
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
      className="absolute top-4 right-4 z-50 w-9 h-9 rounded-full backdrop-blur-md bg-white/10 border border-white/20 text-white/60 transition-all duration-200 flex items-center justify-center hover:bg-white/20 hover:text-white/80"
      title="Return to hero view"
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
      <Scene />
      {route.page === 'place' && <PlaceOpener listingId={route.listingId} />}
      {route.page === 'bulletin' && <BulletinOpener />}
      {!isGround && <Controls />}
      {!isGround && <CompassRose />}
      {!isGround && <SidePanel />}
      {!isGround && <EventTicker />}
      {!isGround && <BulletinModal />}
      {!isGround && <CodeDeskModal />}
      {!isGround && <ModeOverlay />}
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
