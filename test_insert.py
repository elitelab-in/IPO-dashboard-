import sqlite3
import os

db_path = os.path.join('backend', 'database', 'elitelab.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
try:
    cursor.execute('''
        INSERT INTO users (name, email, password_hash, google_id, auth_provider, is_admin, email_verified)
        VALUES (?, ?, 'oauth', ?, 'google', ?, 1)
    ''', ('Test Google', 'testgoogle@example.com', 'test-google-id', 0))
    conn.commit()
    print("Insert success")
except Exception as e:
    print("Insert error:", e)
conn.close()
