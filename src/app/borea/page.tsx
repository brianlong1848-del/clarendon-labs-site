import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Borea — The AI macro coach',
  description:
    'Borea is an AI macro & calorie coach from Clarendon Labs. Log meals by voice, photo, or barcode and get coaching that knows your macros, your DEXA scans, and your goals.',
}

const STYLE = `
  .borea-page { background: #070b1c; color: #f5f5f7; min-height: 100vh; font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .borea-page a { color: inherit; text-decoration: none; }
  .b-wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }
  .b-nav { display: flex; justify-content: space-between; align-items: center; padding: 22px 0; font-size: 14px; }
  .b-nav .mark { font-weight: 700; letter-spacing: -0.02em; font-size: 17px; }
  .b-nav .mark .dot { color: #7ef0c9; }
  .b-nav .links { display: flex; gap: 22px; color: #a1a6c0; }
  .b-nav .links a:hover { color: #fff; }
  .b-hero { position: relative; text-align: center; padding: 90px 0 70px; overflow: hidden; }
  .b-aurora { position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(60% 42% at 18% 0%, rgba(46,226,166,.28), transparent 65%),
      radial-gradient(55% 40% at 78% 6%, rgba(94,110,255,.30), transparent 65%),
      radial-gradient(40% 32% at 55% 18%, rgba(140,115,255,.22), transparent 70%);
    filter: blur(6px);
  }
  .b-star { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #fff; opacity: .6; }
  .b-hero .icon { width: 108px; height: 108px; border-radius: 26px; margin: 0 auto 26px; box-shadow: 0 18px 50px -12px rgba(46,226,166,.45); position: relative; }
  .b-hero h1 { margin: 0; font-size: clamp(56px, 9vw, 110px); font-weight: 800; letter-spacing: -0.045em; line-height: 1; }
  .b-hero h1 .stop { background: linear-gradient(120deg, #2ee2a6, #5e93ff, #8c73ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .b-hero .tag { font-size: clamp(19px, 2.2vw, 24px); color: #c9cede; margin: 18px auto 0; max-width: 44ch; line-height: 1.4; position: relative; }
  .b-pill { display: inline-flex; align-items: center; gap: 8px; margin-top: 28px; padding: 9px 18px; border-radius: 999px; font-size: 13.5px; font-weight: 500; color: #d9f7ec; background: rgba(46,226,166,.10); border: 1px solid rgba(46,226,166,.35); position: relative; }
  .b-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: #2ee2a6; box-shadow: 0 0 10px #2ee2a6; }
  .b-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; padding: 30px 0 60px; }
  @media (max-width: 860px) { .b-grid { grid-template-columns: 1fr; } }
  .b-card { background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.09); border-radius: 20px; padding: 26px; }
  .b-card h3 { margin: 0 0 8px; font-size: 18px; font-weight: 650; letter-spacing: -0.015em; }
  .b-card p { margin: 0; font-size: 14.5px; line-height: 1.55; color: #a9aec6; }
  .b-card .ic { font-size: 24px; margin-bottom: 14px; display: block; }
  .b-cta { text-align: center; padding: 20px 0 80px; }
  .b-cta .note { color: #a9aec6; font-size: 15px; max-width: 52ch; margin: 0 auto 22px; line-height: 1.55; }
  .b-btn { display: inline-flex; align-items: center; gap: 9px; background: #f5f5f7; color: #0b1024; font-weight: 600; font-size: 15px; padding: 13px 24px; border-radius: 14px; }
  .b-btn:hover { background: #fff; }
  .b-foot { border-top: 1px solid rgba(255,255,255,.08); padding: 26px 0 40px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-size: 13.5px; color: #8a90ad; }
  .b-foot .links { display: flex; gap: 20px; }
  .b-foot a:hover { color: #fff; }
`

const BODY = `
<div class="borea-page">
  <div class="b-wrap">
    <nav class="b-nav">
      <a href="/" class="mark">Clarendon<span class="dot">.</span></a>
      <div class="links"><a href="/#catalog">Catalog</a><a href="/support">Support</a><a href="/privacy">Privacy</a></div>
    </nav>
  </div>
  <header class="b-hero">
    <div class="b-aurora"></div>
    <span class="b-star" style="top:14%;left:12%"></span><span class="b-star" style="top:8%;left:38%"></span><span class="b-star" style="top:20%;left:64%;width:2px;height:2px"></span><span class="b-star" style="top:10%;left:86%"></span><span class="b-star" style="top:30%;left:26%;width:2px;height:2px"></span><span class="b-star" style="top:26%;left:90%"></span>
    <div class="b-wrap">
      <img class="icon" src="/icons/borea.png" alt="Borea app icon" width="108" height="108"/>
      <h1>Borea<span class="stop">.</span></h1>
      <p class="tag">The AI macro coach. Log meals by voice, photo, or barcode — and get coaching that actually knows your numbers, from tonight&#39;s sodium to your last DEXA scan.</p>
      <span class="b-pill"><span class="dot"></span>In TestFlight beta &middot; App Store next</span>
    </div>
  </header>
  <main class="b-wrap">
    <div class="b-grid">
      <div class="b-card"><span class="ic">&#127908;</span><h3>Say it, it&#39;s logged</h3><p>&ldquo;Two eggs, sourdough toast, and the same Greek yogurt bar I had yesterday.&rdquo; Borea works out the macros — grams weighed, sodium included.</p></div>
      <div class="b-card"><span class="ic">&#128247;</span><h3>Scan &amp; weigh</h3><p>Barcodes, photos of plates, and weighed portions in grams or ounces. Serving math is handled for you, every place you log.</p></div>
      <div class="b-card"><span class="ic">&#127756;</span><h3>A coach that talks back</h3><p>Ask anything about your day and hear the answer out loud. The coach reads your actual log — not generic advice.</p></div>
      <div class="b-card"><span class="ic">&#129514;</span><h3>DEXA-aware</h3><p>Sync body-composition scans and watch trends against what you eat and how you train, with plain-language insight.</p></div>
      <div class="b-card"><span class="ic">&#128241;</span><h3>Northern-lights widgets</h3><p>Water bottles that fill, protein batteries that charge, and a weight-journey arc — all glowing on an aurora night sky.</p></div>
      <div class="b-card"><span class="ic">&#127464;&#127462;</span><h3>Built for North America</h3><p>English and French from day one — d&eacute;jeuner, d&icirc;ner et souper compris. Grams or ounces, feet and inches welcome.</p></div>
    </div>
    <div class="b-cta">
      <p class="note">Borea is in closed beta with the App Store release on the way. Want in on the beta, or want a note when it ships?</p>
      <a class="b-btn" href="mailto:hello@clarendon.dev?subject=Borea%20beta">Get in touch &rarr;</a>
    </div>
  </main>
  <div class="b-wrap">
    <footer class="b-foot">
      <span>&copy; 2026 Clarendon Labs LLC &middot; Chicago</span>
      <div class="links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></div>
    </footer>
  </div>
</div>
`

export default function BoreaPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <div dangerouslySetInnerHTML={{ __html: BODY }} />
    </>
  )
}
