'use client'
/* eslint-disable @next/next/no-img-element */
import { C } from '@/components/AdminNav'
import { TIKTOK_PRIVACY_LABEL, type TikTokPrivacy, type TikTokSettings } from '@/lib/publish/rules'
import { Segmented, Toggle } from './shared'

// ─── TikTok card on /post ────────────────────────────────────────────────────
//
// Follows TikTok's Content Posting API UX rules, which the app review checks:
// show which account it's going to; read privacy options fresh from
// creator_info with NO default; interaction switches start off and are locked
// when the creator has them off; commercial content is disclosed; the music
// (and branded content) declaration sits next to the button.
// developers.tiktok.com/doc/content-sharing-guidelines

export type Creator = {
  creator_avatar_url: string; creator_username: string; creator_nickname: string
  privacy_level_options: TikTokPrivacy[]
  comment_disabled: boolean; duet_disabled: boolean; stitch_disabled: boolean
  max_video_post_duration_sec: number
}

const link = { color: C.ink, fontWeight: 700 } as const

export function TikTokPanel({ creator, audited, loading, error, value, onChange, duration, disabled }: {
  creator: Creator | null; audited: boolean; loading: boolean; error: string | null
  value: TikTokSettings; onChange: (s: TikTokSettings) => void; duration?: number; disabled?: boolean
}) {
  const set = (patch: Partial<TikTokSettings>) => onChange({ ...value, ...patch })
  if (loading) return <p style={{ margin: 0, fontSize: 12.5, color: C.soft }}>Checking this TikTok account…</p>
  if (error || !creator) return <p style={{ margin: 0, fontSize: 12.5, color: C.red }}>{error ?? 'Couldn’t read this TikTok account.'}</p>

  const tooLong = !!duration && duration > creator.max_video_post_duration_sec
  const direct = value.mode === 'direct'
  const row = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.ink2 } as const

  return (
    <div style={{ display: 'grid', gap: 12, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {creator.creator_avatar_url && <img src={creator.creator_avatar_url} alt="" width={26} height={26} style={{ borderRadius: 99 }} />}
        <span style={{ fontSize: 12.5, color: C.ink2 }}>Posting to <b style={{ color: C.ink }}>{creator.creator_nickname}</b> (@{creator.creator_username})</span>
      </div>

      <Segmented<TikTokSettings['mode']> value={value.mode} onChange={(mode) => set({ mode })}
        options={[
          { value: 'direct', label: 'Post now', title: 'Publish straight to the TikTok profile' },
          { value: 'draft', label: 'Send to drafts', title: 'Lands in the TikTok app’s inbox to finish there (sounds, effects)' },
        ]} />

      {tooLong && <p style={{ margin: 0, fontSize: 12, color: C.red }}>This account can post videos up to {creator.max_video_post_duration_sec} seconds; this one is {Math.round(duration!)}s.</p>}

      {!direct ? (
        <p style={{ margin: 0, fontSize: 12, color: C.soft, lineHeight: 1.45 }}>TikTok sends a notification to this account; open it in the TikTok app to add sounds and post.</p>
      ) : (
        <>
          <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: C.ink }}>
            Who can watch this video
            <select value={value.privacy ?? ''} onChange={(e) => set({ privacy: (e.target.value || undefined) as TikTokPrivacy | undefined })}
              style={{ border: `1px solid ${value.privacy ? C.rule2 : C.amber}`, borderRadius: 9, padding: '8px 10px', fontFamily: C.sans, fontSize: 13.5, color: C.ink, background: C.card }}>
              <option value="">Choose…</option>
              {creator.privacy_level_options.map((p) => {
                const blocked = p === 'SELF_ONLY' && !!value.commercial && !!value.brandedContent
                return <option key={p} value={p} disabled={blocked} title={blocked ? 'Branded content can’t be private' : undefined}>{TIKTOK_PRIVACY_LABEL[p] ?? p}{blocked ? ' (not for branded content)' : ''}</option>
              })}
            </select>
          </label>
          {!audited && <p style={{ margin: 0, fontSize: 11.5, color: C.amber, lineHeight: 1.45 }}>Until TikTok approves the Clarendon Labs app, posts can only go up as “Only me”.</p>}

          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>Allow viewers to</span>
            {([['allowComment', 'Comment', creator.comment_disabled], ['allowDuet', 'Duet', creator.duet_disabled], ['allowStitch', 'Stitch', creator.stitch_disabled]] as const).map(([k, name, off]) => (
              <label key={k} style={{ ...row, color: off ? C.faint : C.ink2 }} title={off ? `${name} is turned off in this account’s TikTok settings` : undefined}>
                <Toggle on={!off && !!value[k]} disabled={off} onChange={(v) => set({ [k]: v })} label={`Allow ${name}`} /> {name}{off ? ' — off in TikTok settings' : ''}
              </label>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 8, borderTop: `1px solid ${C.rule}`, paddingTop: 10 }}>
            <label style={{ ...row, fontWeight: 700, color: C.ink }}>
              <Toggle on={!!value.commercial} onChange={(v) => set({ commercial: v, ...(v ? {} : { yourBrand: false, brandedContent: false }) })} label="Disclose commercial content" /> Disclose commercial content
            </label>
            <span style={{ fontSize: 11.5, color: C.soft, lineHeight: 1.45 }}>Turn on if this video promotes yourself, a third party, or both.</span>
            {value.commercial && (
              <div style={{ display: 'grid', gap: 7, paddingLeft: 4 }}>
                <label style={{ ...row, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!value.yourBrand} onChange={(e) => set({ yourBrand: e.target.checked })} /> Your brand
                </label>
                <label style={{ ...row, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!value.brandedContent}
                    onChange={(e) => set({ brandedContent: e.target.checked, ...(e.target.checked && value.privacy === 'SELF_ONLY' ? { privacy: undefined } : {}) })} /> Branded content
                </label>
                {(value.yourBrand || value.brandedContent) && (
                  <span style={{ fontSize: 11.5, color: C.ink2 }}>
                    Your video will be labeled “{value.brandedContent ? 'Paid partnership' : 'Promotional content'}”.
                  </span>
                )}
                {!value.yourBrand && !value.brandedContent && <span style={{ fontSize: 11.5, color: C.amber }}>Choose at least one.</span>}
              </div>
            )}
          </div>
        </>
      )}

      <p style={{ margin: 0, fontSize: 11.5, color: C.soft, lineHeight: 1.45 }}>
        By posting, you agree to TikTok’s{' '}
        {direct && value.commercial && value.brandedContent && <><a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer" style={link}>Branded Content Policy</a> and{' '}</>}
        <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer" style={link}>Music Usage Confirmation</a>.
      </p>
    </div>
  )
}
