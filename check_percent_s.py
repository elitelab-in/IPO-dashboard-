with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all occurrences of %s with ? except in python string formatting like %s
# Actually, in server.py, there are NO legitimate python %s string formattings, they all use f-strings or .format()!
# Let's verify if there are any legit %s string formattings.
import re

lines = content.split('\n')
for i, line in enumerate(lines):
    if '%s' in line:
        if 'execute' not in line and 'SELECT' not in line and 'INSERT' not in line and 'UPDATE' not in line and 'DELETE' not in line:
            print(f"Line {i+1}: {line}")
