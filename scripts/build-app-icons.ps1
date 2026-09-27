$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectDirectory = Split-Path $PSScriptRoot -Parent
$sourceImage = [System.Drawing.Image]::FromFile((Join-Path $projectDirectory 'dist/assets/mafia-gold-icon.png'))
try {
  foreach ($spec in @(@{Name='apple-touch-icon-v2.png';Size=180;Scale=1},@{Name='app-icon-192-v2.png';Size=192;Scale=1},@{Name='app-icon-512-v2.png';Size=512;Scale=1},@{Name='app-icon-maskable-512-v2.png';Size=512;Scale=0.72})) {
    $bitmap = [System.Drawing.Bitmap]::new($spec.Size,$spec.Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#080b0c'))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $side = [int]($spec.Size*$spec.Scale)
      $offset = [int](($spec.Size-$side)/2)
      $graphics.DrawImage($sourceImage,$offset,$offset,$side,$side)
      $bitmap.Save((Join-Path $projectDirectory ('dist/assets/'+$spec.Name)),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally {$graphics.Dispose();$bitmap.Dispose()}
  }
} finally {$sourceImage.Dispose()}
