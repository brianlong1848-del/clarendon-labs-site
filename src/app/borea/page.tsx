import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Borea — The AI macro coach that talks back',
  description:
    'Borea is an AI macro and calorie counter for iPhone. Log meals by voice, photo, or barcode, sync your DEXA scans, and get coaching that reads your actual log instead of handing you generic advice.',
  // The root layout's metadataBase is clarendon.dev, which would resolve the
  // preview image to the wrong host. Borea has its own domain now.
  metadataBase: new URL('https://boreaapp.com'),
  alternates: { canonical: 'https://boreaapp.com' },
  openGraph: {
    title: 'Borea — The AI macro coach that talks back',
    description:
      'Log meals by voice, photo, or barcode. Get coaching that knows your macros, your DEXA scans, and your goals.',
    url: 'https://boreaapp.com',
    siteName: 'Borea',
    // The card itself comes from opengraph-image.tsx beside this file, which
    // Next wires up automatically — listing images here would override it.
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Borea — The AI macro coach that talks back',
    description:
      'Log meals by voice, photo, or barcode. Get coaching that knows your macros, your DEXA scans, and your goals.',
  },
}

const FAQ = [
  {
    q: 'What makes Borea different from MyFitnessPal or Cronometer?',
    a: 'Those apps are databases with a diary attached — they tell you what you ate. Borea reads the same log and tells you what to do about it. Ask why your weight stalled and the coach answers from your actual numbers, out loud if you want, rather than serving a generic article.',
  },
  {
    q: 'Does Borea count macros as well as calories?',
    a: 'Yes. Protein, carbs, fat, water and sodium are tracked on every entry, with weighed portions in grams or ounces. Protein has a hard floor in every plan because holding lean mass is the point of the whole exercise.',
  },
  {
    q: 'Can I log a meal by talking?',
    a: 'Yes. Say "two eggs, sourdough toast, and the same yogurt bar as yesterday" and Borea works out the macros, including the serving maths. You can also scan a barcode, photograph the plate, or type it.',
  },
  {
    q: 'Does Borea work with DEXA scans?',
    a: 'Yes, and it is the reason the coaching is different. Sync your body-composition scans and Borea separates fat loss from lean-mass loss, so the advice protects muscle instead of chasing scale weight.',
  },
  {
    q: 'Where is my health data stored?',
    a: 'On your iPhone. Your log, weigh-ins and progress photos live on the device. When you ask the coach a question the relevant numbers are sent to process that question and are not used to train any model, and your health data is never used for advertising.',
  },
  {
    q: 'What does Borea cost?',
    a: 'Borea Pro is $7.99 a month or $59.99 a year, with a 7-day free trial. One subscription covers everything: the coach, the plans, the widgets and the transformation reels.',
  },
  {
    q: 'Is Borea available in French?',
    a: 'Yes. Borea ships in English and Canadian French from day one, including the meal names Quebecers actually use — déjeuner, dîner et souper.',
  },
]

