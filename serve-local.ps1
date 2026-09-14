$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:4173/")
$listener.Start()
Write-Host "http://127.0.0.1:4173/  ->  $root"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
  $full = Join-Path $root $path
  if (Test-Path $full -PathType Leaf) {
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    $types = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".webp"="image/webp"; ".png"="image/png" }
    $ctx.Response.ContentType = $types[$ext]
    if (-not $ctx.Response.ContentType) { $ctx.Response.ContentType = "application/octet-stream" }
    $bytes = [IO.File]::ReadAllBytes($full)
    $ctx.Response.StatusCode = 200
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
