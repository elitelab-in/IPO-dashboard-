import re
import os

with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all occurrences of send_from_directory('.', '...html')
views = re.findall(r'@app\.route\(''(.*?)''\)\n(?:@.*?\n)?def (.*?)\(\):\n\s*return send_from_directory\(''\.'',\s*''(.*?)''\)', content)
for v in views:
    print(v)
