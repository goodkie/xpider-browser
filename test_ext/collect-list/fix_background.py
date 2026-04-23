import re
import os

path = r"e:\vivpr\ai\collect-list\extension\background.js"

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Reset logs in initialization blocks
# Use a pattern that is flexible with whitespace
init_pattern = re.compile(r"isSearching = true;\s+isCancelled = false;\s+sessionResults = \[\];\s+currentProgressPercent = 0;")
content = init_pattern.sub("isSearching = true;\n    isCancelled = false;\n    sessionResults = [];\n    sessionLogs = [];\n    currentProgressPercent = 0;", content)

# 2. Add currentProgressPercent = 100 to finally blocks
finally_pattern = re.compile(r"isSearching = false;\s+chrome.runtime.sendMessage\(\{ action: 'complete' \}\);")
content = finally_pattern.sub("isSearching = false;\n        currentProgressPercent = 100;\n        chrome.runtime.sendMessage({ action: 'complete' });", content)

with open(path, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(content)

print("Background.js programmatically updated.")
