# Moves previous trial videos to the Recycle Bin (restorable). Default: preview only.
#   powershell -ExecutionPolicy Bypass -File scripts\clean-previous.ps1          (preview)
#   powershell -ExecutionPolicy Bypass -File scripts\clean-previous.ps1 -Apply   (run)
# Keeps: the getting-started work (output + library), cache\tts, assets, series, knowledge-base, .env, data.
param([switch]$Apply)
Add-Type -AssemblyName Microsoft.VisualBasic
$root = Split-Path -Parent $PSScriptRoot
$desk = [Environment]::GetFolderPath("Desktop")
$targets = @(
  "$desk\JAWAB Trial - 2 Episodes",
  "$desk\JAWAB Trial - Episode 1 v14",
  "$desk\Voice Test",
  "$root\library\accounting-basics"
)
$targets += (Get-ChildItem "$root\output" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike "getting-started-*" } | ForEach-Object { $_.FullName })
foreach ($t in $targets) {
  if (-not (Test-Path $t)) { Write-Host "(missing) $t"; continue }
  $mb = [math]::Round(((Get-ChildItem $t -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum) / 1MB, 1)
  if ($Apply) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($t, "OnlyErrorDialogs", "SendToRecycleBin")
    Write-Host "moved to Recycle Bin: $t ($mb MB)"
  } else { Write-Host "would move to Recycle Bin: $t ($mb MB)" }
}
if ($Apply) {
  $idx = "$root\library\index.json"
  if (Test-Path $idx) {
    $j = Get-Content $idx -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.series.PSObject.Properties.Name -contains "accounting-basics") { $j.series.PSObject.Properties.Remove("accounting-basics"); [IO.File]::WriteAllText($idx, ($j | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false))); Write-Host "library index updated" }
  }
} else { Write-Host "`nadd -Apply to run it" }
