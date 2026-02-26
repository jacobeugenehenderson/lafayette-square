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

const DEFAULT_AVATARS = ['🦊','🐻','🦉','🐝','🦋','🐢','🐙','🦎','🐸','🌻','🍄','🌵','🔥','⭐','🌊','🎲','🎯','🧊','🫧','🪴','🪻','🍀','🐿️','🦔','🐾','🪶']

function AccountButton() {
  const handle = useHandle((s) => s.handle)
  const avatar = useHandle((s) => s.avatar)
  const { updateAvatar } = useHandle()
  const [open, setOpen] = useState(false)
  const [emojiInput, setEmojiInput] = useState('')
  const [saving, setSaving] = useState(false)
  const popoverRef = useRef(null)

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const handleEmojiChange = (e) => {
    const raw = e.target.value
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter('en', { granularity: 'grapheme' })
      const segments = [...seg.segment(raw)]
      const emoji = segments.length > 0 ? segments[segments.length - 1].segment : ''
      setEmojiInput(/[^\x00-\x7F]/.test(emoji) ? emoji : '')
    } else {
      setEmojiInput(raw.slice(0, 2))
    }
  }

  const saveEmoji = async () => {
    if (!emojiInput && !avatar) return
    setSaving(true)
    await updateAvatar(emojiInput)
    setSaving(false)
    setEmojiInput('')
    setOpen(false)
  }

  const buttonLabel = avatar || (handle ? handle[0].toUpperCase() : null)

  return (
    <div className="absolute top-4 right-4 z-50" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full backdrop-blur-md bg-white/10 border border-white/20 text-white/60 transition-all duration-200 flex items-center justify-center hover:bg-white/20 hover:text-white/80 text-sm"
        title={handle ? `@${handle}` : 'Account'}
      >
        {buttonLabel || (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-56 rounded-xl bg-black/80 backdrop-blur-xl border border-white/15 p-3 space-y-3 shadow-2xl">
          {handle ? (
            <>
              <div className="text-center">
                <div className="text-2xl mb-1">{avatar || handle[0].toUpperCase()}</div>
                <p className="text-white/70 text-xs font-medium">@{handle}</p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-white/40 text-[10px] mb-2">Change avatar</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={emojiInput}
                    onChange={handleEmojiChange}
                    placeholder={avatar || '?'}
                    className="w-10 h-10 text-center text-xl bg-white/5 border border-white/15 rounded-lg focus:outline-none focus:border-white/30"
                    inputMode="text"
                  />
                  <button
                    onClick={saveEmoji}
                    disabled={saving || !emojiInput}
                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80 disabled:opacity-30 transition-colors"
                  >
                    {saving ? '...' : 'Save'}
                  </button>
                </div>
                <button
                  onClick={() => setEmojiInput(DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)])}
                  className="text-white/30 text-[10px] hover:text-white/50 mt-1.5 underline"
                >
                  shuffle
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-white/50 text-xs">Scan a QR code at a local business to check in and set your handle.</p>
            </div>
          )}
        </div>
      )}
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
  const placeMatch = path.match(/^\/place\/([^/]+)$/)
  if (placeMatch) return { page: 'place', listingId: placeMatch[1] }
  if (path === '/bulletin') return { page: 'bulletin' }
  return { page: 'scene' }
}

export default App
