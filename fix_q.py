import re
with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace specific lines
lines_to_replace = [
    "WHERE s.user_id = ? AND s.status = 'active'",
    "VALUES (?, ?, ?, ?)",
    "VALUES (?, ?, ?, ?, 'active')",
    "VALUES (?, ?, 'Razorpay', ?, 'success')",
    "VALUES (?, ?, ?, ?, ?, ?, 'active')",
    "WHERE p.user_id = ?",
    "SET plan_name = ?, price = ?, duration_days = ?, features = ?",
    "WHERE id = ?"
]

for old in lines_to_replace:
    new = old.replace('?', '%s')
    content = content.replace(old, new)

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed remaining ?')
