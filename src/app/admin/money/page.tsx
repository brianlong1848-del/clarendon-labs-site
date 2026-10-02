import { redirect } from 'next/navigation'

// Money landing. Triage is the only finished screen for now; this becomes the
// Overview (P&L, ROAS, owner ledger) as those tabs are built.
export default function MoneyHome() {
  redirect('/admin/money/triage')
}
