#!/bin/bash
# One-time: point /post's TikTok posting at TikTok API for Business.
# Usage: bash scripts/tiktok-biz-setup.sh '<TikTok account holder authorization URL>'
# Reads the app secret from the clipboard (copy it with the icon next to "Secret"),
# saves TIKTOK_BIZ_SECRET + TIKTOK_BIZ_AUTH_URL to Vercel, clears the clipboard, redeploys.
set -u
cd "$(dirname "$0")/.." || exit 1
AUTH_URL="${1:-}"
case "$AUTH_URL" in https://www.tiktok.com/*) ;; *) echo "Pass the authorization URL in quotes as the first argument."; exit 1;; esac

echo "In the TikTok API portal, click the copy icon next to 'Secret' (not Reset)."
read -p "Then press Return here. " _
SECRET=$(pbpaste | tr -d '[:space:]')
if [ ${#SECRET} -lt 30 ]; then echo "That doesn't look like the full secret (${#SECRET} characters). Try the copy icon again."; exit 1; fi

for n in TIKTOK_BIZ_SECRET TIKTOK_BIZ_AUTH_URL; do vercel env rm "$n" production -y >/dev/null 2>&1; done
printf %s "$SECRET" | vercel env add TIKTOK_BIZ_SECRET production >/dev/null && echo "Saved TIKTOK_BIZ_SECRET."
printf %s "$AUTH_URL" | vercel env add TIKTOK_BIZ_AUTH_URL production >/dev/null && echo "Saved TIKTOK_BIZ_AUTH_URL."
printf '' | pbcopy; unset SECRET
echo "Clipboard cleared. Redeploying..."
vercel --prod --yes >/dev/null 2>&1 && echo "Redeployed. Tell Claude it's live." || echo "Redeploy didn't start; push any commit instead."
