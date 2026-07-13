import re

with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Just check the total number of lines
print(f"Total lines in server.py: {len(content.splitlines())}")

# Let's check how HTML pages are served
views = re.findall(r'@app\.route\(''(?:/[a-z-]*)''\)\n(?:def [a-zA-Z_]+\(\):\n    return send_from_directory\(''\.'', ''[a-zA-Z0-9-]+\.html''\))', content)
print(f"Found {len(views)} standard HTML view routes")
