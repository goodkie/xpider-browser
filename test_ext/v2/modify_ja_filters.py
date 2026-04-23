import os

# [v33.4] Script to safely remove complexity filters from business_filters.js 
# to avoid character encoding/corruption issues with AI tool calls.

target_file = r'e:\vivpr\ai\collect-list\extension\business_filters.js'
temp_file = target_file + '.tmp'

# Lines to remove: 258 to 272 (inclusive, 1-indexed)
# Note: Lines in my last view_file were 258-272.
start_remove = 258
end_remove = 272

try:
    with open(target_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    with open(temp_file, 'w', encoding='utf-8') as f:
        for i, line in enumerate(lines):
            line_num = i + 1
            if start_remove <= line_num <= end_remove:
                if line_num == start_remove:
                    f.write("            // [v33.4] Word count/Complexity limits removed for Japanese as requested.\n")
                continue
            f.write(line)

    os.replace(temp_file, target_file)
    print(f"Successfully modified {target_file}")
except Exception as e:
    print(f"Error: {e}")
    if os.path.exists(temp_file):
        os.remove(temp_file)
