'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A web port of AIThinkingOrb from the iOS app (Borea/Views/TodayView.swift).
 *
 * Same construction as the app: a night-sky sphere, a fixed star field, and four
 * aurora curtains drawn as filled ribbons whose top edge waves like a soundwave.
 * The band table, the wave maths and the colours are copied from the Swift so the
 * two read as the same object.
 *
 * The one difference: the app drives `voice` from live mic / ElevenLabs playback
 * RMS. There is no audio on the marketing site, so we synthesise a slow speaking
 * envelope. `levelRef` is exposed so a future interactive demo can feed the orb a
 * real 0-1 level instead.
 */

type Band = { depth: number; hue: number; speed: number; freq: number; phase: number }

// Aurora curtains, far -> near. hue 0 = green, 1 = blue, 2 = violet.
const BANDS: Band[] = [
  { depth: 1.0, hue: 2, speed: 0.45, freq: 2.1, phase: 0.0 },
  { depth: 0.72, hue: 1, speed: 0.62, freq: 1.6, phase: 2.1 },
  { depth: 0.45, hue: 0, speed: 0.8, freq: 1.25, phase: 4.2 },
  { depth: 0.2, hue: 0, speed: 1.0, freq: 0.9, phase: 1.3 },
]

// Matches bandColor() in the Swift, converted to 0-255.
const HUE: [number, number, number][] = [
  [64, 242, 153], // aurora green
  [38, 204, 255], // cyan-blue
  [140, 115, 255], // violet
]

// Same LCG and seed as the Swift, so the star field is identical on both.
const STARS = (() => {
  let seed = 42
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const out: { x: number; y: number; r: number; tw: number }[] = []
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 2 * Math.PI
    const d = 0.15 + 0.8 * rnd()
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.5 + rnd() * 0.9, tw: rnd() * 6.28 })
  }
  return out
})()

function draw(c: CanvasRenderingContext2D, size: number, t: number, voice: number) {
  const cx = size / 2
  const cy = size / 2
  const R = size / 2

  c.clearRect(0, 0, size, size)

  // Night-sky sphere.
  const sky = c.createRadialGradient(
    cx - R * 0.25, cy - R * 0.35, 0,
    cx - R * 0.25, cy - R * 0.35, R * 1.9,
  )
  sky.addColorStop(0, 'rgb(13,23,56)')
  sky.addColorStop(1, 'rgb(3,5,20)')
  c.beginPath()
  c.arc(cx, cy, R, 0, Math.PI * 2)
  c.fillStyle = sky
  c.fill()

  c.save()
  c.beginPath()
  c.arc(cx, cy, R, 0, Math.PI * 2)
  c.clip()

  // Stars twinkle gently; a loud coach makes them shimmer.
  for (const st of STARS) {
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + st.tw * 0.25) + st.tw))
    const a = tw * (0.5 + 0.5 * voice * Math.abs(Math.sin(t * 7 + st.tw)))
    c.beginPath()
    c.arc(cx + st.x * R * 0.92, cy + st.y * R * 0.92, st.r, 0, Math.PI * 2)
    c.fillStyle = `rgba(255,255,255,${0.25 + 0.45 * a})`
    c.fill()
  }

  // Aurora curtains: a filled ribbon with a waving top edge that falls away.
  for (const band of BANDS) {
    const near = 1 - band.depth
    const baseY = cy + R * (0.05 + 0.38 * band.depth - 0.28)
    const energy = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.5 + band.phase))
    const amp = R * (0.16 + 0.3 * near) * energy * (0.55 + 1.35 * voice)
    const fall = R * (0.55 + 0.5 * near)
    const steps = 48

    const top: { x: number; y: number }[] = []
    for (let i = 0; i <= steps; i++) {
      const fx = i / steps
      const x = cx - R + fx * 2 * R
      const envelope = Math.sin(fx * Math.PI) // taper at the sphere's edges
      const waveA = Math.sin(fx * band.freq * 2 * Math.PI + t * band.speed * (1 + voice * 0.9) + band.phase)
      const waveB = 0.5 * Math.sin(fx * band.freq * 4.7 + t * band.speed * 1.7 + band.phase * 2)
      const ripple = voice * 0.55 * Math.sin(fx * 10 - t * 8 + band.phase)
      top.push({ x, y: baseY - ((waveA + waveB) * 0.66 + ripple) * amp * envelope })
    }

    const [r, g, b] = HUE[band.hue]
    const bright = (0.34 + 0.3 * near) * (0.75 + 0.65 * voice)

    c.beginPath()
    c.moveTo(top[0].x, top[0].y + fall)
    c.lineTo(top[0].x, top[0].y)
    for (let i = 1; i <= steps; i++) c.lineTo(top[i].x, top[i].y)
    c.lineTo(top[steps].x, top[steps].y + fall)
    c.closePath()
    const grad = c.createLinearGradient(cx, baseY - amp, cx, baseY + fall * 0.9)
    grad.addColorStop(0, `rgba(${r},${g},${b},${bright})`)
    grad.addColorStop(0.35, `rgba(${r},${g},${b},${bright * 0.35})`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
    c.fillStyle = grad
    c.fill()

    // Crisp luminous top edge.
    c.beginPath()
    c.moveTo(top[0].x, top[0].y)
    for (let i = 1; i <= steps; i++) c.lineTo(top[i].x, top[i].y)
    c.strokeStyle = `rgba(${r},${g},${b},${0.55 + 0.4 * voice})`
    c.lineWidth = 1.2 + near * 1.2 + voice * 1.4
    c.stroke()
  }

  c.restore()

  // Sphere rim: a cool glass edge to sell the 3-D ball.
  const rim = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
  rim.addColorStop(0, 'rgba(255,255,255,0.35)')
  rim.addColorStop(1, 'rgba(255,255,255,0.06)')
  c.beginPath()
  c.arc(cx, cy, R - 0.75, 0, Math.PI * 2)
  c.strokeStyle = rim
  c.lineWidth = 1.5
  c.stroke()
}

export default function CoachOrb({ size = 158 }: { size?: number }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const levelRef = useRef(0)

  // The page body is one server-rendered HTML string, so we portal into the
  // placeholder rather than restructuring it.
  useEffect(() => {
    setHost(document.getElementById('b-orb-mount'))
  }, [])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = size * dpr
    cv.height = size * dpr
    ctx.scale(dpr, dpr)

    // Reduced motion: draw one representative frame and stop.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(ctx, size, 1.4, 0.3)
      return
    }

    let raf = 0
    let running = true
    const t0 = performance.now()

    const loop = (now: number) => {
      if (!running) return
      const t = (now - t0) / 1000
      // Stand-in for the app's audio RMS: a slow, uneven speaking envelope.
      const env =
        0.16 +
        0.26 * (0.5 + 0.5 * Math.sin(t * 1.7)) +
        0.14 * (0.5 + 0.5 * Math.sin(t * 0.53 + 1.1))
      levelRef.current = Math.max(0, Math.min(1, env))
      draw(ctx, size, t, levelRef.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    // Don't burn frames on a backgrounded tab.
    const onVis = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        raf = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [size, host])

  if (!host) return null

  return createPortal(
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: 'block', borderRadius: '50%' }}
      aria-hidden="true"
    />,
    host,
  )
}
