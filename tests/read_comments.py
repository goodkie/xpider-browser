import subprocess
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

res = subprocess.run(['gh', 'issue', 'view', '8', '-R', 'goodkie/v-show', '--json', 'comments'], capture_output=True, text=True, encoding='utf-8')
data = json.loads(res.stdout)
comments = data['comments']
print(f"Total comments: {len(comments)}")
for i, c in enumerate(comments[-5:], start=max(0, len(comments)-5)):
    first_line = c['body'].splitlines()[0] if c['body'].splitlines() else ""
    second_line = c['body'].splitlines()[1] if len(c['body'].splitlines()) > 1 else ""
    print(f"[{i}] {c['author']['login']} @ {c['createdAt']}")
    print(f"    Line 1: {first_line}")
    print(f"    Line 2: {second_line}\n")
    if i == len(comments) - 1:
        print("=== LATEST COMMENT FULL BODY ===")
        print(c['body'])
        print("================================")

