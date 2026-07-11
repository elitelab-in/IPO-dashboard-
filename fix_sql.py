with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('%s', '?')

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed all %s to ? in server.py")
