/**
 * Live courier dots on the 3D map.
 *
 * Subscribes to courier_locations via Supabase real-time.
 * Blue dot = courier on an active delivery, yellow = idle/available.
 *
 * ⛔⛔ THIS FILE USED TO CLAIM A PRIVACY SNAP IT DOES NOT PERFORM, and the
 * claim outlived the reason for it. The line read "idle couriers snap to the
 * park centre to protect home privacy"; the render has always passed the real
 * lat/lon, and the IDLE_* constants were referenced nowhere.
 * ⭐ THE SNAP IS NOT NEEDED, and wiring it would make things worse. Migration
 * `011` (SECURITY.md F-10, closed and verified 2026-08-24) scoped
 * `courier_locations` so a row is readable ONLY by the courier themselves and
 * by the requester on a currently-running session with them. Nobody else
 * receives a position at all, so there is nothing to anonymise — and freezing
 * the one courier a requester IS entitled to watch, mid-delivery, at a park
 * bench would break the only case that survives.
 * ⚠️ The client-side snap was the pre-011 mitigation. RLS replaced it. The
 * constants are excised rather than parked: dead code that describes a
 * protection is read as a protection.
 */
import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { supabase } from '../lib/supabase'
import useCamera from '../hooks/useCamera'
import useCary from '../hooks/useCary'
import { INSTANCE } from '../instance.js'

// Same coordinate system as useUserLocation
const CENTER_LAT = INSTANCE.geography.lat
const CENTER_LON = INSTANCE.geography.lon
const LON_TO_METERS = INSTANCE.geography.lonToMeters
const LAT_TO_METERS = INSTANCE.geography.latToMeters

// Convert lat/lon to scene coords
function toScene(lat, lon) {
  return {
    x: (lon - CENTER_LON) * LON_TO_METERS,
    z: (CENTER_LAT - lat) * LAT_TO_METERS,
  }
}

// Stale threshold — if updated_at is older than 5 min, courier is offline
const STALE_MS = 5 * 60 * 1000

function CourierDot({ x, z, active }) {
  const ringRef = useRef()
  const color = active ? '#3b82f6' : '#eab308' // blue = delivering, yellow = idle
  const ringColor = active ? '#3b82f6' : '#eab308'

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: ringColor,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), [ringColor])

  useFrame(({ clock }) => {
    if (!ringRef.current) return
    const t = (Math.sin(clock.elapsedTime * Math.PI * 0.8) + 1) / 2
    const s = 1 + t * 0.5
    ringRef.current.scale.set(s, s, 1)
    ringMat.opacity = 0.3 * (1 - t * 0.5)
  })

  return (
    <group position={[x, 35, z]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* Solid dot */}
      <mesh>
        <circleGeometry args={[2.5, 24]} />
        <meshBasicMaterial color={color} depthWrite={false} />
      </mesh>
      {/* White border */}
      <mesh position={[0, 0, -0.01]}>
        <ringGeometry args={[2.5, 3.3, 24]} />
        <meshBasicMaterial color="#ffffff" depthWrite={false} />
      </mesh>
      {/* Pulse ring */}
      <mesh ref={ringRef} position={[0, 0, -0.02]} material={ringMat}>
        <ringGeometry args={[4, 5, 32]} />
      </mesh>
    </group>
  )
}

export default function CourierDots() {
  const [couriers, setCouriers] = useState([])
  const viewMode = useCamera((s) => s.viewMode)
  /* Two facts, selected narrowly so a dot does not re-render on every Cary
     state change: who I am as a courier, and whether I am mid-delivery. */
  const myCourierId = useCary((s) => s.courierProfile?.id ?? null)
  const hasActiveSession = useCary((s) => !!s.activeSession && !s.activeSession.completed_at)

  // Fetch initial courier locations + subscribe to real-time changes
  useEffect(() => {
    let channel = null

    async function init() {
      // Fetch current locations
      const { data } = await supabase
        .from('courier_locations')
        .select('courier_id, lat, lon, updated_at')

      if (data) setCouriers(data)

      // Subscribe to changes
      channel = supabase
        .channel('courier-dots')
        .on('postgres_changes', {
          event: '*',
          table: 'courier_locations',
        }, (payload) => {
          setCouriers(prev => {
            const updated = payload.new
            if (!updated?.courier_id) return prev
            const exists = prev.findIndex(c => c.courier_id === updated.courier_id)
            if (payload.eventType === 'DELETE') {
              return prev.filter(c => c.courier_id !== updated.courier_id)
            }
            if (exists >= 0) {
              const next = [...prev]
              next[exists] = updated
              return next
            }
            return [...prev, updated]
          })
        })
        .subscribe()
    }

    init()
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  if (viewMode === 'hero') return null

  // Filter out stale couriers (offline > 5 min)
  const now = Date.now()
  const liveCouriers = couriers.filter(c => {
    if (!c.updated_at) return false
    return now - new Date(c.updated_at).getTime() < STALE_MS
  })

  if (liveCouriers.length === 0) return null

  return (
    <group>
      {liveCouriers.map(c => {
        /* ⭐ MIGRATION 011 MAKES THIS DECIDABLE WITHOUT ASKING THE SERVER AGAIN.
           A row reaches this client only if it is the viewer's own courier
           position, or that of a courier on a live session WITH the viewer. So
           anyone who is not you is, by the policy's own definition, mid-delivery
           for you — and you are idle unless your own session says otherwise.
           ⛔ Do not reintroduce a status column for this. The authorization rule
           already carries the fact; a second copy of it in the row is a second
           thing to keep in step. */
        const isMe = !!myCourierId && c.courier_id === myCourierId
        const pos = toScene(c.lat, c.lon)
        return (
          <CourierDot
            key={c.courier_id}
            x={pos.x}
            z={pos.z}
            active={!isMe || hasActiveSession}
          />
        )
      })}
    </group>
  )
}

/**
 * Hook for checking if any courier is currently available.
 * Used by the delivery button to show/hide based on courier availability.
 */
export function useCourierAvailable() {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let channel = null

    async function check() {
      const { data } = await supabase
        .from('courier_locations')
        .select('courier_id, updated_at')

      const now = Date.now()
      const live = (data || []).some(c =>
        c.updated_at && now - new Date(c.updated_at).getTime() < STALE_MS
      )
      setAvailable(live)

      // Subscribe to changes
      channel = supabase
        .channel('courier-avail')
        .on('postgres_changes', {
          event: '*',
          table: 'courier_locations',
        }, () => {
          // Re-check on any change
          check()
        })
        .subscribe()
    }

    check()
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  return available
}
