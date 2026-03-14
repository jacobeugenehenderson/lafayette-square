/**
 * Live courier dots on the 3D map.
 *
 * Subscribes to courier_locations via Supabase real-time.
 * Blue dot = courier on active delivery, yellow = idle/available.
 * Idle couriers snap to Lafayette Park center to protect home privacy.
 */
import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { supabase } from '../lib/supabase'
import useCamera from '../hooks/useCamera'

// Same coordinate system as useUserLocation
const CENTER_LAT = 38.6160
const CENTER_LON = -90.2161
const LON_TO_METERS = 86774
const LAT_TO_METERS = 111000

// Idle courier default position — Lafayette Park center
const IDLE_LAT = 38.6158
const IDLE_LON = -90.2155
const IDLE_X = (IDLE_LON - CENTER_LON) * LON_TO_METERS
const IDLE_Z = (CENTER_LAT - IDLE_LAT) * LAT_TO_METERS

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
        // TODO: determine active vs idle based on whether courier has an active session
        // For now, all live couriers show as idle/available (yellow)
        const pos = toScene(c.lat, c.lon)
        return (
          <CourierDot
            key={c.courier_id}
            x={pos.x}
            z={pos.z}
            active={false}
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
