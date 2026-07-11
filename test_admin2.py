import psycopg2
import psycopg2.extras
import os

DATABASE_URL = 'postgresql://neondb_owner:npg_qbMV89YOCzNA@ep-floral-heart-adgrnp7q.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
os.environ['DATABASE_URL'] = DATABASE_URL

from server import get_db_connection

conn = get_db_connection()
user = conn.execute("SELECT is_admin FROM users WHERE id = %s", (1,)).fetchone()
print("user:", user)
print("not user:", not user)
print("user['is_admin']:", user['is_admin'])
print("user['is_admin'] != 1:", user['is_admin'] != 1)
conn.close()
