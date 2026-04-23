import sys

with open('background.js', 'r', encoding='utf-8') as f:
    content = f.read()

open_braces = content.count('{')
close_braces = content.count('}')

print(f"Open: {open_braces}")
print(f"Close: {close_braces}")

if open_braces > close_braces:
    print(f"Mismatch: {open_braces - close_braces} more open braces.")
elif close_braces > open_braces:
    print(f"Mismatch: {close_braces - open_braces} more close braces.")
else:
    print("Braces are balanced.")
