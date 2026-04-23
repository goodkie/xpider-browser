$path = 'e:\vivpr\ai\collect-list\extension\background.js'
$lines = Get-Content -Path $path -Encoding UTF8
$lines[707] = $lines[707].Replace('hl === "ja"', '_hl === "ja"').Replace('gl === "jp"', '_gl === "jp"').Replace("hl === 'ja'", "_hl === 'ja'").Replace("gl === 'jp'", "_gl === 'jp'")
$lines | Set-Content -Path $path -Encoding UTF8
Write-Output "FIXED_SUCCESSFULLY"
