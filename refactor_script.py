import re
import os

with open('server.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Separate imports/globals from the rest of the code by finding the first @app.route
parts = re.split(r'\n(?=@app\.route)', code, maxsplit=1)
if len(parts) == 2:
    header = parts[0]
    routes_block = parts[1]
else:
    header = code
    routes_block = ""

# Find all route blocks
route_blocks = re.findall(r'(@app\.route.*?)(?=\n@app\.route|\Z)', '\n' + routes_block, flags=re.DOTALL)

views_routes = []
api_routes = []

for block in route_blocks:
    if "send_from_directory" in block and ".html" in block:
        views_routes.append(block.strip())
    else:
        api_routes.append(block.strip())

# Create views.py
views_code = "from flask import Blueprint, send_from_directory\nimport os\n\nviews_bp = Blueprint('views', __name__)\n\n"
for route in views_routes:
    route = route.replace("@app.route", "@views_bp.route")
    route = route.replace("send_from_directory('.',", "send_from_directory(os.path.join(os.path.dirname(__file__), '../../frontend/pages'),")
    views_code += route + "\n\n"

# Create api.py
api_code = "from flask import Blueprint, jsonify, request, session\n# Import necessary models/services here...\n\napi_bp = Blueprint('api', __name__)\n\n"
for route in api_routes:
    route = route.replace("@app.route", "@api_bp.route")
    api_code += route + "\n\n"

with open('backend/routes/views.py', 'w', encoding='utf-8') as f:
    f.write(views_code)

print(f"Extracted {len(views_routes)} view routes.")
print(f"Extracted {len(api_routes)} api routes (not written yet to avoid breaking dependencies).")
