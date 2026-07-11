import re

with open('server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if 'execute' in line or 'SELECT' in line or 'INSERT' in line or 'UPDATE' in line or 'DELETE' in line:
        if '?' in line and 'url' not in line.lower() and 'http' not in line.lower():
            # Replace all occurrences of ? with %s
            line = line.replace('?', '%s')
    new_lines.append(line)

with open('server.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Replaced ? with %s in server.py')