const STYLE = `
  /* ---- Aurora ground -------------------------------------------------
     One fixed layer behind everything: a night sky, four curtains of light
     that drift on long, offset cycles, and a star field. Fixed rather than
     scrolling, so the page feels like it is moving through the sky. */
  .borea-page { position:relative; background:#04081a; color:#f5f6fb; min-height:100vh; overflow-x:hidden;
    font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  .borea-page a { color:inherit; text-decoration:none; }

  .sky { position:fixed; inset:0; pointer-events:none; z-index:0;
    background:linear-gradient(175deg,#04081c 0%,#051229 38%,#041a26 68%,#05221a 100%); }
  .sky b { position:absolute; display:block; border-radius:50%; filter:blur(70px); mix-blend-mode:screen; }
  .sky b.c1 { top:-22%; left:-18%; width:78%; height:66%; background:radial-gradient(ellipse at center,rgba(34,197,94,.55),transparent 68%); animation:drift1 26s ease-in-out infinite; }
  .sky b.c2 { top:-30%; left:32%; width:80%; height:70%; background:radial-gradient(ellipse at center,rgba(0,194,255,.45),transparent 68%); animation:drift2 32s ease-in-out infinite; }
  .sky b.c3 { top:18%;  left:46%; width:72%; height:80%; background:radial-gradient(ellipse at center,rgba(140,115,255,.32),transparent 70%); animation:drift3 38s ease-in-out infinite; }
  .sky b.c4 { top:52%;  left:-22%; width:82%; height:72%; background:radial-gradient(ellipse at center,rgba(34,197,94,.30),transparent 70%); animation:drift1 30s ease-in-out infinite reverse; }
  @keyframes drift1 { 0%,100%{transform:translate3d(0,0,0) scale(1)} 50%{transform:translate3d(7%,4%,0) scale(1.13)} }
  @keyframes drift2 { 0%,100%{transform:translate3d(0,0,0) scale(1.05)} 50%{transform:translate3d(-8%,6%,0) scale(.92)} }
  @keyframes drift3 { 0%,100%{transform:translate3d(0,0,0) scale(.95)} 50%{transform:translate3d(5%,-5%,0) scale(1.15)} }
  .stars { position:fixed; inset:0; pointer-events:none; z-index:0; }
  .stars i { position:absolute; width:2px; height:2px; border-radius:50%; background:#fff; opacity:.5; animation:tw 4s ease-in-out infinite; }
  @keyframes tw { 0%,100%{opacity:.18} 50%{opacity:.85} }
  @media (prefers-reduced-motion: reduce) { .sky b, .stars i, .b-orb i, .b-ring { animation:none !important; } }

  .b-wrap { position:relative; z-index:1; max-width:1080px; margin:0 auto; padding:0 24px; }
  .b-sec { position:relative; z-index:1; padding:76px 0; }
  .b-sec + .b-sec { border-top:1px solid rgba(255,255,255,.07); }
  .b-eyebrow { font-size:12px; letter-spacing:.16em; text-transform:uppercase; font-weight:700;
    background:linear-gradient(90deg,#22c55e,#00c2ff); -webkit-background-clip:text; background-clip:text; color:transparent; margin:0 0 12px; }
  .b-sec h2 { margin:0 0 10px; font-size:clamp(28px,3.8vw,42px); font-weight:800; letter-spacing:-0.035em; line-height:1.08; }
  .b-sec .lede { margin:0 0 34px; color:#a9b0c8; font-size:17px; line-height:1.62; max-width:60ch; }

  /* ---- Nav ---- */
  .b-nav { display:flex; justify-content:space-between; align-items:center; padding:20px 0; font-size:14px; }
  .b-nav .mark { display:flex; align-items:center; gap:10px; font-weight:800; letter-spacing:-0.01em; font-size:17px; }
  .b-nav .mark img { width:30px; height:30px; border-radius:8px; }
  .b-nav .links { display:flex; gap:24px; color:#9aa2bd; }
  .b-nav .links a:hover { color:#fff; }
  @media (max-width:640px){ .b-nav .links a.hide-sm { display:none; } }

  /* ---- Hero ---- */
  .b-hero { position:relative; z-index:1; text-align:center; padding:74px 0 56px; }
  .b-hero .icon { width:112px; height:112px; border-radius:27px; margin:0 auto 26px; display:block;
    box-shadow:0 26px 70px -18px rgba(34,197,94,.65), 0 0 0 1px rgba(255,255,255,.08); }
  .b-hero h1 { margin:0; font-size:clamp(52px,9vw,104px); font-weight:800; letter-spacing:-0.05em; line-height:.98; }
  .b-hero h1 .stop { background:linear-gradient(120deg,#22c55e,#00c2ff,#8c73ff); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .b-hero .tag { font-size:clamp(19px,2.3vw,25px); color:#c3cadd; margin:20px auto 0; max-width:46ch; line-height:1.42; }
  .b-pill { display:inline-flex; align-items:center; gap:9px; margin-top:28px; padding:10px 20px; border-radius:999px; font-size:13.5px; font-weight:600; color:#d9f7ec;
    background:rgba(34,197,94,.10); border:1px solid rgba(34,197,94,.38); backdrop-filter:blur(8px); }
  .b-pill .dot { width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 12px #22c55e; animation:tw 2.4s ease-in-out infinite; }

  /* ---- Phones ---- */
  .b-phones { display:flex; justify-content:center; align-items:flex-end; gap:26px; padding:20px 0 4px; perspective:1400px; }
  .b-phone { width:230px; border-radius:38px; padding:9px; background:linear-gradient(160deg,rgba(255,255,255,.20),rgba(255,255,255,.04));
    box-shadow:0 40px 90px -30px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.07); }
  .b-phone img { display:block; width:100%; border-radius:30px; }
  .b-phone.side { width:200px; opacity:.85; }
  .b-phone.l { transform:rotateY(15deg) translateY(16px); }
  .b-phone.r { transform:rotateY(-15deg) translateY(16px); }
  @media (max-width:820px){ .b-phone.side { display:none; } }

  /* ---- Cards ---- */
  .b-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  .b-steps { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  @media (max-width:880px){ .b-grid, .b-steps { grid-template-columns:1fr; } }
  .b-card, .b-step { position:relative; border-radius:22px; padding:26px; overflow:hidden;
    background:linear-gradient(165deg,rgba(255,255,255,.075),rgba(255,255,255,.025));
    border:1px solid rgba(255,255,255,.10); backdrop-filter:blur(14px);
    transition:transform .25s ease, border-color .25s ease; }
  .b-card::before, .b-step::before { content:''; position:absolute; inset:0 0 auto 0; height:1px;
    background:linear-gradient(90deg,transparent,rgba(0,194,255,.65),rgba(34,197,94,.55),transparent); opacity:.75; }
  .b-card:hover, .b-step:hover { transform:translateY(-3px); border-color:rgba(0,194,255,.32); }
  .b-card h3, .b-step h3 { margin:0 0 8px; font-size:18px; font-weight:700; letter-spacing:-0.02em; }
  .b-card p, .b-step p { margin:0; font-size:14.5px; line-height:1.6; color:#a6adc6; }
  .b-card .ic { font-size:25px; margin-bottom:14px; display:block; }
  .b-step .n { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:10px; font-size:14px; font-weight:800; margin-bottom:14px;
    background:linear-gradient(140deg,rgba(0,194,255,.28),rgba(34,197,94,.20)); color:#bfe9ff; border:1px solid rgba(0,194,255,.32); }

  /* ---- Coach ---- */
  .b-coach { display:grid; grid-template-columns:230px 1fr; gap:34px; align-items:center; }
  @media (max-width:880px){ .b-coach { grid-template-columns:1fr; gap:26px; justify-items:center; } }
  .b-orb-wrap { position:relative; width:190px; height:190px; display:grid; place-items:center; }
  .b-orb { position:relative; width:158px; height:158px; border-radius:50%; overflow:hidden;
    background:radial-gradient(circle at 34% 30%,#0d1738 0%,#050a1a 60%,#01030a 100%);
    box-shadow:0 0 56px -6px rgba(34,197,94,.5), inset 0 0 34px rgba(0,0,0,.8); }
  .b-orb i.band { position:absolute; left:-40%; width:180%; height:42%; border-radius:50%; filter:blur(13px); opacity:.55; }
  .b-orb i.b1 { top:12%; background:linear-gradient(90deg,transparent,rgba(140,115,255,.9),transparent); animation:bDrift 7.5s ease-in-out infinite; }
  .b-orb i.b2 { top:33%; background:linear-gradient(90deg,transparent,rgba(0,194,255,.9),transparent); animation:bDrift 6s ease-in-out infinite reverse; }
  .b-orb i.b3 { top:54%; background:linear-gradient(90deg,transparent,rgba(34,197,94,1),transparent); animation:bDrift 5s ease-in-out infinite; }
  .b-orb i.star { position:absolute; width:2px; height:2px; border-radius:50%; background:#fff; opacity:.75; animation:tw 3.4s ease-in-out infinite; }
  .b-ring { position:absolute; border-radius:50%; border:1px solid rgba(0,194,255,.35); width:158px; height:158px; animation:ringPulse 2.6s ease-out infinite; }
  .b-ring.r2 { border-color:rgba(34,197,94,.30); animation-delay:1.3s; }
  @keyframes bDrift { 0%,100%{transform:translateX(-8%) scaleY(.85); opacity:.4} 50%{transform:translateX(8%) scaleY(1.15); opacity:.78} }
  @keyframes ringPulse { 0%{transform:scale(.92); opacity:.7} 100%{transform:scale(1.6); opacity:0} }
  .b-orb-cap { margin-top:14px; font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:#7d85a4; font-weight:700; text-align:center; }

  .b-chat { background:linear-gradient(165deg,rgba(255,255,255,.075),rgba(255,255,255,.025));
    border:1px solid rgba(255,255,255,.11); border-radius:24px; padding:26px; backdrop-filter:blur(14px); }
  .b-msg { margin:0 0 16px; font-size:15.5px; line-height:1.6; }
  .b-msg:last-child { margin-bottom:0; }
  .b-msg .who { display:block; font-size:11px; letter-spacing:.13em; text-transform:uppercase; color:#7d85a4; margin-bottom:6px; font-weight:700; }
  .b-msg.you { color:#dde2f1; }
  .b-msg.coach { color:#c3ecd8; }

  /* ---- Pricing ---- */
  .b-price { display:grid; grid-template-columns:repeat(2,1fr); gap:18px; max-width:660px; }
  @media (max-width:700px){ .b-price { grid-template-columns:1fr; } }
  .b-plan { position:relative; border-radius:22px; padding:26px; overflow:hidden;
    background:linear-gradient(165deg,rgba(255,255,255,.07),rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.11); backdrop-filter:blur(14px); }
  .b-plan.best { border-color:rgba(34,197,94,.5); background:linear-gradient(165deg,rgba(34,197,94,.16),rgba(34,197,94,.03)); }
  .b-plan .name { font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:#8d94b1; font-weight:700; }
  .b-plan .amt { font-size:38px; font-weight:800; letter-spacing:-0.035em; margin:10px 0 2px; }
  .b-plan .per { font-size:14px; color:#a6adc6; }
  .b-plan .save { display:inline-block; margin-top:12px; font-size:12.5px; font-weight:700; color:#7ef0c9; }

  /* ---- FAQ ---- */
  .b-faq { max-width:780px; }
  .b-q { border-top:1px solid rgba(255,255,255,.09); padding:22px 0; }
  .b-q:first-child { border-top:none; }
  .b-q h3 { margin:0 0 8px; font-size:17.5px; font-weight:700; letter-spacing:-0.02em; }
  .b-q p { margin:0; font-size:15.5px; line-height:1.62; color:#a6adc6; }

  /* ---- CTA + footer ---- */
  .b-cta { position:relative; z-index:1; text-align:center; padding:70px 0 84px; border-top:1px solid rgba(255,255,255,.07); }
  .b-cta .note { color:#b3bad0; font-size:17px; max-width:52ch; margin:0 auto 26px; line-height:1.55; }
  .borea-page a.b-btn { display:inline-flex; align-items:center; gap:9px; background:#f2f6ff; color:#0a1024;
    font-weight:700; font-size:15.5px; padding:15px 28px; border-radius:15px;
    box-shadow:0 16px 40px -14px rgba(0,194,255,.75); transition:transform .2s ease; }
  .borea-page a.b-btn:hover { background:#fff; color:#0a1024; transform:translateY(-2px); }
  .b-foot { position:relative; z-index:1; border-top:1px solid rgba(255,255,255,.08); padding:26px 0 44px;
    display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; font-size:13.5px; color:#848bab; }
  .b-foot .links { display:flex; gap:20px; }
  .b-foot a:hover { color:#fff; }
`

