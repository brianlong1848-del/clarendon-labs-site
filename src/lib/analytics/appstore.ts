// ─── App Store Connect API ───────────────────────────────────────────────────
//
// Downloads + proceeds from the daily Sales Report, for one app's numeric
// Apple id. Needs three env vars from an App Store Connect API key (Users and
// Access → Integrations → App Store Connect API — must be an Admin/Finance
// role key to read sales reports):
//   ASC_KEY_ID          the key's Key ID
//   ASC_ISSUER_ID       the Issuer ID shown on the same Integrations page
//   ASC_PRIVATE_KEY     the .p8 file's contents, newlines kept as \n
//   ASC_VENDOR_NUMBER   Agreements, Tax, and Banking → the vendor number
//
// Sales reports for a given day are usually published with a day or two of
// lag, so "yesterday" can still 404 — this steps back a few days until it
// finds one that exists, and reports the date it actually used.

import { createSign } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

function signAppStoreJWT(): string | null {
  const keyId = process.env.ASC_KEY_ID
  const issuerId = process.env.ASC_ISSUER_ID
  const privateKey = process.env.ASC_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!keyId || !issuerId || !privateKey) return null

  const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const signingInput = `${b64url({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64url({
    iss: issuerId,
    iat: now,
    exp: now + 1200,
    aud: 'appstoreconnect-v1',
  })}`

  try {
    const sign = createSign('SHA256')
    sign.update(signingInput)
    sign.end()
    // ASC wants the raw R||S signature (IEEE P1363), not the DER encoding
    // Node's default ECDSA signing produces.
    const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
    return `${signingInput}.${signature.toString('base64url')}`
  } catch {
    return null
  }
}

export type AppStoreMetrics = { downloads: number; proceeds: number; reportDate: string } | null

export async function fetchAppStore(appleAppId: string): Promise<AppStoreMetrics> {
  const jwt = signAppStoreJWT()
  const vendorNumber = process.env.ASC_VENDOR_NUMBER
  if (!jwt || !vendorNumber) return null

  for (let daysBack = 1; daysBack <= 5; daysBack++) {
    const reportDate = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10)
    const params = new URLSearchParams({
      'filter[frequency]': 'DAILY',
      'filter[reportDate]': reportDate,
      'filter[reportType]': 'SALES',
      'filter[reportSubType]': 'SUMMARY',
      'filter[vendorNumber]': vendorNumber,
      'filter[version]': '1_0',
    })

    try {
      const res = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${params}`, {
        headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/a-gzip' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (res.status === 404) continue // not published yet for this date — try an earlier one
      if (!res.ok) return null

      const tsv = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf-8')
      const [headerLine, ...rows] = tsv.trim().split('\n')
      const cols = headerLine.split('\t')
      const idIdx = cols.indexOf('Apple Identifier')
      const unitsIdx = cols.indexOf('Units')
      const proceedsIdx = cols.indexOf('Developer Proceeds')
      if (idIdx === -1 || unitsIdx === -1) return null

      let downloads = 0
      let proceeds = 0
      for (const row of rows) {
        const cells = row.split('\t')
        if (cells[idIdx] !== appleAppId) continue
        const units = Number(cells[unitsIdx] ?? 0)
        downloads += units
        proceeds += units * Number(cells[proceedsIdx] ?? 0)
      }
      return { downloads, proceeds: Math.round(proceeds * 100) / 100, reportDate }
    } catch {
      return null
    }
  }
  return null
}
