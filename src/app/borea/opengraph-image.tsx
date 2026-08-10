import { ImageResponse } from 'next/og'

// Rendered from real HTML with the brand typeface rather than baked in an
// image editor, so the card can never drift out of sync with the site.
export const runtime = 'edge'
export const alt = 'Borea — the AI macro coach that talks back'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage() {
  const [extraBold, semiBold, regular, markPng] = await Promise.all([
    fetch(new URL('./InterDisplay-ExtraBold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./InterDisplay-SemiBold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./Inter-Regular.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./mark.png', import.meta.url)).then((r) => r.arrayBuffer()),
  ])
  // The real app icon rather than an approximation of it.
  const mark = `data:image/png;base64,${Buffer.from(markPng).toString('base64')}`

  // Satori supports flexbox and gradients but not filters, so the aurora is
  // built from wide, soft radial gradients rather than blurred shapes.
  const curtain = (top: string, left: string, w: string, h: string, rgb: string, a: number) => ({
    position: 'absolute' as const,
    top, left, width: w, height: h,
    background: `radial-gradient(ellipse at center, rgba(${rgb},${a}) 0%, rgba(${rgb},0) 70%)`,
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '64px 72px', position: 'relative',
          background: 'linear-gradient(150deg, #04081c 0%, #05162c 45%, #06251c 100%)',
          fontFamily: 'InterDisplay',
        }}
      >
        <div style={curtain('-16%', '-12%', '78%', '62%', '34,197,94', 0.42)} />
        <div style={curtain('-24%', '38%', '82%', '66%', '0,194,255', 0.34)} />
        <div style={curtain('30%', '52%', '70%', '78%', '140,115,255', 0.22)} />
        <div style={curtain('58%', '-18%', '76%', '66%', '34,197,94', 0.20)} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <img src={mark} width={80} height={80} style={{ borderRadius: 19 }} alt="" />
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: 10 }}>
            BOREA
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 78, fontWeight: 800, color: '#ffffff', letterSpacing: -2.5, lineHeight: 1.04 }}>
            The AI macro coach
          </div>
          <div style={{ display: 'flex', fontSize: 78, fontWeight: 800, color: '#5fe3a6', letterSpacing: -2.5, lineHeight: 1.04 }}>
            that talks back.
          </div>
          <div style={{ display: 'flex', fontSize: 29, fontFamily: 'Inter', color: '#aeb6cc', marginTop: 22, letterSpacing: -0.2 }}>
            Log by voice, photo, or barcode — then ask why the scale moved.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex', fontSize: 27, fontWeight: 600, color: '#0a1024',
              background: '#f2f6ff', padding: '14px 30px', borderRadius: 999,
            }}
          >
            boreaapp.com
          </div>
          <div style={{ display: 'flex', fontSize: 21, fontFamily: 'Inter', color: '#7f88a6', letterSpacing: 1 }}>
            Clarendon Labs · iPhone
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'InterDisplay', data: extraBold, weight: 800, style: 'normal' },
        { name: 'InterDisplay', data: semiBold, weight: 600, style: 'normal' },
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
      ],
    },
  )
}
