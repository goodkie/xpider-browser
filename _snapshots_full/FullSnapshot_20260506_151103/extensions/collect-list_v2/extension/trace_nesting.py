def trace_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    level = 0
    for i, line in enumerate(lines):
        line_num = i + 1
        for char in line:
            if char == '{':
                level += 1
            elif char == '}':
                level -= 1
        if level != 0:
            # Only print if level is non-zero (inside a block)
            # or if it just returned to zero (to see where blocks end)
            pass
        if i > 1550: # Check the end of the file
            print(f"Line {line_num}: Level {level} - {line.strip()}")

if __name__ == "__main__":
    trace_braces('background.js')
