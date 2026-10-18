// ─── What the LLC owes Brian ────────────────────────────────────────────────
//
// One number, three parts (see v_owed_to_owner):
//   expenses   business costs paid from a personal card/account/cash, not yet reimbursed
//   loans      cash Brian lent the LLC (bank rows tagged owner_flow = 'loan_in')
//   repaid     money the LLC has paid back on the loans (owner_flow = 'loan_repayment')
// Capital contributions are equity, not owed, so they're reported separately.

import type { SupabaseClient } from '@supabase/supabase-js'

export type OwedItem = { id: string; posted_on: string; merchant: string | null; kind: 'expense' | 'loan' | 'repayment'; amount_cents: number; notes: string | null }
export type Owed = { totalCents: number; expensesCents: number; loansCents: number; repaidCents: number; equityCents: number; loanItems: OwedItem[] }

export async function owedToOwner(sb: SupabaseClient): Promise<Owed> {
  const [owed, equity] = await Promise.all([
    sb.from('v_owed_to_owner').select('id,posted_on,merchant,kind,amount_cents,notes').order('posted_on'),
    sb.from('v_owner_equity').select('amount_cents'),
  ])
  if (owed.error) throw new Error(owed.error.message)
  const rows = (owed.data ?? []) as OwedItem[]
  const sum = (k: OwedItem['kind']) => rows.filter((r) => r.kind === k).reduce((n, r) => n + Number(r.amount_cents), 0)
  const expensesCents = sum('expense'), loansCents = sum('loan'), repaidCents = -sum('repayment')
  return {
    totalCents: expensesCents + loansCents - repaidCents,
    expensesCents, loansCents, repaidCents,
    equityCents: (equity.data ?? []).reduce((n, r: { amount_cents: number }) => n + Number(r.amount_cents), 0),
    loanItems: rows.filter((r) => r.kind !== 'expense'),
  }
}
