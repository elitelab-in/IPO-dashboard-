import re
import os

# 1. Strip market-status.js
with open('market-status.js', 'r', encoding='utf-8') as f:
    ms_js = f.read()

# Remove the desktop Admin link block
ms_js = re.sub(r'if \(data\.user && data\.user\.is_admin && data\.user\.email === \'elitelab\.in@gmail\.com\'\) \{[^{}]*const adminLink = document\.createElement[^{}]*nav\.insertBefore\(adminLink, mobileMenuBtn\);\s*\}', '', ms_js, flags=re.DOTALL)

# Remove the mobile Admin link block
ms_js = re.sub(r'if \(data\.user && data\.user\.is_admin && data\.user\.email === \'elitelab\.in@gmail\.com\'\) \{[^{}]*const adminLink = document\.createElement[^{}]*nav\.appendChild\(adminLink\);\s*\}', '', ms_js, flags=re.DOTALL)

with open('market-status.js', 'w', encoding='utf-8') as f:
    f.write(ms_js)

# 2. Strip server.py
with open('server.py', 'r', encoding='utf-8') as f:
    py = f.read()

# Remove admin_required decorator (lines 273-290 roughly)
py = re.sub(r'def admin_required\(f\):.*?return decorated_function\n+', '', py, flags=re.DOTALL)

# Remove @app.route('/admin')
py = re.sub(r'@app\.route\(\'/admin\'\).*?def admin_page\(\):.*?return send_from_directory.*?\.html\'\)\n+', '', py, flags=re.DOTALL)

# Remove all /api/admin/ endpoints
py = re.sub(r'@app\.route\(\'/api/admin/.*?(?=\n@app\.route|\Z)', '', py, flags=re.DOTALL)

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(py)

print("Stripped all admin logic.")
