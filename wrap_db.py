import re

with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

wrapper_code = '''
class DBWrapper:
    def __init__(self, conn):
        self.conn = conn

    def cursor(self):
        return self.conn.cursor()

    def execute(self, query, vars=None):
        cursor = self.conn.cursor()
        cursor.execute(query, vars)
        return cursor

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
    return DBWrapper(conn)
'''

old_func = '''def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.DictCursor)
    return conn'''

if old_func in content:
    content = content.replace(old_func, wrapper_code)
    with open('server.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced get_db_connection with wrapper.")
else:
    print("Could not find old function to replace.")
