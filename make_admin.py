import sqlite3
import os

db_path = os.path.join('backend', 'database', 'elitelab.db')
if not os.path.exists(db_path):
    # Try alternate location if backend/database doesn't exist
    if os.path.exists('elitelab.db'):
        db_path = 'elitelab.db'

def make_admin():
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_admin = 1 WHERE email = 'elitelab.in@gmail.com' OR email = 'elitelab.in@gmil.com'")
        conn.commit()
        if cursor.rowcount > 0:
            print("Successfully updated elitelab.in@gmail.com to Admin status!")
        else:
            print("Could not find an account with the email elitelab.in@gmail.com in the local database.")
        conn.close()
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    make_admin()
