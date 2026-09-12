import type { Copy } from './copy'
import { APP_STORE_URL } from './copy'

// The page is one server-rendered HTML string in two languages. Everything
// language-specific lives in copy.ts; everything visual lives here, so the
// English and French pages cannot drift apart in layout or style.

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
  @media (prefers-reduced-motion: reduce) { .sky b, .stars i { animation:none !important; } }

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
  @media (max-width:480px){ .b-nav .links a:not(.lang) { display:none; } }

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

  /* ---- Phones ----------------------------------------------------------
     Real screenshots from the app, in a thin frame. The frame is deliberately
     plain — no notch, no buttons drawn on — because the screenshot already
     carries the iPhone chrome and a second layer of it reads as a mockup
     kit. The side phones are lower and tilted, so the eye lands on Today. */
  .b-phones { display:flex; justify-content:center; align-items:flex-end; gap:22px; padding:54px 0 0; perspective:1600px; }
  .b-phone { width:250px; border-radius:40px; padding:8px; background:linear-gradient(160deg,rgba(255,255,255,.18),rgba(255,255,255,.03));
    box-shadow:0 50px 110px -34px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.08), 0 0 90px -20px rgba(0,194,255,.35); }
  .b-phone img { display:block; width:100%; height:auto; border-radius:32px; }
  .b-phone.side { width:214px; opacity:.82; }
  .b-phone.l { transform:rotateY(14deg) translateY(28px); }
  .b-phone.r { transform:rotateY(-14deg) translateY(28px); }
  @media (max-width:820px){ .b-phone.side { display:none; } .b-phones { padding-top:40px; } .b-phone { width:230px; } }
  .b-hero { padding-bottom:64px; }

  /* ---- Two-column sections: text beside a phone ---- */
  .b-split { display:grid; grid-template-columns:1.1fr .9fr; gap:48px; align-items:center; }
  .b-split.flip { grid-template-columns:.9fr 1.1fr; }
  .b-split.flip > :first-child { order:2; }
  @media (max-width:880px){ .b-split, .b-split.flip { grid-template-columns:1fr; gap:30px; } .b-split.flip > :first-child { order:0; } }
  .b-split .b-phone { margin:0 auto; width:260px; }
  .b-split .b-phone.wide { width:280px; }
  @media (max-width:880px){ .b-split .b-phone, .b-split .b-phone.wide { width:230px; } }

  /* ---- Steps: a rail, not three cards ---- */
  .b-steps { display:flex; flex-direction:column; }
  .b-step { position:relative; display:grid; grid-template-columns:44px 1fr; gap:16px; padding:20px 0; border-top:1px solid rgba(255,255,255,.09); }
  .b-step:first-child { border-top:none; padding-top:4px; }
  .b-step h3 { margin:0 0 6px; font-size:18px; font-weight:700; letter-spacing:-0.02em; }
  .b-step p { margin:0; font-size:15px; line-height:1.6; color:#a6adc6; max-width:48ch; }
  .b-step .n { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:11px; font-size:14px; font-weight:800; margin-top:1px;
    background:linear-gradient(140deg,rgba(0,194,255,.28),rgba(34,197,94,.20)); color:#bfe9ff; border:1px solid rgba(0,194,255,.32); }

  /* ---- Features: rows with a glyph, two columns ---- */
  .b-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:0 44px; }
  @media (max-width:760px){ .b-grid { grid-template-columns:1fr; } }
  .b-card { display:grid; grid-template-columns:34px 1fr; gap:16px; padding:22px 0; border-top:1px solid rgba(255,255,255,.09); }
  .b-grid .b-card:nth-child(-n+2) { border-top:none; padding-top:6px; }
  @media (max-width:760px){ .b-grid .b-card:nth-child(2) { border-top:1px solid rgba(255,255,255,.09); padding-top:22px; } }
  .b-card h3 { margin:0 0 6px; font-size:18px; font-weight:700; letter-spacing:-0.02em; }
  .b-card p { margin:0; font-size:15px; line-height:1.6; color:#a6adc6; }
  .b-card .ic { width:30px; height:30px; margin-top:1px; color:#7ef0c9; }
  .b-card .ic svg { width:30px; height:30px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round; }

  /* ---- Coach ---- */
  .b-coach { display:grid; grid-template-columns:230px 1fr; gap:34px; align-items:center; }
  @media (max-width:880px){ .b-coach { grid-template-columns:1fr; gap:26px; justify-items:center; } }
  .b-orb-wrap { position:relative; width:190px; height:190px; margin:0 auto; display:grid; place-items:center; }
  .b-orb { width:170px; height:170px; border-radius:50%; overflow:hidden; display:block;
    border:1px solid rgba(255,255,255,.14); box-shadow:0 0 44px rgba(34,197,94,.5); background:#080d21; }
  .b-orb canvas { display:block; width:100%; height:100%; }
  .b-orb-cap { margin-top:16px; font-size:15px; font-weight:700; color:#f2f6ff; text-align:center; letter-spacing:-0.01em; }
  .b-phase { margin-top:6px; min-height:18px; font-size:13px; color:rgba(242,246,255,.75); text-align:center; transition:opacity .35s; }
  .b-phase.fade { opacity:0; }
  .b-horizon { position:relative; width:190px; height:8px; margin:16px auto 0; border-radius:99px; background:rgba(255,255,255,.10); overflow:visible; }
  .b-horizon i { position:absolute; left:0; top:0; height:100%; width:8px; border-radius:99px;
    background:linear-gradient(90deg,#22c55e,#00c2ff,#8c73ff); box-shadow:0 0 6px rgba(0,194,255,.6); transition:width .15s linear; }

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
  /* ---- Language toggle ------------------------------------------------
     The site ships in both of the app's languages. The switch sits in the
     nav next to the section links and uses absolute URLs, because this page
     is served from two hosts and a relative /fr only resolves on one. */
  .b-nav .lang { display:inline-flex; align-items:center; justify-content:center; min-width:38px; padding:5px 10px;
    border-radius:999px; font-size:12.5px; font-weight:700; letter-spacing:.06em; color:#bfe9ff;
    background:rgba(0,194,255,.10); border:1px solid rgba(0,194,255,.30); }
  .b-nav .lang:hover { color:#fff; border-color:rgba(0,194,255,.6); background:rgba(0,194,255,.18); }

  /* ---- App Store button ----------------------------------------------
     Replaces the "in TestFlight beta" pill now that Borea is actually on the
     store. Kept as a real link with a real label rather than a badge image,
     so it stays legible at any size and needs no asset. */
  .b-dl { display:inline-flex; align-items:center; gap:10px; margin-top:30px; padding:15px 30px; border-radius:999px;
    font-size:16.5px; font-weight:700; letter-spacing:-0.01em; color:#04122a;
    background:linear-gradient(120deg,#7ef0b4,#22c55e 38%,#00c2ff);
    box-shadow:0 20px 46px -14px rgba(0,194,255,.66), 0 0 0 1px rgba(255,255,255,.14);
    transition:transform .2s ease, box-shadow .2s ease; }
  .b-dl:hover { transform:translateY(-2px); box-shadow:0 26px 56px -14px rgba(0,194,255,.8), 0 0 0 1px rgba(255,255,255,.2); }
  .b-dl svg { width:19px; height:19px; fill:currentColor; }
  .b-dl-note { margin:14px 0 0; font-size:13.5px; color:#8f97b4; }
  .b-cta .b-dl { margin-top:4px; }
  @media (prefers-reduced-motion: reduce) { .b-dl { transition:none; } .b-dl:hover { transform:none; } }
`

const STARS = Array.from({ length: 46 }, (_, i) => {
  // Deterministic so server and client markup match.
  const x = (i * 97) % 100
  const y = (i * 61) % 100
  const d = ((i * 37) % 40) / 10
  return `<i style="top:${y}%;left:${x}%;animation-delay:${d}s"></i>`
}).join('')

// Feature glyphs. Line drawings in the accent, one stroke weight, no
// coloured tile behind them. Emoji were here before: a microphone, a camera,
// a test tube, a calendar, a clapperboard, a milky way — the same six emoji
// every generated landing page reaches for.
const ICONS: Record<string, string> = {
  mic: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>`,
  scan: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9v6M11 9v6M14 9v6M16.5 9v6"/></svg>`,
  dexa: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 7v6M8 21l4-8 4 8M7 10l5 3 5-3"/></svg>`,
  plan: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M8 15l2.5 2.5L16 12"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>`,
  reel: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4M10.5 9.5v5l4-2.5z"/></svg>`,
  aurora: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15c3-4 5-4 8 0s5 4 10-1M3 10c3-4 5-4 8 0s5 4 10-1"/><circle cx="6" cy="5" r=".6"/><circle cx="16" cy="4" r=".6"/></svg>`,
}

// Apple's mark, inlined so the button needs no network request and no asset.
const APPLE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.36 12.78c.02-2.4 1.96-3.55 2.05-3.6-1.12-1.63-2.86-1.86-3.48-1.89-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.61.02-3.1.94-3.93 2.38-1.68 2.91-.43 7.22 1.2 9.58.8 1.16 1.75 2.46 3 2.41 1.21-.05 1.66-.78 3.12-.78 1.46 0 1.87.78 3.14.76 1.3-.02 2.12-1.18 2.91-2.34.92-1.34 1.3-2.64 1.32-2.71-.03-.01-2.53-.97-2.55-3.85zM14.0 5.8c.66-.8 1.11-1.91.99-3.02-.95.04-2.11.64-2.8 1.43-.61.7-1.15 1.83-1.01 2.91 1.07.08 2.15-.54 2.82-1.32z"/></svg>`

function downloadButton(label: string) {
  return `<a class="b-dl" href="${APP_STORE_URL}">${APPLE}${label}</a>`
}

function buildBody(c: Copy) {
  const faqHtml = c.faqSection.items
    .map((f) => `<div class="b-q"><h3>${f.q}</h3><p>${f.a}</p></div>`)
    .join('')

  const steps = c.how.steps
    .map((s, i) => `<div class="b-step"><span class="n">${i + 1}</span><div><h3>${s.h}</h3><p>${s.p}</p></div></div>`)
    .join('')

  const cards = c.features.cards
    .map((f) => `<div class="b-card"><span class="ic">${ICONS[f.ic] ?? ''}</span><div><h3>${f.h}</h3><p>${f.p}</p></div></div>`)
    .join('')

  return `
<div class="borea-page">
  <div class="sky"><b class="c1"></b><b class="c2"></b><b class="c3"></b><b class="c4"></b></div>
  <div class="stars">${STARS}</div>
  <div class="b-wrap">
    <nav class="b-nav">
      <a href="/" class="mark"><img src="/icons/borea.png" alt="" width="28" height="28"/>Borea</a>
      <div class="links">
        <a href="#how">${c.nav.how}</a>
        <a href="#coach" class="hide-sm">${c.nav.coach}</a>
        <a href="#pricing">${c.nav.pricing}</a>
        <a href="#faq" class="hide-sm">${c.nav.faq}</a>
        <a class="lang" href="${c.otherLangHref}" hreflang="${c.otherLangHreflang}" lang="${c.otherLangHreflang}">${c.otherLangLabel}</a>
      </div>
    </nav>
  </div>

  <header class="b-hero">
    <div class="b-wrap">
      <img class="icon" src="/icons/borea.png" alt="Borea" width="104" height="104"/>
      <h1>Borea<span class="stop">.</span></h1>
      <p class="tag">${c.hero.tagline}</p>
      ${downloadButton(c.hero.download)}
      <p class="b-dl-note">${c.hero.downloadNote}</p>
      <div class="b-phones">
        <div class="b-phone side l"><img src="/borea/brief.webp" alt="${c.shots.brief}" width="640" height="1391" loading="eager"/></div>
        <div class="b-phone"><img src="/borea/today.webp" alt="${c.shots.today}" width="640" height="1391" loading="eager" fetchpriority="high"/></div>
        <div class="b-phone side r"><img src="/borea/trends.webp" alt="${c.shots.trends}" width="640" height="1391" loading="eager"/></div>
      </div>
    </div>
  </header>

  <main>
    <section class="b-sec" id="how">
      <div class="b-wrap">
        <p class="b-eyebrow">${c.how.eyebrow}</p>
        <h2>${c.how.h2}</h2>
        <p class="lede">${c.how.lede}</p>
        <div class="b-split">
          <div class="b-steps">${steps}</div>
          <div class="b-phone"><img src="/borea/log.webp" alt="${c.shots.log}" width="640" height="1391" loading="lazy"/></div>
        </div>
      </div>
    </section>

    <section class="b-sec" id="coach">
      <div class="b-wrap">
        <p class="b-eyebrow">${c.coach.eyebrow}</p>
        <h2>${c.coach.h2}</h2>
        <p class="lede">${c.coach.lede}</p>
        <div class="b-coach">
          <div>
            <div class="b-orb-wrap">
              <div class="b-orb"><canvas id="b-aurora" width="170" height="170" aria-hidden="true"></canvas></div>
            </div>
            <div class="b-orb-cap">${c.coach.orbCaption}</div>
            <div class="b-phase" id="b-phase" data-phases="${c.coach.phases.join('|')}">${c.coach.phases[0]}</div>
            <div class="b-horizon" aria-hidden="true"><i id="b-horizon"></i></div>
          </div>
        <div class="b-chat">
          <p class="b-msg you"><span class="who">${c.coach.you}</span>${c.coach.question}</p>
          <p class="b-msg coach"><span class="who">${c.coach.borea}</span>${c.coach.answer}</p>
        </div>
        </div>
      </div>
    </section>

    <section class="b-sec">
      <div class="b-wrap">
        <p class="b-eyebrow">${c.features.eyebrow}</p>
        <h2>${c.features.h2}</h2>
        <div class="b-grid">${cards}</div>
      </div>
    </section>

    <section class="b-sec">
      <div class="b-wrap">
        <div class="b-split flip">
          <div class="b-phone wide"><img src="/borea/widgets.webp" alt="${c.shots.widgets}" width="640" height="1391" loading="lazy"/></div>
          <div>
            <p class="b-eyebrow">${c.widgets.eyebrow}</p>
            <h2>${c.widgets.h2}</h2>
            <p class="lede" style="margin-bottom:0">${c.widgets.lede}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="b-sec">
      <div class="b-wrap">
        <p class="b-eyebrow">${c.privacy.eyebrow}</p>
        <h2>${c.privacy.h2}</h2>
        <p class="lede">${c.privacy.lede}</p>
        <a class="b-btn" href="${c.privacy.href}">${c.privacy.cta}</a>
      </div>
    </section>

    <section class="b-sec" id="pricing">
      <div class="b-wrap">
        <p class="b-eyebrow">${c.pricing.eyebrow}</p>
        <h2>${c.pricing.h2}</h2>
        <p class="lede">${c.pricing.lede}</p>
        <div class="b-price">
          <div class="b-plan"><span class="name">${c.pricing.monthly}</span><div class="amt">${c.pricing.monthlyAmt}</div><div class="per">${c.pricing.per}</div></div>
          <div class="b-plan best"><span class="name">${c.pricing.yearly}</span><div class="amt">${c.pricing.yearlyAmt}</div><div class="per">${c.pricing.perYear}</div><span class="save">${c.pricing.save}</span></div>
        </div>
      </div>
    </section>

    <section class="b-sec" id="faq">
      <div class="b-wrap">
        <p class="b-eyebrow">${c.faqSection.eyebrow}</p>
        <h2>${c.faqSection.h2}</h2>
        <div class="b-faq">${faqHtml}</div>
      </div>
    </section>

    <section class="b-cta">
      <div class="b-wrap">
        <p class="note">${c.cta.note}</p>
        ${downloadButton(c.cta.download)}
        <p class="b-dl-note"><a href="${c.cta.contactHref}">${c.cta.contact}</a></p>
      </div>
    </section>
  </main>

  <div class="b-wrap">
    <footer class="b-foot">
      <span>${c.foot.copyright}</span>
      <div class="links"><a href="/privacy">${c.foot.privacy}</a><a href="/terms">${c.foot.terms}</a><a href="/support">${c.foot.support}</a></div>
    </footer>
  </div>
</div>
`
}

function buildJsonLd(c: Copy) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Borea',
        applicationCategory: 'HealthApplication',
        operatingSystem: 'iOS',
        inLanguage: c.htmlLang,
        description: c.meta.description,
        url: 'https://boreaapp.com',
        downloadUrl: APP_STORE_URL,
        publisher: { '@type': 'Organization', name: 'Clarendon Labs LLC', url: 'https://clarendon.dev' },
        offers: [
          { '@type': 'Offer', price: '7.99', priceCurrency: 'USD', name: 'Borea Pro monthly' },
          { '@type': 'Offer', price: '59.99', priceCurrency: 'USD', name: 'Borea Pro yearly' },
        ],
      },
      {
        '@type': 'FAQPage',
        inLanguage: c.htmlLang,
        mainEntity: c.faqSection.items.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }
}


/** The coach's thinking overlay, ported from AuroraThinking.swift: three sine
 *  aurora bands with curtains over 26 twinkling stars, a phase line on the
 *  app's timings, and the horizon bar that fills 1 - e^(-t/7). */
const AURORA_JS = `(function(){
var cv=document.getElementById('b-aurora'),ph=document.getElementById('b-phase'),bar=document.getElementById('b-horizon');
if(!cv||!ph||!bar)return;
var ctx=cv.getContext('2d');if(!ctx)return;
var S=170,K=230/S,d=Math.min(window.devicePixelRatio||1,2);
cv.width=S*d;cv.height=S*d;ctx.scale(d,d);
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var bands=[['34,197,94',.42,26/K,.9],['0,194,255',.55,20/K,1.3],['140,115,255',.66,16/K,.7]];
function draw(t){
  var g=ctx.createLinearGradient(0,0,0,S);g.addColorStop(0,'rgb(8,13,33)');g.addColorStop(1,'rgb(5,26,31)');
  ctx.fillStyle=g;ctx.fillRect(0,0,S,S);
  var seed=9;
  for(var i=0;i<26;i++){seed+=37.7;var x=seed%S,y=(seed*1.7)%(S*.8),tw=.35+.3*Math.sin(t*1.3+seed);
    ctx.fillStyle='rgba(255,255,255,'+tw.toFixed(3)+')';ctx.beginPath();ctx.arc(x+1,y+1,1,0,6.2832);ctx.fill();}
  for(var b=0;b<bands.length;b++){var c=bands[b][0],baseY=S*bands[b][1],amp=bands[b][2],sp=bands[b][3];
    ctx.beginPath();
    for(var px=0;px<=S;px+=2){var y=baseY+amp*Math.sin(px*K/34+t*sp)+amp*.5*Math.sin(px*K/13-t*sp*.7);
      if(px===0)ctx.moveTo(0,y);else ctx.lineTo(px,y);}
    ctx.save();ctx.lineTo(S,S);ctx.lineTo(0,S);ctx.closePath();
    var cg=ctx.createLinearGradient(0,baseY-amp,0,baseY+70/K);cg.addColorStop(0,'rgba('+c+',.34)');cg.addColorStop(1,'rgba('+c+',0)');
    ctx.fillStyle=cg;ctx.fill();ctx.restore();
    ctx.beginPath();
    for(var qx=0;qx<=S;qx+=2){var qy=baseY+amp*Math.sin(qx*K/34+t*sp)+amp*.5*Math.sin(qx*K/13-t*sp*.7);
      if(qx===0)ctx.moveTo(0,qy);else ctx.lineTo(qx,qy);}
    ctx.strokeStyle='rgba('+c+',.85)';ctx.lineWidth=2;ctx.stroke();}
}
var phases=(ph.getAttribute('data-phases')||'').split('|'),after=[0,3,6,10],CYCLE=14,W=bar.parentNode.clientWidth||190;
function setPhase(i){if(ph.textContent===phases[i])return;ph.classList.add('fade');setTimeout(function(){ph.textContent=phases[i];ph.classList.remove('fade');},350);}
if(reduce){draw(0);bar.style.width=Math.round(W*(1-Math.exp(-7/7)))+'px';return;}
var started=null,last=0,running=false,raf=0;
function frame(now){
  if(!running)return;
  raf=requestAnimationFrame(frame);
  if(now-last<33)return;last=now;
  if(started===null)started=now;
  var t=now/1000,e=((now-started)/1000)%CYCLE;
  draw(t);
  var idx=0;for(var i=0;i<after.length;i++)if(after[i]<=e)idx=i;setPhase(idx);
  bar.style.width=Math.max(8,W*(1-Math.exp(-e/7)))+'px';
}
function start(){if(running)return;running=true;raf=requestAnimationFrame(frame);}
function stop(){running=false;cancelAnimationFrame(raf);}
if('IntersectionObserver' in window){new IntersectionObserver(function(es){es[0].isIntersecting?start():stop();},{threshold:.1}).observe(cv);}else start();
document.addEventListener('visibilitychange',function(){document.hidden?stop():start();});
})();`

export default function BoreaShell({ c }: { c: Copy }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(c)) }}
      />
      <div lang={c.htmlLang} dangerouslySetInnerHTML={{ __html: buildBody(c) }} />
      <script dangerouslySetInnerHTML={{ __html: AURORA_JS }} />
    </>
  )
}
