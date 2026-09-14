# One-shot deploy after: npx supabase login
Set-Location $PSScriptRoot
npx supabase functions deploy mafia-room --project-ref unsxzbrpqvppecjnirqx --no-verify-jwt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "OK: mafia-room deployed. Test host PIN 19930620 on site."
