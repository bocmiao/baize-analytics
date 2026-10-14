param([Parameter(Mandatory=$true)][string]$Package)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'SPLIT_MANIFEST.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$entries = @($manifest.packages | Where-Object { $_.file -ceq $Package })
if ($entries.Count -ne 1 -or [IO.Path]::GetFileName($Package) -cne $Package) { throw 'Choose an exact archive name from SPLIT_MANIFEST.json' }
$entry = $entries[0]
$destination = Join-Path (Get-Location) $Package
$temporary = $destination + '.assembling'
if ((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $temporary)) { throw 'Output or assembly file exists; no overwrite allowed' }
$number = 0
foreach ($part in $entry.parts) {
    $number++
    $expected = $Package + ('.part{0:D3}' -f $number)
    if ($part.file -cne $expected) { throw 'Invalid part order/name' }
    $path = Join-Path (Get-Location) $part.file
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { throw ('Missing part: ' + $part.file) }
    if ((Get-Item -LiteralPath $path).Length -ne $part.bytes) { throw ('Wrong size: ' + $part.file) }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $part.sha256) { throw ('Corrupt part: ' + $part.file) }
}
$output = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try {
    foreach ($part in $entry.parts) {
        $partStream = [IO.File]::OpenRead((Join-Path (Get-Location) $part.file))
        try { $partStream.CopyTo($output) } finally { $partStream.Dispose() }
    }
    $output.Flush($true)
} finally { $output.Dispose() }
if ((Get-Item -LiteralPath $temporary).Length -ne $entry.bytes -or (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256) { throw 'Archive hash mismatch; assembly preserved' }
[IO.File]::Move($temporary, $destination)
Write-Output ('Verified archive restored: ' + $Package)
Write-Output ('SHA256 ' + $entry.sha256)
