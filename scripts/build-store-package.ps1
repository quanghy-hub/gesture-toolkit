param(
    [string]$OutputRoot = "dist"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputRootPath = Join-Path $repoRoot $OutputRoot
$packageRoot = Join-Path $outputRootPath "store-package"
$zipPath = Join-Path $outputRootPath "gesture-toolkit-store.zip"

$files = @(
    "manifest.json",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "background/service-worker.js",
    "shared/namespace.js",
    "shared/config.js",
    "shared/storage.js",
    "shared/runtime.js",
    "shared/tab-actions-client.js",
    "shared/extension-ui-guard.js",
    "shared/viewport-core.js",
    "shared/floating-core.js",
    "shared/touch-core.js",
    "shared/toast-core.js",
    "shared/selection-core.js",
    "shared/dom-utils.js",
    "content/bootstrap.js",
    "content/gestures/desktop.js",
    "content/gestures/mobile.js",
    "content/gestures/index.js",
    "content/clipboard/constants.js",
    "content/clipboard/panel-data.js",
    "content/clipboard/actions.js",
    "content/clipboard/ui.js",
    "content/clipboard/controller.js",
    "content/clipboard/index.js",
    "content/clipboard/styles.css",
    "content/quick-search/constants.js",
    "content/quick-search/ui.js",
    "content/quick-search/text-session.js",
    "content/quick-search/image-session.js",
    "content/quick-search/actions.js",
    "content/quick-search/controller.js",
    "content/quick-search/index.js",
    "ui/popup/popup.html",
    "ui/popup/popup.css",
    "ui/popup/popup.js"
)

if (Test-Path $packageRoot) {
    Remove-Item -LiteralPath $packageRoot -Recurse -Force
}

if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null

foreach ($relativePath in $files) {
    $sourcePath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path $sourcePath)) {
        throw "Missing required file: $relativePath"
    }

    $targetPath = Join-Path $packageRoot $relativePath
    $targetDir = Split-Path -Parent $targetPath
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
}

Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Created store package:"
Write-Host "  Folder: $packageRoot"
Write-Host "  Zip:    $zipPath"
