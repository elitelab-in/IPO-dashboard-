import re
with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all ? not inside URLs or comments
for i, line in enumerate(content.split('\n')):
    if '?' in line and 'url' not in line.lower() and 'http' not in line.lower() and '#' not in line:
        print(f"Line {i+1}: {line.strip()}")
