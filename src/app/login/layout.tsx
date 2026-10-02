import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Sign in — Clarendon Labs', robots: { index: false, follow: false, nocache: true } }
export default function LoginLayout({ children }: { children: React.ReactNode }) { return <>{children}</> }
