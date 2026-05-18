import re

def count_parens_carefully(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove single line comments
    content = re.sub(r'//.*', '', content)
    # Remove multi-line comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    # Remove strings
    content = re.sub(r"(['\"])(?:(?!\1|\\).|\\.)*\1", '', content)
    # Remove template literals (roughly)
    content = re.sub(r"`(?:(?!`|\\).|\\.)*`", '', content, flags=re.DOTALL)
    # Remove regex
    # content = re.sub(r"/(?:(?!/|\\).|\\.)*/[gi]*", '', content) # Too risky

    open_p = 0
    close_p = 0
    for i, char in enumerate(content):
        if char == '(': open_p += 1
        elif char == ')': close_p += 1
    
    print(f"Open: {open_p}, Close: {close_p}")

if __name__ == "__main__":
    count_parens_carefully('background.js')
