#!/bin/bash
# Swaps a TikTok for Business auth_code for a long-lived access token and saves it to Vercel.
# Reads the code and the app secret from the clipboard, so nothing is typed or shown.
set -u
cd "$(dirname "$0")/.." || exit 1
APP_ID=7693244812249563157

echo "Step 1: In Chrome, click the clarendon.dev/analytics tab, click the address bar, press Cmd+C."
read -p "        Then press Return here. " _
CODE=$(pbpaste | sed -n 's/.*[?&]auth_code=\([^&]*\).*/\1/p')
if [ -z "$CODE" ]; then echo "No auth_code found in what you copied. Copy the whole address and run this again."; exit 1; fi
echo "        Got the code."

echo "Step 2: In the TikTok tab, click the copy icon next to 'Secret' (not Reset)."
read -p "        Then press Return here. " _
SECRET=$(pbpaste | tr -d '[:space:]')
if [ ${#SECRET} -lt 30 ]; then echo "That doesn't look like the full secret (${#SECRET} characters). Try the copy icon again."; exit 1; fi
echo "        Got the secret (${#SECRET} characters)."

RESP=$(curl -s -X POST https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/ \
  -H 'Content-Type: application/json' \
  -d "{\"app_id\":\"$APP_ID\",\"secret\":\"$SECRET\",\"auth_code\":\"$CODE\"}")
TOKEN=$(printf %s "$RESP" | python3 -c 'import sys,json;d=json.load(sys.stdin);print((d.get("data") or {}).get("access_token") or "",end="")')
if [ -z "$TOKEN" ]; then
  echo "TikTok said: $(printf %s "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("message",""))')"
  printf '' | pbcopy; exit 1
fi

vercel env rm TIKTOK_ACCESS_TOKEN production -y >/dev/null 2>&1
printf %s "$TOKEN" | vercel env add TIKTOK_ACCESS_TOKEN production >/dev/null && echo "Saved TIKTOK_ACCESS_TOKEN to Vercel."

for kv in ROLLIGAN:7652176811786387473 GAGORDER:7691867644223520789 YULEPICK:7698384832197148692 BOREA:7698384346081738773 JINGLEWIRE:7698383319507337237; do
  n="${kv%%:*}_TIKTOK_ADVERTISER_ID"; v="${kv#*:}"
  vercel env rm "$n" production -y >/dev/null 2>&1
  printf %s "$v" | vercel env add "$n" production >/dev/null && echo "Saved $n."
done

printf '' | pbcopy
unset CODE SECRET TOKEN RESP
echo "Done. Clipboard cleared. Redeploying..."
vercel --prod --yes >/dev/null 2>&1 && echo "Redeployed. Tell Claude it's live." || echo "Redeploy didn't start; push any commit instead."
