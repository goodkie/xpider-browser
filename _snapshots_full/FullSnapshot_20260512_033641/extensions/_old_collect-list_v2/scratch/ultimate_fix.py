import os

def fix():
    path = r'e:\vivpr\ai\collect-list\extension\translations.js'
    
    # Read raw bytes
    with open(path, 'rb') as f:
        data = f.read()
    
    print(f"File size: {len(data)} bytes")
    print(f"First 20 bytes: {data[:20].hex()}")
    
    # Try different interpretations
    # 1. It's actually UTF-8 with BOM
    if data.startswith(b'\xef\xbb\xbf'):
        print("Detected UTF-8 BOM. Removing...")
        content = data[3:].decode('utf-8', errors='ignore')
    # 2. It's UTF-16LE (v.a.r...)
    elif b'v\x00a\x00r\x00' in data:
        print("Detected UTF-16LE. Converting to UTF-8...")
        content = data.decode('utf-16le', errors='ignore')
    # 3. It's UTF-8 but being read as UTF-16 (The '慶⁲' pattern)
    elif b'v' in data and b'a' in data and b'\x00' not in data[:100]:
        print("Detected raw UTF-8 (likely).")
        content = data.decode('utf-8', errors='ignore')
    else:
        # Fallback: try to find anything that looks like var I18N_DATA
        for enc in ['utf-8', 'utf-16', 'cp949', 'latin-1']:
            try:
                t = data.decode(enc)
                if 'I18N_DATA' in t:
                    print(f"Found match with {enc}!")
                    content = t
                    break
            except:
                pass
        else:
            print("No encoding matched. Using Turn 1 recovery strategy.")
            return False

    # Apply the Branding Change to the recovered content
    if 'I18N_DATA' in content:
        # Replace the title in all languages
        import re
        content = re.sub(r'"app_title":\s*"[^"]*"', '"app_title": "X PIDER-Local Business Data Crawler"', content)
        
        # Write back as clean UTF-8 without BOM
        with open(path, 'wb') as f:
            f.write(content.encode('utf-8'))
        print("Successfully fixed and branded translations.js")
        return True
    return False

if __name__ == "__main__":
    if not fix():
        print("Failed to fix. Reverting to manual Turn 1 reconstruction...")
