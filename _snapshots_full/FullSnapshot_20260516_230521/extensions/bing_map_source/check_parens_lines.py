import sys

def check_parens_per_line(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    balance = 0
    for i, line in enumerate(lines):
        line_num = i + 1
        # Simple count (might be inside strings/comments, but should give a clue)
        open_p = line.count('(')
        close_p = line.count(')')
        balance += (open_p - close_p)
        if open_p != 0 or close_p != 0:
            # Only print if there's a change or if we want to see the balance
            if balance < 0: # This is a major red flag
                 print(f"Line {line_num}: Balance {balance} | {line.strip()}")

if __name__ == "__main__":
    check_parens_per_line('background.js')
