/**
 * Cary — Courier Dashboard
 *
 * Full-screen overlay for active couriers. Shows:
 * - Incoming requests (accept/decline)
 * - Active session meter (live GPS, fare, controls)
 * - Go online/offline toggle
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { create } from 'zustand'
import useCary from '../hooks/useCary'
import { computeFare, computeBreakdown } from '../../cary/lib/meter.js'
import { filterPoint } from '../../cary/lib/geo.js'
import SafetyReport from './SafetyReport'
import CourierOnboarding from './CourierOnboarding'
import CaryAuth from './CaryAuth'

// ── Store ─────────────────────────────────────────────────────
export const useCourierDash = create((set) => ({
  open: false,
  tier: null, // 'deliver' | 'drive' | null (null = show chooser)
  setOpen: (open) => set({ open }),
  setTier: (tier) => set({ tier }),
}))

// ── Online/Offline Toggle ─────────────────────────────────────
function OnlineToggle() {
  const [online, setOnline] = useState(false)
  const watchRef = useRef(null)
  const { updateLocation } = useCary()

  const goOnline = useCallback(() => {
    setOnline(true)
    // Start GPS tracking
    if ('geolocation' in navigator) {
      watchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          updateLocation(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.heading,
            pos.coords.accuracy
          )
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      )
    }
  }, [updateLocation])

  const goOffline = useCallback(() => {
    setOnline(false)
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
      }
    }
  }, [])

  return (
    <button
      onClick={online ? goOffline : goOnline}
      className={`w-full py-3 rounded-xl font-medium text-body transition-all ${
        online
          ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
          : 'bg-surface-container-high border border-outline text-on-surface-variant'
      }`}
    >
      {online ? 'Online — accepting requests' : 'Go online'}
    </button>
  )
}

// ── Request Card ──────────────────────────────────────────────
function RequestCard({ request, onAccept }) {
  const typeLabels = { ride: 'Ride', delivery: 'Delivery', pickup: 'Pickup', errand: 'Errand' }

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-label-sm uppercase tracking-widest text-amber-400">
            {typeLabels[request.type] || request.type}
          </span>
          <p className="text-body font-medium text-on-surface mt-0.5">{request.place_name}</p>
        </div>
        <span className="text-caption text-on-surface-subtle">
          {new Date(request.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
      {request.description && (
        <p className="text-body-sm text-on-surface-variant mb-3">{request.description}</p>
      )}
      <button
        onClick={() => onAccept(request.id)}
        className="w-full py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-medium text-body-sm hover:bg-emerald-500/30 transition-colors"
      >
        Accept
      </button>
    </div>
  )
}

// ── Live Meter ────────────────────────────────────────────────
function LiveMeter() {
  const { activeSession, startMeter, completeMeter, pushRoutePoint, emergencyEnd, loading } = useCary()
  const [elapsed, setElapsed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [showSafety, setShowSafety] = useState(false)
  const lastPointRef = useRef(null)
  const watchRef = useRef(null)

  // Timer
  useEffect(() => {
    if (!activeSession?.started_at) return
    const start = new Date(activeSession.started_at).getTime()
    const tick = () => setElapsed(Math.round((Date.now() - start) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [activeSession?.started_at])

  // GPS tracking for route points
  useEffect(() => {
    if (!activeSession?.started_at) return
    if (!('geolocation' in navigator)) return

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: Date.now(),
        }
        const result = filterPoint(point, lastPointRef.current)
        if (result.accept) {
          setDistance((d) => d + result.distance)
          lastPointRef.current = point
          pushRoutePoint(point.lat, point.lon, point.accuracy)
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
    )

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
      }
    }
  }, [activeSession?.started_at, pushRoutePoint])

  if (!activeSession) return null

  const request = activeSession.requests
  const meterStarted = !!activeSession.started_at
  const fareCents = meterStarted ? computeFare(distance, elapsed) : 0
  const breakdown = meterStarted ? computeBreakdown(fareCents) : null

  const formatTime = (s) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="rounded-xl border border-outline bg-surface-container-high p-4 space-y-4">
      {/* Request info */}
      <div>
        <span className="text-label-sm uppercase tracking-widest text-emerald-400">
          {request?.type || 'Trip'}
        </span>
        <p className="text-body font-medium text-on-surface mt-0.5">
          {request?.place_name || 'Unknown'}
        </p>
        {request?.description && (
          <p className="text-body-sm text-on-surface-variant mt-1">{request.description}</p>
        )}
      </div>

      {/* Meter display */}
      {meterStarted ? (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-caption text-on-surface-subtle">Time</p>
              <p className="text-title font-mono text-on-surface">{formatTime(elapsed)}</p>
            </div>
            <div>
              <p className="text-caption text-on-surface-subtle">Distance</p>
              <p className="text-title font-mono text-on-surface">
                {distance < 1000
                  ? `${Math.round(distance)}m`
                  : `${(distance / 1609.34).toFixed(1)}mi`}
              </p>
            </div>
            <div>
              <p className="text-caption text-on-surface-subtle">Fare</p>
              <p className="text-title font-mono text-emerald-400">
                ${(fareCents / 100).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Breakdown */}
          {breakdown && (
            <div className="rounded-lg bg-surface-container border border-outline-variant px-3 py-2 space-y-1 text-body-sm">
              <div className="flex justify-between text-on-surface-variant">
                <span>Your payout</span>
                <span className="text-on-surface">${(breakdown.courier_payout / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-on-surface-subtle">
                <span>Platform fee</span>
                <span>${(breakdown.platform_fee / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <button
            onClick={completeMeter}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-on-surface text-surface font-medium text-body transition-colors hover:bg-on-surface-medium disabled:opacity-40"
          >
            {loading ? 'Completing...' : 'Complete trip'}
          </button>

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowSafety(true)}
              className="py-2 rounded-lg border border-rose-400/30 text-rose-400 text-body-sm hover:bg-rose-500/10 transition-colors"
            >
              End Service
            </button>
            <button
              onClick={() => window.open('tel:911')}
              className="py-2 rounded-lg border border-amber-400/30 text-amber-400 text-body-sm hover:bg-amber-500/10 transition-colors"
            >
              Need Help
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: 'My Cary trip',
                    text: `I'm on a ${request?.type || 'trip'} near ${request?.place_name || 'Lafayette Square'}`,
                  }).catch(() => {})
                }
              }}
              className="py-2 rounded-lg border border-outline-variant text-on-surface-variant text-body-sm hover:bg-surface-container transition-colors"
            >
              Share Trip
            </button>
          </div>

          {/* Safety report */}
          {showSafety && (
            <SafetyReport
              onReport={(reason, details) => { emergencyEnd(reason, details); setShowSafety(false) }}
              onCancel={() => setShowSafety(false)}
            />
          )}
        </>
      ) : (
        <button
          onClick={startMeter}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-medium text-body hover:bg-emerald-500/30 transition-colors"
        >
          Start meter
        </button>
      )}
    </div>
  )
}

