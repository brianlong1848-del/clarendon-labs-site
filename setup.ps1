# Clarendon Labs end-to-end build + deploy
# Run via setup.cmd (double-click) so PowerShell opens with ExecutionPolicy bypass

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Section($title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

Section "1. Tool check"
node --version
npm --version
git --version
(gh --version | Select-Object -First 1)
try { $vv = (npx --yes vercel --version) 2>$null; "vercel: $vv" } catch { "vercel: not installed yet (will fetch via npx)" }

Section "2. Remove stale sandbox .git"
if (Test-Path .git) {
    Remove-Item -Recurse -Force .git
    Write-Host "Removed stale .git"
} else {
    Write-Host "No stale .git"
}

Section "3. npm install"
npm install

Section "4. npm run build"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

Section "5. git init and first commit"
git init -b main
git add .
git -c user.email="brianlong1848@gmail.com" -c user.name="Brian Long" commit -m "Initial commit - Clarendon Labs website"

Section "6. GitHub repo (via gh CLI)"
$ghStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "gh CLI not authenticated. Run: gh auth login" -ForegroundColor Yellow
    Write-Host $ghStatus
    throw "gh auth required"
}
# Check if repo exists first
gh repo view clarendon-labs-site 2>$null 1>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Repo exists, wiring remote and pushing"
    $ghUser = gh api user --jq .login
    git remote remove origin 2>$null
    git remote add origin "https://github.com/$ghUser/clarendon-labs-site.git"
    git push -u origin main
} else {
    gh repo create clarendon-labs-site --public --source=. --remote=origin --push --description "Clarendon Labs marketing site"
}

Section "7. Vercel deploy (non-interactive)"
$whoami = npx --yes vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Vercel CLI not logged in." -ForegroundColor Yellow
    Write-Host "Run: npx vercel login" -ForegroundColor Yellow
    Write-Host "Then re-run this script (it is safe to re-run, it will pick up where it left off)." -ForegroundColor Yellow
    throw "vercel login required"
}
Write-Host "Vercel user: $whoami"
# --yes auto-accepts defaults (new project, name = folder name, root = ., framework autodetect)
npx --yes vercel --prod --yes

Section "DONE"
Write-Host "All phases complete. Switch back to Cowork and I will continue with domain + Workspace setup." -ForegroundColor Green
Write-Host ""
Write-Host "Press Enter to close this window..."
Read-Host | Out-Null
