import sys
import os

# [v33.4] Script to safely remove complexity filters from business_filters.js 
target_file = r'e:\vivpr\ai\collect-list\extension\business_filters.js'
temp_file = target_file + '.tmp'

print(f"Opening: {target_file}")
try:
    with open(target_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Define the block to remove based on the previously seen structure.
    # We will search for a safe anchor.
    search_start = "// [v32.0] Strict Japanese Word/Particle Count"
    if search_start not in content:
        print("Error: Could not find start anchor.")
        sys.exit(1)

    # Find the block from line 258 up to the end of the if block
    # Line 272 is: }
    
    # Let's replace the whole block more robustly
    import re
    # Match from the comment up to the end of the complexity if-block
    # This pattern matches across lines: [v32.0]... if (totalComplexity >= ...) { ... }
    pattern = r'\/\/\s+\[v32\.0\]\s+Strict Japanese Word\/Particle Count.*?if\s+\(totalComplexity\s+>=\s+complexityThreshold\)\s+\{.*?\}'
    
    new_content, count = re.subn(pattern, "            // [v33.4] Word count/Complexity limits removed for Japanese as requested.", content, flags=re.DOTALL)
    
    if count == 0:
        print("Error: Regex pattern did not match anything.")
        sys.exit(1)

    with open(temp_file, 'w', encoding='utf-8') as f:
        f.write(new_content)

    os.replace(temp_file, target_file)
    print(f"Successfully modified {target_file} (Matches: {count})")
except Exception as e:
    print(f"Critical Error: {e}")
    sys.exit(1)
