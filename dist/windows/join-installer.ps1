# Rebuild Windows installer from split parts (PowerShell)
# Usage: .\join-installer.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$parts = Get-ChildItem -Path $here -Filter "Refloow-Photo-Studio-Setup-1.1.0.exe.part*" | Sort-Object Name
if (-not $parts -or $parts.Count -eq 0) {
  throw "No .part files found in $here"
}

$out = Join-Path $here "Refloow Photo Studio Setup 1.1.0.exe"
if (Test-Path $out) { Remove-Item $out -Force }

$dest = [System.IO.File]::OpenWrite($out)
try {
  foreach ($p in $parts) {
    Write-Host "Appending $($p.Name)..."
    $bytes = [System.IO.File]::ReadAllBytes($p.FullName)
    $dest.Write($bytes, 0, $bytes.Length)
  }
} finally {
  $dest.Close()
}

Write-Host "Done: $out ($([math]::Round((Get-Item $out).Length/1MB,1)) MB)"
