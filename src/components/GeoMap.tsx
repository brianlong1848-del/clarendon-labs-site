'use client'
import { useEffect, useMemo, useState } from 'react'
import { C } from '@/components/AdminNav'

// ─── GeoMap ──────────────────────────────────────────────────────────────────
//
// A dependency-free choropleth for the analytics pages. Draws either the
// world (/geo/world.json, keyed by ISO-2) or one country's states/provinces
// (/geo/admin1/<CC>.json, keyed by ISO 3166-2) — the same files the Studio
// iOS app reads, so both show identical shapes. Equirectangular projection
// with a cos(latitude) squash so mid-latitude countries don't look stretched;
// countries that straddle the antimeridian (US, Russia, Fiji…) are unwrapped.

type Ring = [number, number][]
type Geometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] }
type Feature = { properties: { c: string; n: string; t?: string }; geometry: Geometry | null }

const cache = new Map<string, Promise<Feature[]>>()
function load(path: string) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => (r.ok ? r.json() : { features: [] })).then((j) => j.features ?? []).catch(() => []))
  }
  return cache.get(path)!
}

function polygons(g: Geometry | null): Ring[][] {
  if (!g) return []
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates
}

export type GeoValue = { code: string; value: number }

export function GeoMap({
  scope, values, accent = C.mint, selected, onSelect, height = 360, format = (n) => n.toLocaleString('en-US'),
}: {
  scope: 'world' | string            // 'world' or an ISO-2 country code
  values: GeoValue[]
  accent?: string
  selected?: string | null
  onSelect?: (code: string, name: string) => void
  height?: number
  format?: (n: number) => string
}) {
  const [features, setFeatures] = useState<Feature[] | null>(null)
  const [hover, setHover] = useState<{ code: string; name: string; x: number; y: number } | null>(null)

  useEffect(() => {
    setFeatures(null)
    load(scope === 'world' ? '/geo/world.json' : `/geo/admin1/${scope}.json`).then(setFeatures)
  }, [scope])

  const byCode = useMemo(() => new Map(values.map((v) => [v.code, v.value])), [values])
  const max = useMemo(() => Math.max(1, ...values.map((v) => v.value)), [values])

  const drawn = useMemo(() => {
    if (!features) return null
    // Antimeridian unwrap: pick the longitude shift that gives the tightest box.
    const lons: number[] = []
    for (const f of features) for (const poly of polygons(f.geometry)) for (const ring of poly) for (const p of ring) lons.push(p[0])
    const span = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
    let shift: 'none' | 'east' | 'west' = 'none'
    if (scope !== 'world' && lons.length && span(lons) > 180) {
      const east = span(lons.map((x) => (x < 0 ? x + 360 : x)))
      const west = span(lons.map((x) => (x > 0 ? x - 360 : x)))
      shift = east < west ? 'east' : 'west'
    }
    const fx = (x: number) => (shift === 'east' && x < 0 ? x + 360 : shift === 'west' && x > 0 ? x - 360 : x)

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const f of features) for (const poly of polygons(f.geometry)) for (const ring of poly) for (const [x0, y] of ring) {
      const x = fx(x0)
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    if (scope === 'world') { minY = Math.max(minY, -57); maxY = Math.min(maxY, 84) }
    const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180)
    const W = 1000
    const w = (maxX - minX) * k || 1, h = maxY - minY || 1
    const H = Math.min(1000, Math.max(300, (W * h) / w))
    const s = Math.min(W / w, H / h) * 0.96
    const ox = (W - w * s) / 2, oy = (H - h * s) / 2
    const px = (x: number) => ox + (fx(x) - minX) * k * s
    const py = (y: number) => oy + (maxY - y) * s

    return {
      W, H,
      paths: features.map((f) => ({
        code: f.properties.c, name: f.properties.n,
        d: polygons(f.geometry).map((poly) => poly.map((ring) =>
          ring.map(([x, y], i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join('') + 'Z').join('')).join(''),
      })),
    }
  }, [features, scope])

  const fill = (code: string) => {
    const v = byCode.get(code) ?? 0
    if (!v) return C.card2
    const t = 0.18 + 0.82 * Math.sqrt(v / max)
    return `color-mix(in srgb, ${accent} ${Math.round(t * 100)}%, ${C.card})`
  }

  return (
    <div style={{ position: 'relative', width: '100%', height, background: C.paper, borderRadius: 12, overflow: 'hidden' }}
         onMouseLeave={() => setHover(null)}>
      {!drawn ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: C.soft, fontSize: 13 }}>Loading map…</div>
      ) : drawn.paths.length === 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: C.soft, fontSize: 13 }}>No map shapes for this country.</div>
      ) : (
        <svg viewBox={`0 0 ${drawn.W} ${drawn.H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img"
             aria-label={scope === 'world' ? 'World map' : `Map of ${scope}`}>
          {drawn.paths.map((p) => {
            const isSel = selected === p.code
            const clickable = !!onSelect
            return (
              <path key={p.code + p.name} d={p.d} fill={fill(p.code)} fillRule="evenodd"
                stroke={isSel ? C.ink : C.card} strokeWidth={isSel ? 1.6 : 0.6} vectorEffect="non-scaling-stroke"
                style={{ cursor: clickable ? 'pointer' : 'default', transition: 'fill .2s' }}
                onMouseMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                  setHover({ code: p.code, name: p.name, x: e.clientX - r.left, y: e.clientY - r.top })
                }}
                onClick={() => onSelect?.(p.code, p.name)}>
                <title>{p.name}</title>
              </path>
            )
          })}
        </svg>
      )}
      {hover && (
        <div style={{ position: 'absolute', left: Math.min(hover.x + 12, 9999), top: hover.y + 12, pointerEvents: 'none',
                      background: C.ink, color: C.paper, borderRadius: 8, padding: '6px 10px', fontSize: 12.5, whiteSpace: 'nowrap',
                      boxShadow: '0 4px 14px rgba(0,0,0,.18)' }}>
          <b>{hover.name}</b> · {format(byCode.get(hover.code) ?? 0)}
        </div>
      )}
    </div>
  )
}
