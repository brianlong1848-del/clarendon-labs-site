import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Borea — The AI macro coach that talks back',
  description:
    'Borea is an AI macro and calorie counter for iPhone. Log meals by voice, photo, or barcode, sync your DEXA scans, and get coaching that reads your actual log instead of handing you generic advice.',
  alternates: { canonical: 'https://boreaapp.com' },
  openGraph: {
    title: 'Borea — The AI macro coach that talks back',
    description:
      'Log meals by voice, photo, or barcode. Get coaching that knows your macros, your DEXA scans, and your goals.',
    url: 'https://boreaapp.com',
    siteName: 'Borea',
    images: ['/icons/borea.png'],
    type: 'website',
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
  .borea-page { background:#070b1c; color:#f5f5f7; min-height:100vh; font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  .borea-page a { color:inherit; text-decoration:none; }
  .b-wrap { max-width:1080px; margin:0 auto; padding:0 24px; }
  .b-nav { display:flex; justify-content:space-between; align-items:center; padding:22px 0; font-size:14px; }
  .b-nav .mark { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:-0.02em; font-size:17px; }
  .b-nav .mark img { width:28px; height:28px; border-radius:7px; }
  .b-nav .links { display:flex; gap:22px; color:#a1a6c0; }
  .b-nav .links a:hover { color:#fff; }
  @media (max-width:600px){ .b-nav .links a.hide-sm { display:none; } }

  .b-hero { position:relative; text-align:center; padding:76px 0 56px; overflow:hidden; }
  .b-aurora { position:absolute; inset:0; pointer-events:none;
    background:
      radial-gradient(60% 42% at 18% 0%, rgba(34,197,94,.26), transparent 65%),
      radial-gradient(55% 40% at 78% 6%, rgba(30,111,255,.30), transparent 65%),
      radial-gradient(40% 32% at 55% 18%, rgba(140,115,255,.20), transparent 70%);
    filter: blur(6px); }
  .b-star { position:absolute; width:3px; height:3px; border-radius:50%; background:#fff; opacity:.6; }
  .b-hero .icon { width:104px; height:104px; border-radius:25px; margin:0 auto 24px; box-shadow:0 18px 50px -12px rgba(34,197,94,.45); position:relative; }
  .b-hero h1 { margin:0; font-size:clamp(48px,8vw,96px); font-weight:800; letter-spacing:-0.045em; line-height:1; position:relative; }
  .b-hero h1 .stop { background:linear-gradient(120deg,#22c55e,#00c2ff,#1e6fff); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .b-hero .tag { font-size:clamp(18px,2.2vw,23px); color:#c9cede; margin:18px auto 0; max-width:46ch; line-height:1.45; position:relative; }
  .b-pill { display:inline-flex; align-items:center; gap:8px; margin-top:26px; padding:9px 18px; border-radius:999px; font-size:13.5px; font-weight:500; color:#d9f7ec; background:rgba(34,197,94,.10); border:1px solid rgba(34,197,94,.35); position:relative; }
  .b-pill .dot { width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 10px #22c55e; }

  .b-sec { padding:56px 0; border-top:1px solid rgba(255,255,255,.07); }
  .b-sec h2 { margin:0 0 8px; font-size:clamp(26px,3.6vw,38px); font-weight:750; letter-spacing:-0.03em; }
  .b-sec .lede { margin:0 0 32px; color:#a9aec6; font-size:16.5px; line-height:1.6; max-width:60ch; }

  .b-steps { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  @media (max-width:860px){ .b-steps { grid-template-columns:1fr; } }
  .b-step { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09); border-radius:20px; padding:26px; }
  .b-step .n { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:9px; font-size:14px; font-weight:700; background:rgba(30,111,255,.18); color:#7fb2ff; margin-bottom:14px; }
  .b-step h3 { margin:0 0 8px; font-size:17.5px; font-weight:650; letter-spacing:-0.015em; }
  .b-step p { margin:0; font-size:14.5px; line-height:1.55; color:#a9aec6; }

  .b-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  @media (max-width:860px){ .b-grid { grid-template-columns:1fr; } }
  .b-card { background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.09); border-radius:20px; padding:26px; }
  .b-card h3 { margin:0 0 8px; font-size:18px; font-weight:650; letter-spacing:-0.015em; }
  .b-card p { margin:0; font-size:14.5px; line-height:1.55; color:#a9aec6; }
  .b-card .ic { font-size:24px; margin-bottom:14px; display:block; }

  .b-chat { max-width:620px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.10); border-radius:22px; padding:24px; }
  .b-msg { margin:0 0 14px; font-size:15px; line-height:1.55; }
  .b-msg:last-child { margin-bottom:0; }
  .b-msg .who { display:block; font-size:11.5px; letter-spacing:.09em; text-transform:uppercase; color:#7f86a5; margin-bottom:5px; font-weight:650; }
  .b-msg.you { color:#dfe3f2; }
  .b-msg.coach { color:#bfe9d4; }

  .b-price { display:grid; grid-template-columns:repeat(2,1fr); gap:18px; max-width:640px; }
  @media (max-width:700px){ .b-price { grid-template-columns:1fr; } }
  .b-plan { background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.10); border-radius:20px; padding:24px; }
  .b-plan.best { border-color:rgba(34,197,94,.45); background:rgba(34,197,94,.07); }
  .b-plan .name { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:#8f96b4; font-weight:650; }
  .b-plan .amt { font-size:34px; font-weight:800; letter-spacing:-0.03em; margin:8px 0 2px; }
  .b-plan .per { font-size:14px; color:#a9aec6; }
  .b-plan .save { display:inline-block; margin-top:10px; font-size:12.5px; font-weight:650; color:#7ef0c9; }

  .b-faq { max-width:760px; }
  .b-q { border-top:1px solid rgba(255,255,255,.08); padding:20px 0; }
  .b-q:first-child { border-top:none; }
  .b-q h3 { margin:0 0 8px; font-size:17px; font-weight:650; letter-spacing:-0.015em; }
  .b-q p { margin:0; font-size:15px; line-height:1.6; color:#a9aec6; }

  .b-cta { text-align:center; padding:56px 0 72px; border-top:1px solid rgba(255,255,255,.07); }
  .b-cta .note { color:#a9aec6; font-size:16px; max-width:52ch; margin:0 auto 22px; line-height:1.55; }
  .b-btn { display:inline-flex; align-items:center; gap:9px; background:#f5f5f7; color:#0b1024; font-weight:600; font-size:15px; padding:13px 24px; border-radius:14px; }
  .b-btn:hover { background:#fff; }

  .b-foot { border-top:1px solid rgba(255,255,255,.08); padding:26px 0 44px; display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; font-size:13.5px; color:#8a90ad; }
  .b-foot .links { display:flex; gap:20px; }
  .b-foot a:hover { color:#fff; }
`

const faqHtml = FAQ.map(
  (f) => `<div class="b-q"><h3>${f.q}</h3><p>${f.a}</p></div>`,
).join('')

const BODY = `
<div class="borea-page">
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
    <div class="b-aurora"></div>
    <span class="b-star" style="top:14%;left:12%"></span><span class="b-star" style="top:8%;left:38%"></span><span class="b-star" style="top:20%;left:64%;width:2px;height:2px"></span><span class="b-star" style="top:10%;left:86%"></span><span class="b-star" style="top:30%;left:26%;width:2px;height:2px"></span><span class="b-star" style="top:26%;left:90%"></span>
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
        <h2>A coach, not a search box</h2>
        <p class="lede">Borea reads what you actually ate and what your body actually did. It has opinions, it shows its working, and it would rather be honest than encouraging.</p>
        <div class="b-chat">
          <p class="b-msg you"><span class="who">You</span>Why is my weight up when I hit my calories all week?</p>
          <p class="b-msg coach"><span class="who">Borea</span>Because you ate 4,800&nbsp;mg of sodium on Saturday and 1,100 on Sunday. That&rsquo;s water, not fat &mdash; your seven-day average is still down 0.9&nbsp;lb, and your last DEXA says the lean mass is holding. Nothing is wrong. Drink, and ignore the scale until Wednesday.</p>
        </div>
      </div>
    </section>

    <section class="b-sec">
      <div class="b-wrap">
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
        <h2>Your health data stays yours</h2>
        <p class="lede">Your log, your weigh-ins and your progress photos live on your iPhone. When you ask the coach a question, the numbers needed to answer it are sent to process that question &mdash; nothing more. Your health data is never used for advertising, never sold, and never used to train a model. Delete the app and it goes with it.</p>
        <a class="b-btn" href="/privacy">Read the privacy policy &rarr;</a>
      </div>
    </section>

    <section class="b-sec" id="pricing">
      <div class="b-wrap">
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
