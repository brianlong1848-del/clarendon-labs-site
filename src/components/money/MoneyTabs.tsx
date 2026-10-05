'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { C } from '@/components/AdminNav'

// Sub-navigation for the Money & ROI section. Add a tab by adding a line here.
const TABS = [
  { href: '/admin/money', label: 'Overview' },
  { href: '/admin/money/triage', label: 'Triage' },
  { href: '/admin/money/ledger', label: 'Quick Add & receipts' },
  { href: '/admin/money/subscriptions', label: 'Subscriptions' },
  { href: '/admin/money/ads', label: 'Ads' },
  { href: '/admin/money/settings', label: 'Accounts' },
]

export default function MoneyTabs() {
  const path = usePathname()
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {TABS.map((t) => {
        const on = path === t.href
        return (
          <Link key={t.href} href={t.href} style={{
            padding: '7px 14px', borderRadius: 999, fontSize: 13.5, fontWeight: 650, textDecoration: 'none',
            background: on ? C.ink : 'transparent', color: on ? '#fff' : C.ink2, border: `1px solid ${on ? C.ink : C.rule2}`,
          }}>{t.label}</Link>
        )
      })}
    </div>
  )
}
