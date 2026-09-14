$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node "$PSScriptRoot\tools\deploy-vercel.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
