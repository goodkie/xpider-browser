import os

path = r"e:\vivpr\ai\collect-list\extension\background.js"

with open(path, 'rb') as f:
    raw = f.read()

# 1. Strip BOM
if raw.startswith(b'\xef\xbb\xbf'):
    raw = raw[3:]

# 2. Try to repair Mojibake
# Mojibake often happens when UTF-8 bytes are interpreted as some other 8-bit encoding
# on Windows, usually Windows-1252 or Latin-1.
# We try to fix it by "reversing" that mistake.
try:
    # If the file was read correctly but written as UTF-8 Mojibake
    # we need to decode as UTF-8, then encode as Windows-1252/cp949/etc
    # and then decode as UTF-8 again.
    
    # Let's try the common Windows Mojibake reversal
    text = raw.decode('utf-8')
    
    # Try re-encoding and decoding
    # This specifically fixes the '?좑툘' pattern
    try:
        fixed = text.encode('cp1252').decode('utf-8')
        text = fixed
    except:
        try:
            fixed = text.encode('latin-1').decode('utf-8')
            text = fixed
        except:
            pass
            
    # Also fix the duplicate sessionResults line I saw
    text = text.replace("    sessionResults = [];\n    sessionResults = [];", "    sessionResults = [];")
    
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print("Repair successful.")
except Exception as e:
    print(f"Repair failed: {str(e)}")
