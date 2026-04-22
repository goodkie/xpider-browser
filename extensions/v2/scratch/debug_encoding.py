mojibake = "?띿뒪???섏쭛"
encodings = ['cp949', 'cp1252', 'latin-1', 'utf-16le', 'euc-kr']

for enc in encodings:
    try:
        # Reversing the "wrongly read" process
        # UTF-8 bytes were read as 'enc', then stored back as UTF-8
        raw_bytes = mojibake.encode('utf-8')
        # This is tricky because mojibake.encode('utf-8') gives the wrong bytes.
        # We need the bytes that mojibake *is* in some other encoding.
        
        # Test 1: Content was UTF-8 -> interpreted as 'enc' -> saved as UTF-8
        # To fix: mojibake.encode('utf-8') -> ? -> decode as 'enc'? No.
        
        # Pattern ?띿뒪???섏쭛 (len 7) vs 텍스트 수집 (len 7)
        # This looks like one-to-one character mapping corruption.
        
        # Let's try encode then decode
        test = mojibake.encode(enc, errors='ignore').decode('utf-8', errors='ignore')
        print(f"[{enc}]: {test}")
    except Exception as e:
        print(f"[{enc}] failed: {e}")
