import re
import os

with open('server.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Separate imports/globals from the rest of the code
parts = re.split(r'\n(?=@app\.route)', code, maxsplit=1)
header = parts[0]
routes_block = parts[1] if len(parts) > 1 else ""

# Find all route blocks
route_blocks = re.findall(r'(@app\.route.*?)(?=\n@app\.route|\Z)', '\n' + routes_block, flags=re.DOTALL)

views_routes = []
api_routes = []
for block in route_blocks:
    if "send_from_directory" in block and ".html" in block:
        views_routes.append(block.strip())
    else:
        api_routes.append(block.strip())

# Create backend/app.py
# We will keep the 'header' in app.py to preserve all functions and imports, 
# and just register the Blueprints! This guarantees we don't break complex dependencies.
# Wait, if we keep the header in app.py, the Blueprints (api.py) won't have access to those functions unless they import from app.py, which causes circular imports.

# Let's extract the functions from header:
functions = re.findall(r'def .*?:\n(?:    .*?\n)*', header)
