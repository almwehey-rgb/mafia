$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$runtimeNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if ($nodeCommand) { $runtimeNode = $nodeCommand.Source }
if (!(Test-Path -LiteralPath $runtimeNode)) { throw 'Install Node.js 24 or newer and run this script again.' }
Push-Location $projectRoot
try {
    & $runtimeNode scripts/build-fast-start.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    & $runtimeNode tests/browser-server.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Local server failed.' }
} finally { Pop-Location }
