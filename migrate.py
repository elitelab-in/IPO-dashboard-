import sqlite3
import os

db_path = os.path.join('backend', 'database', 'elitelab.db')
try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Add new columns if they don't exist
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN google_id TEXT")
    except sqlite3.OperationalError:
        print("Column google_id already exists.")
    
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'")
    except sqlite3.OperationalError:
        print("Column auth_provider already exists.")
        
    conn.commit()
    conn.close()
    print("Migration successful.")
except Exception as e:
    print("Error:", e)
