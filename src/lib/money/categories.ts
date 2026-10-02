// Schedule C expense categories (the ones a small software business actually uses)
// and a best-guess from Plaid's top-level category, so Triage can pre-fill.
export const SCHEDULE_C = [
  ['advertising', 'Advertising'], ['software', 'Software & subscriptions'], ['contract_labor', 'Contract labor'],
  ['legal_professional', 'Legal & professional'], ['office_expense', 'Office expense'], ['supplies', 'Supplies'],
  ['travel', 'Travel'], ['meals', 'Meals'], ['utilities', 'Utilities & phone'], ['insurance', 'Insurance'],
  ['taxes_licenses', 'Taxes & licenses'], ['interest', 'Interest & bank fees'], ['other', 'Other'],
] as const

const PLAID_GUESS: Record<string, string> = {
  GENERAL_MERCHANDISE: 'supplies', TRAVEL: 'travel', TRANSPORTATION: 'travel', FOOD_AND_DRINK: 'meals',
  RENT_AND_UTILITIES: 'utilities', GOVERNMENT_AND_NON_PROFIT: 'taxes_licenses', BANK_FEES: 'interest',
  LOAN_PAYMENTS: 'interest', GENERAL_SERVICES: 'other', ENTERTAINMENT: 'other',
}
export const guessCategory = (plaid: string | null) => (plaid && PLAID_GUESS[plaid]) || 'software'
