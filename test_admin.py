from server import get_db_connection

conn = get_db_connection()
user = conn.execute("SELECT is_admin FROM users WHERE id = %s", (1,)).fetchone()
print(user)
print(user['is_admin'])
print(type(user['is_admin']))
