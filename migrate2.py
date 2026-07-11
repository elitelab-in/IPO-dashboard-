import os

def migrate_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace sqlite3 imports
    content = content.replace('import sqlite3', 'import psycopg2\nimport psycopg2.extras\nimport os')
    
    # Replace get_db_connection logic if it exists
    content = content.replace("sqlite3.connect(DB_PATH)", "psycopg2.connect(os.environ.get('DATABASE_URL', 'postgresql://neondb_owner:npg_qbMV89YOCzNA@ep-floral-heart-adgrnp7q.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'), cursor_factory=psycopg2.extras.DictCursor)")
    
    # Replace AUTOINCREMENT with SERIAL for Postgres
    content = content.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY')
    
    # Replace ? with %s for queries in the file
    lines = content.split('\n')
    new_lines = []
    for line in lines:
        if 'execute' in line or 'SELECT' in line or 'INSERT' in line or 'UPDATE' in line or 'DELETE' in line:
            if '?' in line and 'url' not in line.lower() and 'http' not in line.lower():
                line = line.replace('?', '%s')
        new_lines.append(line)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))

migrate_file('schema.py')
migrate_file('clean_db.py')

print('Migrated schema.py and clean_db.py')
