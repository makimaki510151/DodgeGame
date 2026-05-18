# ソース (style.css, script.js) から Build/*.gz を生成する。UTF-8 のまま gzip する。
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$build = Join-Path $root "Build"
$srcCss = Join-Path $root "style.css"
$srcCfg = Join-Path $root "js\unityroomConfig.js"
$srcUr = Join-Path $root "js\unityroomScore.js"
$srcJs = Join-Path $root "script.js"
$concatJs = Join-Path $root "Build\_framework.concat.js"

if (-not (Test-Path $srcCss)) { throw "Missing: $srcCss" }
if (-not (Test-Path $srcCfg)) { throw "Missing: $srcCfg" }
if (-not (Test-Path $srcUr)) { throw "Missing: $srcUr" }
if (-not (Test-Path $srcJs)) { throw "Missing: $srcJs" }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Force -Path $build | Out-Null
Get-ChildItem -LiteralPath $build -Filter "*.html" -File | Remove-Item -Force

function Write-GZip-File {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$DestGzPath
    )
    $inStream = [System.IO.File]::OpenRead($SourcePath)
    try {
        $outStream = [System.IO.File]::Create($DestGzPath)
        try {
            $gzip = New-Object System.IO.Compression.GZipStream(
                $outStream,
                [System.IO.Compression.CompressionMode]::Compress
            )
            try {
                $inStream.CopyTo($gzip)
            }
            finally {
                $gzip.Dispose()
            }
        }
        finally {
            $outStream.Dispose()
        }
    }
    finally {
        $inStream.Dispose()
    }
}

Write-GZip-File -SourcePath $srcCss -DestGzPath (Join-Path $build "dodgegame.data.gz")

$bundleText =
    [System.IO.File]::ReadAllText($srcCfg, $utf8NoBom) +
    [System.IO.File]::ReadAllText($srcUr, $utf8NoBom) +
    [System.IO.File]::ReadAllText($srcJs, $utf8NoBom)
[System.IO.File]::WriteAllText($concatJs, $bundleText, $utf8NoBom)
Write-GZip-File -SourcePath $concatJs -DestGzPath (Join-Path $build "dodgegame.framework.js.gz")
Remove-Item -LiteralPath $concatJs -Force

# Unity の codeUrl に相当するプレースホルダ（1 バイトの gzip。ローダーは展開して破棄）
$wasmGz = Join-Path $build "dodgegame.wasm.gz"
$outW = [System.IO.File]::Create($wasmGz)
try {
    $gzW = New-Object System.IO.Compression.GZipStream(
        $outW,
        [System.IO.Compression.CompressionMode]::Compress
    )
    try {
        $gzW.Write([byte[]]@(0), 0, 1)
    }
    finally {
        $gzW.Dispose()
    }
}
finally {
    $outW.Dispose()
}

Write-Host "Build OK:" $build
