import re

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    stack = []
    for i, line in enumerate(lines):
        line_num = i + 1
        for char in line:
            if char == '{':
                stack.append(line_num)
            elif char == '}':
                if not stack:
                    print(f"Extra closing brace at line {line_num}")
                else:
                    stack.pop()
    
    for start_line in stack:
        print(f"Unclosed opening brace from line {start_line}")

if __name__ == "__main__":
    check_braces('global_blacklist.js')