// ── Tier Chooser ─────────────────────────────────────────────
function TierChooser({ onSelect }) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <p className="text-body text-on-surface font-medium">How do you want to earn?</p>
      </div>
      <button
        onClick={() => onSelect('deliver')}
        className="glass-card w-full text-left rounded-xl p-4 hover:bg-[rgba(255,255,255,0.08)] transition-colors"
      >
        <p className="text-body font-medium text-on-surface">Deliver</p>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Packages, food, errands. Walk, bike, or drive. Ages 14+.
        </p>
        <p className="text-caption text-emerald-400 mt-2">Free — active in minutes</p>
      </button>
      <button
        onClick={() => onSelect('drive')}
        className="glass-card w-full text-left rounded-xl p-4 hover:bg-[rgba(255,255,255,0.08)] transition-colors"
      >
        <p className="text-body font-medium text-on-surface">Carry passengers</p>
        <p className="text-body-sm text-on-surface-variant mt-1">
          Rides starting in the Square, servicing the entire county. Must be 18+.
        </p>
        <p className="text-caption text-on-surface-subtle mt-2">~$42 — active in 1-3 days</p>
      </button>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────
export default function CourierDashboard() {
  const open = useCourierDash((s) => s.open)
  const setOpen = useCourierDash((s) => s.setOpen)
  const tier = useCourierDash((s) => s.tier)
  const setTier = useCourierDash((s) => s.setTier)
  const {
    user,
    profile,
    courierProfile,
    activeSession,
    courierRequests,
    acceptRequest,
    subscribeAsCourier,
    unsubscribeAll,
  } = useCary()

  useEffect(() => {
    if (open && courierProfile?.status === 'active') {
      subscribeAsCourier()
      return () => unsubscribeAll()
    }
  }, [open, courierProfile?.status, subscribeAsCourier, unsubscribeAll])

  // Preview mode: ?preview=true skips auth to show the onboarding wizard
  const isPreview = new URLSearchParams(window.location.search).has('preview')

  if (!open) return null

  // Determine subtitle based on state
  const subtitle = isPreview ? `Courier onboarding — ${tier || 'preview'}`
    : !tier ? 'Join the network'
    : tier === 'deliver' ? 'Deliver in the Square'
    : tier === 'drive' ? 'Drive for Cary'
    : !user ? 'Apply to become a courier'
    : !profile ? 'Create your profile'
    : !courierProfile ? 'Courier application'
    : courierProfile.status === 'active' ? 'Courier dashboard'
    : 'Courier onboarding'

  return (
    <div className="fixed inset-0 z-[60] glass-overlay overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="text-headline text-on-surface font-medium"
              style={{ fontFamily: 'ui-monospace, monospace' }}
            >
              Cary
            </h2>
            <p className="text-body-sm text-on-surface-subtle">{subtitle}</p>
          </div>
          <button
            onClick={() => { setOpen(false); setTier(null) }}
            className="w-9 h-9 rounded-full backdrop-blur-md bg-rose-500/20 border border-rose-400/40 text-rose-300 hover:bg-rose-500/30 flex items-center justify-center text-body-sm"
          >
            &times;
          </button>
        </div>

        {/* Tier chooser: no tier selected yet */}
        {!tier && !isPreview && !courierProfile?.status && (
          <TierChooser onSelect={setTier} />
        )}

        {/* Preview mode: show onboarding wizard without auth */}
        {isPreview && <CourierOnboarding preview tier={tier || 'drive'} />}

        {/* Auth + Profile creation: not signed in, or signed in but no profile */}
        {!isPreview && tier && (!user || (user && !profile)) && <CaryAuth />}

        {/* Onboarding: signed in with profile but not yet active */}
        {!isPreview && tier && user && profile && (!courierProfile || courierProfile.status !== 'active') && (
          <CourierOnboarding tier={tier} />
        )}

        {/* Active courier */}
        {courierProfile?.status === 'active' && (
          <>
            <OnlineToggle />

            {/* Active session */}
            {activeSession && <LiveMeter />}

            {/* Incoming requests */}
            {!activeSession && courierRequests.length > 0 && (
              <div className="space-y-3">
                <p className="text-label-sm uppercase tracking-widest text-on-surface-subtle">
                  Nearby requests
                </p>
                {courierRequests.map((req) => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    onAccept={acceptRequest}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!activeSession && courierRequests.length === 0 && (
              <div className="text-center py-8">
                <p className="text-body-sm text-on-surface-subtle">
                  No requests nearby. Stay online and you'll be notified.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
