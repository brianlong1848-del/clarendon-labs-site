// Run: npm test (Node's built-in runner; Node 24 strips the types).
// Pins the dated live_test window: an approved test reads 'live' only inside
// its window, in Central time, and every consumer (adsState, strategyFor,
// allPaused, currentStrategy) agrees.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adsState, allPaused, currentStrategy, resolveStrategy, strategyFor, type AppStrategy } from './strategy.ts'

const at = (iso: string) => new Date(iso)

const base: AppStrategy = {
  app_slug: 'demo', name: 'Demo', ads_state: 'paused', since: '2026-11-10', note: 'Paused.',
  scoreboard: { label: 'Games finished', count: null },
  gate: [
    { label: 'First minute fixed and live in the stores', state: 'todo' },
    { label: 'Brian approves a daily budget', state: 'todo' },
  ],
  live_test: {
    from: '2026-11-26T00:00:00-06:00', until: '2026-11-29T00:00:00-06:00', since: '2026-11-26',
    note: 'Test on.', after_note: 'Test over.',
  },
}

test('resolveStrategy: before, inside and after the window', () => {
  const before = resolveStrategy(base, at('2026-11-25T23:59:59-06:00'))
  assert.equal(before.ads_state, 'paused')
  assert.equal(before.since, '2026-11-10')
  assert.equal(before.note, 'Paused.')

  for (const t of ['2026-11-26T00:00:00-06:00', '2026-11-27T00:01:00-06:00', '2026-11-28T23:59:59-06:00']) {
    const s = resolveStrategy(base, at(t))
    assert.equal(s.ads_state, 'live', t)
    assert.equal(s.since, '2026-11-26')
    assert.equal(s.note, 'Test on.')
    assert.equal(s.gate.find((g) => g.label === 'Brian approves a daily budget')?.state, 'done')
    assert.equal(s.gate[0].state, 'todo', 'other gate steps untouched')
  }

  const after = resolveStrategy(base, at('2026-11-29T00:00:00-06:00'))
  assert.equal(after.ads_state, 'paused')
  assert.equal(after.since, '2026-11-29')
  assert.equal(after.note, 'Test over.')
  assert.equal(after.gate[1].state, 'todo')
})

test('window edges are Central time, not UTC midnight', () => {
  // 2026-11-27 00:01 CT = 06:01 UTC; UTC midnight of the 29th is still Nov 28 18:00 CT.
  assert.equal(resolveStrategy(base, at('2026-11-27T06:01:00Z')).ads_state, 'live')
  assert.equal(resolveStrategy(base, at('2026-11-29T00:00:00Z')).ads_state, 'live')
  assert.equal(resolveStrategy(base, at('2026-11-29T05:59:59Z')).ads_state, 'live')
  assert.equal(resolveStrategy(base, at('2026-11-29T06:00:00Z')).ads_state, 'paused')
  assert.equal(resolveStrategy(base, at('2026-11-26T05:59:59Z')).ads_state, 'paused')
})

test('an entry without live_test is returned unchanged', () => {
  const { live_test: _, ...plain } = base
  assert.equal(resolveStrategy(plain, at('2026-11-27T12:00:00Z')), plain)
})

test('Rolligan Thanksgiving test: every consumer agrees', () => {
  const during = at('2026-11-27T00:01:00-06:00')
  assert.equal(adsState('rolligan', during), 'live')
  assert.equal(strategyFor('rolligan', during)?.ads_state, 'live')
  assert.equal(currentStrategy(during).find((s) => s.app_slug === 'rolligan')?.ads_state, 'live')
  assert.equal(allPaused(during), false)

  const after = at('2026-11-29T00:00:00-06:00')
  assert.equal(adsState('rolligan', after), 'paused')
  assert.equal(strategyFor('rolligan', after)?.since, '2026-11-29')

  const before = at('2026-11-25T12:00:00-06:00')
  assert.equal(adsState('rolligan', before), 'paused')
})

test('other apps are not affected by Rolligan’s window', () => {
  const during = at('2026-11-27T00:01:00-06:00')
  assert.equal(adsState('yulepick', during), 'live')
  assert.equal(adsState('gagorder', during), 'paused')
  assert.equal(adsState('unknown-app', during), 'paused')
  assert.equal(adsState(null, during), 'paused')
})
