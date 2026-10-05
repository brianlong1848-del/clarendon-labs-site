import type { Metadata } from 'next'

// Public on purpose (Plaid and anyone else can read it without signing in), so it
// lives in the (public) route group, outside app/admin's signed-in layout, and
// the middleware lets exactly this path through. Text: Clarendon-Admin-Privacy-
// Policy.md in Drive → Claude outputs; keep the two in step.

export const metadata: Metadata = {
  title: 'Clarendon Admin — Privacy Policy',
  description: 'How Clarendon Admin handles bank and card data connected through Plaid.',
  robots: { index: true, follow: true },
}

const h2: React.CSSProperties = { fontFamily: "'Besley', Georgia, serif", fontSize: 22, margin: '32px 0 8px' }
const p: React.CSSProperties = { margin: '0 0 12px' }

export default function AdminPrivacy() {
  return (
    <main style={{ background: '#F7F6F2', minHeight: '100dvh', color: '#141413', fontFamily: "'Archivo', -apple-system, 'Helvetica Neue', Arial, sans-serif", padding: '48px 20px' }}>
      <article style={{ maxWidth: 720, margin: '0 auto', fontSize: 16, lineHeight: 1.6 }}>
        <p style={{ fontFamily: "'IBM Plex Mono', Menlo, monospace", fontSize: 12, letterSpacing: '.18em', textTransform: 'uppercase', color: '#706E67', margin: 0 }}>Clarendon Labs LLC</p>
        <h1 style={{ fontFamily: "'Besley', Georgia, serif", fontSize: 40, fontWeight: 900, margin: '8px 0 6px' }}>Clarendon Admin — Privacy Policy</h1>
        <p style={{ color: '#706E67', margin: '0 0 24px' }}>Clarendon Labs LLC (Illinois) · Effective 2026-10-02 · Contact: <a href="mailto:support@clarendon.dev">support@clarendon.dev</a></p>

        <h2 style={h2}>Who this covers</h2>
        <p style={p}>Clarendon Admin is an internal dashboard operated by Clarendon Labs LLC. Its only user is the company&rsquo;s owner. It is not offered to the public.</p>

        <h2 style={h2}>What we collect</h2>
        <p style={p}>When the owner connects a bank or credit card account through Plaid, Clarendon Admin receives that account&rsquo;s name, type, last four digits, and transaction history (dates, amounts, merchant names, categories). Clarendon Admin never receives or stores bank login credentials; Plaid handles those. Plaid&rsquo;s own privacy policy is at <a href="https://plaid.com/legal">plaid.com/legal</a>.</p>

        <h2 style={h2}>Consent</h2>
        <p style={p}>Accounts are connected only through Plaid Link. Plaid Link shows the user what data is being shared and asks for explicit consent before any connection is made. Connections can be removed at any time.</p>

        <h2 style={h2}>How we use it</h2>
        <p style={p}>Data is used only to categorize Clarendon Labs business expenses, separate business from personal spending, and calculate revenue, profit, and return on investment for the company&rsquo;s apps. It is never sold, rented, shared with advertisers, or used for any other purpose.</p>

        <h2 style={h2}>Storage and security</h2>
        <p style={p}>Data is stored in a Supabase database. It is encrypted in transit (TLS 1.2+) and at rest (AES-256). Plaid access tokens are stored encrypted on the server and never sent to the browser. Access requires multi-factor authentication. Full controls are in the Clarendon Labs Information Security Policy.</p>

        <h2 style={h2}>Retention and deletion</h2>
        <ul style={{ margin: '0 0 12px', paddingLeft: 22 }}>
          <li>Transaction records are kept as long as needed for bookkeeping and tax purposes, normally up to 7 years, then deleted.</li>
          <li>When an account is disconnected, its Plaid connection is revoked (<code>/item/remove</code>) and its access token is deleted immediately.</li>
          <li>Transactions marked personal are excluded from all reports and can be purged on request.</li>
          <li>This policy and the retention schedule are reviewed at least once a year.</li>
        </ul>

        <h2 style={h2}>Your rights</h2>
        <p style={p}>The account holder can view, export, correct, or delete any stored data at any time from the dashboard or by emailing <a href="mailto:support@clarendon.dev">support@clarendon.dev</a>.</p>

        <h2 style={h2}>Changes</h2>
        <p style={p}>Material changes are dated and noted at the top of this policy.</p>
      </article>
    </main>
  )
}
