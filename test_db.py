import sqlite3
conn = sqlite3.connect('elitelab.db')
cursor = conn.cursor()
cursor.execute("SELECT id, email FROM users LIMIT 1")
user = cursor.fetchone()
print(user)
conn.close()
