import psycopg2
import psycopg2.extras

DATABASE_URL = 'postgresql://neondb_owner:npg_qbMV89YOCzNA@ep-floral-heart-adgrnp7q.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
cursor = conn.cursor()
cursor.execute('SELECT * FROM users')
users = cursor.fetchall()
for u in users:
    print(dict(u))
conn.close()
