/**
 * PhoneFrame — iPhone 16 Pro Max bezel for the Preview viewport.
 *
 * Hand-drawn from public dimensions (440×956 logical pt screen,
 * ~10pt symmetric bezel, 55pt screen corner radius, 125×37pt
 * Dynamic Island ~11pt from top of screen). Children render inside
 * the screen rect; the frame is purely decorative.
 *
 * Important: scaling is applied directly to dimensions, NOT via CSS
 * transform. R3F's Canvas measures its parent via ResizeObserver and
 * a CSS-transformed parent confuses the buffer-sizing path, clipping
 * the render. With direct dimensions the Canvas sees real pixel
 * sizes and draws correctly.
 */
import React from 'react'

export const SCREEN_W = 440
export const SCREEN_H = 956
export const BEZEL = 10
export const BODY_W = SCREEN_W + BEZEL * 2     // 460
export const BODY_H = SCREEN_H + BEZEL * 2     // 976
export const SCREEN_RADIUS = 55
export const BODY_RADIUS = 62

const DI_W = 125
const DI_H = 37
const DI_OFFSET = 11  // distance from top of screen to top of island

export default function PhoneFrame({ children, scale = 1 }) {
  const s = scale
  const w        = BODY_W * s
  const h        = BODY_H * s
  const bezel    = BEZEL * s
  const screenW  = SCREEN_W * s
  const screenH  = SCREEN_H * s
  const screenR  = SCREEN_RADIUS * s
  const bodyR    = BODY_RADIUS * s
  const diW      = DI_W * s
  const diH      = DI_H * s
  const diTop    = (BEZEL + DI_OFFSET) * s

  return (
    <div style={{
      width: w, height: h, position: 'relative',
      flexShrink: 0,
    }}>
      {/* Titanium body */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: bodyR,
        background: 'linear-gradient(135deg, #3a3a3c 0%, #1c1c1e 50%, #2a2a2c 100%)',
        boxShadow: [
          `0 ${30 * s}px ${80 * s}px rgba(0,0,0,0.55)`,
          '0 0 0 1px rgba(255,255,255,0.08)',
          'inset 0 0 0 2px rgba(255,255,255,0.04)',
        ].join(', '),
      }} />

      {/* Inner black bezel ring */}
      <div style={{
        position: 'absolute',
        top: bezel - 2 * s, left: bezel - 2 * s,
        width: screenW + 4 * s, height: screenH + 4 * s,
        borderRadius: screenR + 2 * s,
        background: '#000',
      }} />

      {/* Screen aperture — children mount here */}
      <div style={{
        position: 'absolute',
        top: bezel, left: bezel,
        width: screenW, height: screenH,
        borderRadius: screenR,
        overflow: 'hidden',
        background: '#000',
      }}>
        {children}
      </div>

      {/* Dynamic Island */}
      <div style={{
        position: 'absolute',
        top: diTop,
        left: '50%',
        transform: 'translateX(-50%)',
        width: diW, height: diH,
        borderRadius: diH / 2,
        background: '#000',
        boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.06)',
        pointerEvents: 'none',
      }} />

      {/* Side buttons — purely cosmetic */}
      <SideButton side="left"  top={120 * s} height={32 * s} thickness={3 * s} />
      <SideButton side="left"  top={186 * s} height={62 * s} thickness={3 * s} />
      <SideButton side="left"  top={258 * s} height={62 * s} thickness={3 * s} />
      <SideButton side="right" top={180 * s} height={92 * s} thickness={3 * s} />
      <SideButton side="right" top={300 * s} height={36 * s} thickness={3 * s} />
    </div>
  )
}

function SideButton({ side, top, height, thickness }) {
  const isLeft = side === 'left'
  return (
    <div style={{
      position: 'absolute',
      top,
      [isLeft ? 'left' : 'right']: -thickness / 3,
      width: thickness,
      height,
      borderRadius: thickness / 2,
      background: 'linear-gradient(90deg, rgba(0,0,0,0.4), rgba(255,255,255,0.06), rgba(0,0,0,0.4))',
      pointerEvents: 'none',
    }} />
  )
}
