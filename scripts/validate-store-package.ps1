param(
    [string]$PackageRoot = "dist/store-package"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $repoRoot $PackageRoot

if (-not (Test-Path $packagePath)) {
    throw "Package folder not found: $packagePath"
}

function Assert-PathExists {
    param(
        [string]$BasePath,
        [string]$RelativePath,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        throw "$Label is empty"
    }

    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $BasePath $RelativePath))
    if (-not (Test-Path $fullPath)) {
        throw "$Label is missing: $RelativePath"
    }

    return $fullPath
}

$manifestPath = Assert-PathExists -BasePath $packagePath -RelativePath "manifest.json" -Label "Manifest"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

foreach ($property in @("16", "32", "48", "128")) {
    Assert-PathExists -BasePath $packagePath -RelativePath $manifest.icons.$property -Label "Manifest icon $property" | Out-Null
}

Assert-PathExists -BasePath $packagePath -RelativePath $manifest.background.service_worker -Label "Background service worker" | Out-Null
$popupHtmlPath = Assert-PathExists -BasePath $packagePath -RelativePath $manifest.action.default_popup -Label "Default popup" 

foreach ($property in @("16", "32", "48")) {
    Assert-PathExists -BasePath $packagePath -RelativePath $manifest.action.default_icon.$property -Label "Action icon $property" | Out-Null
}

$popupHtml = Get-Content $popupHtmlPath -Raw
$popupDir = Split-Path -Parent $popupHtmlPath

[regex]::Matches($popupHtml, '<link[^>]+href="([^"]+)"') | ForEach-Object {
    Assert-PathExists -BasePath $popupDir -RelativePath $_.Groups[1].Value -Label "Popup stylesheet" | Out-Null
}

[regex]::Matches($popupHtml, '<script[^>]+src="([^"]+)"') | ForEach-Object {
    Assert-PathExists -BasePath $popupDir -RelativePath $_.Groups[1].Value -Label "Popup script" | Out-Null
}

$serviceWorkerPath = Join-Path $packagePath $manifest.background.service_worker
$serviceWorker = Get-Content $serviceWorkerPath -Raw

[regex]::Matches($serviceWorker, "chrome\.runtime\.getURL\('([^']+)'\)") | ForEach-Object {
    Assert-PathExists -BasePath $packagePath -RelativePath $_.Groups[1].Value -Label "Service worker import" | Out-Null
}

[regex]::Matches($serviceWorker, "'((shared|content)/[^']+\.(js|css))'") |
    ForEach-Object { $_.Groups[1].Value } |
    Sort-Object -Unique |
    ForEach-Object {
        Assert-PathExists -BasePath $packagePath -RelativePath $_ -Label "Content script asset" | Out-Null
    }

$javaScriptFiles = Get-ChildItem -Path $packagePath -Recurse -Filter *.js | Sort-Object FullName
foreach ($file in $javaScriptFiles) {
    & node --check $file.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "JavaScript syntax check failed: $($file.FullName)"
    }
}

Write-Host "Store package validation passed:"
Write-Host "  Package: $packagePath"
Write-Host "  JS files checked: $($javaScriptFiles.Count)"
