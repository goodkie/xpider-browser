$path = "e:\vivpr\ai\collect-list\extension\background.js"
$content = Get-Content $path

# 1. Reset logs in runEngineSearch (Line 1437)
$content[1436] = "    sessionResults = [];"
$content = $content[0..1436] + "    sessionLogs = [];" + $content[1437..($content.Length-1)]

# 2. Add progress=100 in runEngineSearch finally (Line 1690+1 because of previous insert)
# Wait, let's target by content to be safer with offsets
for ($i=0; $i -lt $content.Length; $i++) {
    if ($content[$i] -match "isSearching = false;" -and $i -gt 1680 -and $i -lt 1700) {
        $content = $content[0..$i] + "        currentProgressPercent = 100;" + $content[($i+1)..($content.Length-1)]
        break
    }
}

# 3. Reset logs in runWebsiteCrawl (Line 1711ish)
for ($i=1700; $i -lt $content.Length; $i++) {
    if ($content[$i] -match "sessionResults = \[\];" -and $i -lt 1750) {
        $content = $content[0..$i] + "    sessionLogs = [];" + $content[($i+1)..($content.Length-1)]
        break
    }
}

# 4. Add progress=100 in runWebsiteCrawl finally (Around 1920)
for ($i=1900; $i -lt $content.Length; $i++) {
    if ($content[$i] -match "isSearching = false;" -and $i -lt 1950) {
        $content = $content[0..$i] + "        currentProgressPercent = 100;" + $content[($i+1)..($content.Length-1)]
        break
    }
}

$content | Set-Content $path -Encoding UTF8
Write-Host "Done"
