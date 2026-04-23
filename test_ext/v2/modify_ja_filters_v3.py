import os

# [v33.4] Script to safely remove complexity filters from business_filters.js 
# by searching for specific string markers.
target_file = r'e:\vivpr\ai\collect-list\extension\business_filters.js'
temp_file = target_file + '.tmp'

try:
    with open(target_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    with open(temp_file, 'w', encoding='utf-8') as f:
        skip = False
        for line in lines:
            if '// [v32.0] Strict Japanese Word/Particle Count' in line:
                skip = True
                f.write('            // [v33.4] Word count/Complexity limits removed for Japanese as requested.\n')
            
            if skip:
                if 'return false;' in line and 'JA Too complex' in lines[lines.index(line)-1]:
                    # This is the 'return false;' inside the if block
                    pass
                elif line.strip() == '}':
                    # This ends the if block (Line 272)
                    skip = False
                    continue
                else:
                    # Skip everything else in the block
                    continue
            
            if not skip:
                f.write(line)

    os.replace(temp_file, target_file)
    print(f"Successfully modified {target_file}")
except Exception as e:
    print(f"Error: {e}")