const STARS = Array.from({ length: 46 }, (_, i) => {
  // Deterministic so server and client markup match.
  const x = (i * 97) % 100
  const y = (i * 61) % 100
  const d = ((i * 37) % 40) / 10
  return `<i style="top:${y}%;left:${x}%;animation-delay:${d}s"></i>`
}).join('')

const faqHtml = FAQ.map(
  (f) => `<div class="b-q"><h3>${f.q}</h3><p>${f.a}</p></div>`,
).join('')

const BODY = `
<div class="borea-page">
  <div class="sky"><b class="c1"></b><b class="c2"></b><b class="c3"></b><b class="c4"></b></div>
  <div class="stars">${STARS}</div>
  <div class="b-wrap">
    <nav class="b-nav">
      <a href="/" class="mark"><img src="/icons/borea.png" alt="" width="28" height="28"/>Borea</a>
      <div class="links">
        <a href="#how">How it works</a>
        <a href="#coach" class="hide-sm">The coach</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq" class="hide-sm">FAQ</a>
      </div>
    </nav>
  </div>

  <header class="b-hero">
    <div class="b-wrap">
      <img class="icon" src="/icons/borea.png" alt="Borea app icon" width="104" height="104"/>
      <h1>Borea<span class="stop">.</span></h1>
      <p class="tag">The AI macro coach that talks back. Log by voice, photo, or barcode &mdash; then ask why the scale moved and get an answer from your own numbers.</p>
      <span class="b-pill"><span class="dot"></span>In TestFlight beta &middot; App Store next</span>
    </div>
  </header>

  <main>
    <section class="b-sec" id="how">
      <div class="b-wrap">
        <p class="b-eyebrow">How it works</p>
        <h2>Three taps, or none at all</h2>
        <p class="lede">Most tracking apps die on the friction of logging. Borea is built so the boring part takes seconds and the useful part happens on its own.</p>
        <div class="b-steps">
          <div class="b-step"><span class="n">1</span><h3>Log it however you like</h3><p>Talk to it, scan a barcode, photograph the plate, or weigh a portion in grams. The serving maths is handled everywhere you log.</p></div>
          <div class="b-step"><span class="n">2</span><h3>Borea does the reading</h3><p>Weighed grams, sodium, water, protein against a floor that never moves. Your DEXA scans and Apple Health weigh-ins fold in automatically.</p></div>
          <div class="b-step"><span class="n">3</span><h3>Ask it anything</h3><p>&ldquo;Why am I stalling?&rdquo; The coach answers out loud from your actual log, and will tell you when the plan you want isn&rsquo;t the plan physics allows.</p></div>
        </div>
      </div>
    </section>

    <section class="b-sec" id="coach">
      <div class="b-wrap">
        <p class="b-eyebrow">The coach</p>
        <h2>A coach, not a search box</h2>
        <p class="lede">Borea reads what you actually ate and what your body actually did. It has opinions, it shows its working, and it would rather be honest than encouraging.</p>
        <div class="b-coach">
          <div>
            <div class="b-orb-wrap">
              <span class="b-ring"></span>
              <span class="b-ring r2"></span>
              <div class="b-orb">
                <i class="band b1"></i><i class="band b2"></i><i class="band b3"></i>
                <i class="star" style="top:18%;left:26%"></i><i class="star" style="top:31%;left:68%;animation-delay:.6s"></i>
                <i class="star" style="top:52%;left:18%;animation-delay:1.1s"></i><i class="star" style="top:44%;left:82%;animation-delay:1.7s"></i>
                <i class="star" style="top:70%;left:40%;animation-delay:.3s"></i><i class="star" style="top:76%;left:64%;animation-delay:2.1s"></i>
                <i class="star" style="top:24%;left:47%;animation-delay:1.4s"></i><i class="star" style="top:62%;left:73%;animation-delay:.9s"></i>
              </div>
            </div>
            <div class="b-orb-cap">The coach, thinking</div>
          </div>
        <div class="b-chat">
          <p class="b-msg you"><span class="who">You</span>Why is my weight up when I hit my calories all week?</p>
          <p class="b-msg coach"><span class="who">Borea</span>Because you ate 4,800&nbsp;mg of sodium on Saturday and 1,100 on Sunday. That&rsquo;s water, not fat &mdash; your seven-day average is still down 0.9&nbsp;lb, and your last DEXA says the lean mass is holding. Nothing is wrong. Drink, and ignore the scale until Wednesday.</p>
        </div>
        </div>
      </div>
    </section>

    <section class="b-sec">
      <div class="b-wrap">
        <p class="b-eyebrow">Features</p>
        <h2>What&rsquo;s in it</h2>
        <div class="b-grid">
          <div class="b-card"><span class="ic">&#127908;</span><h3>Say it, it&rsquo;s logged</h3><p>&ldquo;Two eggs, sourdough toast, and the same Greek yogurt bar I had yesterday.&rdquo; Borea works out the macros &mdash; grams weighed, sodium included.</p></div>
          <div class="b-card"><span class="ic">&#128247;</span><h3>Scan &amp; weigh</h3><p>Barcodes, photos of plates, and weighed portions in grams or ounces. Serving math is handled for you, every place you log.</p></div>
          <div class="b-card"><span class="ic">&#129514;</span><h3>DEXA-aware</h3><p>Sync body-composition scans and watch fat and lean mass move separately, so the advice protects muscle instead of chasing the scale.</p></div>
          <div class="b-card"><span class="ic">&#128197;</span><h3>Plans with a spine</h3><p>Pick a target and a date. If the maths doesn&rsquo;t work Borea says so, with humour, and offers the date that does &mdash; or the result that date can actually deliver.</p></div>
          <div class="b-card"><span class="ic">&#127909;</span><h3>Transformation reels</h3><p>Progress photos are body-aligned with Vision, then played back as a morph you can export as a GIF to text or a 9:16 video for Reels and TikTok.</p></div>
          <div class="b-card"><span class="ic">&#127756;</span><h3>Northern-lights widgets</h3><p>Water bottles that fill, protein batteries that charge, and a weight-journey arc &mdash; all glowing on an aurora night sky.</p></div>
        </div>
      </div>
    </section>

    <section class="b-sec">
      <div class="b-wrap">
        <p class="b-eyebrow">Privacy</p>
        <h2>Your health data stays yours</h2>
        <p class="lede">Your log, your weigh-ins and your progress photos live on your iPhone. When you ask the coach a question, the numbers needed to answer it are sent to process that question &mdash; nothing more. Your health data is never used for advertising, never sold, and never used to train a model. Delete the app and it goes with it.</p>
        <a class="b-btn" href="/privacy">Read the privacy policy &rarr;</a>
      </div>
    </section>

    <section class="b-sec" id="pricing">
      <div class="b-wrap">
        <p class="b-eyebrow">Pricing</p>
        <h2>One subscription, everything in it</h2>
        <p class="lede">No credit packs, no locked features, no upsell for the coach. Seven days free, cancel in two taps.</p>
        <div class="b-price">
          <div class="b-plan"><span class="name">Monthly</span><div class="amt">$7.99</div><div class="per">per month</div></div>
          <div class="b-plan best"><span class="name">Yearly</span><div class="amt">$59.99</div><div class="per">per year</div><span class="save">Save 37% &middot; under $5 a month</span></div>
        </div>
      </div>
    </section>

    <section class="b-sec" id="faq">
      <div class="b-wrap">
        <p class="b-eyebrow">FAQ</p>
        <h2>Questions</h2>
        <div class="b-faq">${faqHtml}</div>
      </div>
    </section>

    <section class="b-cta">
      <div class="b-wrap">
        <p class="note">Borea is in closed beta with the App Store release on the way. Want in on the beta, or a note when it ships?</p>
        <a class="b-btn" href="mailto:hello@clarendon.dev?subject=Borea%20beta">Get in touch &rarr;</a>
      </div>
    </section>
  </main>

  <div class="b-wrap">
    <footer class="b-foot">
      <span>&copy; 2026 <a href="https://clarendon.dev">Clarendon Labs LLC</a> &middot; Chicago</span>
      <div class="links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></div>
    </footer>
  </div>
</div>
`

const JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Borea',
      applicationCategory: 'HealthApplication',
      operatingSystem: 'iOS',
      description:
        'An AI macro and calorie coach for iPhone. Log meals by voice, photo, or barcode, sync DEXA scans, and get coaching that reads your actual log.',
      url: 'https://boreaapp.com',
      publisher: { '@type': 'Organization', name: 'Clarendon Labs LLC', url: 'https://clarendon.dev' },
      offers: [
        { '@type': 'Offer', price: '7.99', priceCurrency: 'USD', name: 'Borea Pro monthly' },
        { '@type': 'Offer', price: '59.99', priceCurrency: 'USD', name: 'Borea Pro yearly' },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}

export default function BoreaPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
      />
      <div dangerouslySetInnerHTML={{ __html: BODY }} />
    </>
  )
}
