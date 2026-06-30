param(
  [string]$OutputDir = "release/we-smtc",
  [switch]$BuildBridge
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedOutputParent = Resolve-Path -LiteralPath $repoRoot
$target = Join-Path $repoRoot $OutputDir
$fullTarget = [System.IO.Path]::GetFullPath($target)
$repoFullPath = [System.IO.Path]::GetFullPath($resolvedOutputParent.Path)
$repoFullPathWithSeparator = $repoFullPath
if (-not $repoFullPathWithSeparator.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
  $repoFullPathWithSeparator += [System.IO.Path]::DirectorySeparatorChar
}

if (-not $fullTarget.StartsWith($repoFullPathWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputDir must stay inside the repository: $OutputDir"
}

if ($BuildBridge) {
  $bridgeDir = Join-Path $repoRoot "bridge/rust-smtc"
  $cargo = Join-Path $env:USERPROFILE ".cargo/bin/cargo.exe"
  if (-not (Test-Path -LiteralPath $cargo)) {
    $cargo = "cargo"
  }

  $vsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
  if (Test-Path -LiteralPath $vsDevCmd) {
    cmd /c "call `"$vsDevCmd`" -arch=x64 -host_arch=x64 >nul && cd /d `"$bridgeDir`" && `"$cargo`" build --release"
  } else {
    Push-Location $bridgeDir
    try {
      & $cargo build --release
    } finally {
      Pop-Location
    }
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Bridge release build failed"
  }
}

if (Test-Path -LiteralPath $fullTarget) {
  Remove-Item -LiteralPath $fullTarget -Recurse -Force
}

New-Item -ItemType Directory -Path $fullTarget | Out-Null

Copy-Item -LiteralPath (Join-Path $repoRoot "project.json") -Destination $fullTarget
Copy-Item -LiteralPath (Join-Path $repoRoot "index.html") -Destination $fullTarget
Copy-Item -LiteralPath (Join-Path $repoRoot "docs/workshop-readme.md") -Destination (Join-Path $fullTarget "README.md")
Copy-Item -LiteralPath (Join-Path $repoRoot "LICENSE") -Destination $fullTarget
$assetsSource = Join-Path $repoRoot "assets"
$assetsTarget = Join-Path $fullTarget "assets"
New-Item -ItemType Directory -Path $assetsTarget | Out-Null
foreach ($asset in Get-ChildItem -LiteralPath $assetsSource -Force) {
  if ($asset.Name -eq "manifest.json") {
    continue
  }
  Copy-Item -LiteralPath $asset.FullName -Destination $assetsTarget -Recurse
}
$configTarget = Join-Path $fullTarget "config"
New-Item -ItemType Directory -Path $configTarget | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot "config/lyrics-api-rules.json") -Destination $configTarget
Copy-Item -LiteralPath (Join-Path $repoRoot "src") -Destination $fullTarget -Recurse

$projectJsonPath = Join-Path $repoRoot "project.json"
$project = [System.IO.File]::ReadAllText($projectJsonPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
if ($project.preview) {
  $previewSource = Join-Path $repoRoot $project.preview
  if (-not (Test-Path -LiteralPath $previewSource)) {
    throw "Project preview file is missing: $($project.preview)"
  }
  Copy-Item -LiteralPath $previewSource -Destination $fullTarget
}

$bridgeTarget = Join-Path $fullTarget "bridge"
New-Item -ItemType Directory -Path $bridgeTarget | Out-Null
Copy-Item -LiteralPath (Join-Path $repoRoot "bridge/README.md") -Destination $bridgeTarget

Write-Host "Packaged Wallpaper Engine files to $fullTarget"
