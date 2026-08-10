// Shared aurora shell for Borea's legal pages. The marketing page carries its
// own copy of these tokens; keeping legal separate means a design change there
// can never accidentally reflow a document people rely on.
export const LEGAL_STYLE = `
  .bl { position:relative; background:#04081a; color:#f5f6fb; min-height:100vh; overflow-x:hidden;
    font-family:'SF Pro Display',-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  .bl a { color:#7fd8ff; text-decoration:none; }
  .bl a:hover { text-decoration:underline; }
  .bl-sky { position:fixed; inset:0; pointer-events:none; z-index:0;
    background:linear-gradient(175deg,#04081c 0%,#051229 40%,#041a26 70%,#05221a 100%); }
  .bl-sky b { position:absolute; display:block; border-radius:50%; filter:blur(80px); mix-blend-mode:screen; }
  .bl-sky b.a { top:-24%; left:-16%; width:74%; height:60%; background:radial-gradient(ellipse at center,rgba(34,197,94,.40),transparent 68%); }
  .bl-sky b.b { top:-28%; left:40%; width:76%; height:64%; background:radial-gradient(ellipse at center,rgba(0,194,255,.32),transparent 68%); }
  .bl-sky b.c { top:46%; left:-20%; width:78%; height:70%; background:radial-gradient(ellipse at center,rgba(140,115,255,.20),transparent 70%); }
  .bl-wrap { position:relative; z-index:1; max-width:820px; margin:0 auto; padding:0 24px; }
  .bl-nav { display:flex; justify-content:space-between; align-items:center; padding:20px 0; font-size:14px; }
  .bl-nav .mark { display:flex; align-items:center; gap:10px; font-weight:800; font-size:17px; color:#fff; }
  .bl-nav .mark img { width:28px; height:28px; border-radius:8px; }
  .bl-nav .links { display:flex; gap:20px; color:#9aa2bd; }
  .bl-head { padding:52px 0 26px; }
  .bl-eyebrow { font-size:12px; letter-spacing:.16em; text-transform:uppercase; font-weight:700; margin:0 0 12px;
    background:linear-gradient(90deg,#22c55e,#00c2ff); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .bl-head h1 { margin:0; font-size:clamp(34px,6vw,54px); font-weight:800; letter-spacing:-0.04em; line-height:1.05; }
  .bl-meta { margin-top:14px; font-size:13.5px; color:#8d95b2; }
  .bl-lede { margin:18px 0 0; font-size:17.5px; line-height:1.62; color:#c2c9de; }
  .bl-body { padding:14px 0 60px; }
  .bl-body h2 { margin:44px 0 12px; font-size:23px; font-weight:750; letter-spacing:-0.025em; color:#fff; }
  .bl-body h3 { margin:28px 0 8px; font-size:17px; font-weight:700; color:#e8edfb; }
  .bl-body p { margin:0 0 14px; font-size:16px; line-height:1.68; color:#aeb6cc; }
  .bl-body ul { margin:0 0 16px; padding-left:22px; }
  .bl-body li { font-size:16px; line-height:1.66; color:#aeb6cc; margin-bottom:9px; }
  .bl-body strong { color:#e8edfb; font-weight:650; }
  .bl-callout { margin:26px 0; padding:20px 22px; border-radius:18px; font-size:15.5px; line-height:1.62; color:#cfe9db;
    background:linear-gradient(165deg,rgba(34,197,94,.13),rgba(34,197,94,.03)); border:1px solid rgba(34,197,94,.34); }
  .bl-foot { position:relative; z-index:1; border-top:1px solid rgba(255,255,255,.08); padding:24px 0 44px;
    display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; font-size:13.5px; color:#848bab; }
  .bl-foot .links { display:flex; gap:18px; }
`

export function shell(title: string, updated: string, lede: string, body: string) {
  return `
<div class="bl">
  <div class="bl-sky"><b class="a"></b><b class="b"></b><b class="c"></b></div>
  <div class="bl-wrap">
    <nav class="bl-nav">
      <a href="/" class="mark"><img src="/icons/borea.png" alt="" width="28" height="28"/>Borea</a>
      <div class="links"><a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></div>
    </nav>
    <header class="bl-head">
      <p class="bl-eyebrow">Borea</p>
      <h1>${title}</h1>
      <p class="bl-meta">${updated}</p>
      <p class="bl-lede">${lede}</p>
    </header>
    <article class="bl-body">${body}</article>
    <footer class="bl-foot">
      <span>&copy; 2026 <a href="https://clarendon.dev">Clarendon Labs LLC</a> &middot; Chicago</span>
      <div class="links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></div>
    </footer>
  </div>
</div>`
}
