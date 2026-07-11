import psycopg2
import psycopg2.extras
import os

DATABASE_URL = 'postgresql://neondb_owner:npg_qbMV89YOCzNA@ep-floral-heart-adgrnp7q.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
os.environ['DATABASE_URL'] = DATABASE_URL

from server import get_db_connection

conn = get_db_connection()
try:
    total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    active_subs = conn.execute("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'").fetchone()[0]
    expired_subs = conn.execute("SELECT COUNT(*) FROM subscriptions WHERE status != 'active'").fetchone()[0]
    revenue = conn.execute("SELECT SUM(amount) FROM payments WHERE status = 'success'").fetchone()[0]
    recent = conn.execute('''
        SELECT p.amount, p.transaction_id, p.created_at, u.name, u.email 
        FROM payments p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC LIMIT 5
    ''').fetchall()
    print("Success!")
except Exception as e:
    print("Error:", e)
conn.close()
