import subprocess
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

res = subprocess.run(['gh', 'issue', 'view', '1', '-R', 'goodkie/xpider-browser', '--json', 'comments'], capture_output=True, text=True, encoding='utf-8')
data = json.loads(res.stdout)
for i, c in enumerate(data['comments']):
    first_line = c['body'].splitlines()[0] if c['body'].splitlines() else ""
    print(f"[{i}] {c['author']['login']} @ {c['createdAt']}")
    print(f"    {first_line}\n")
