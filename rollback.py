import os

def revert_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Revert ? parameters (Warning: this is dangerous if %s is used elsewhere, but in our SQL it's safe)
    # Actually, we need to be careful with string formatting in python.
    # In python, %s is also used for string formatting.
    # We should only replace %s if it looks like a SQL query.
    # Fortunately, the user only has a few SQL queries. Let's do it safely by finding lines with execute and %s.
    
    lines = content.split('\n')
    new_lines = []
    
    in_db_wrapper = False
    
    for i, line in enumerate(lines):
        # Remove DBWrapper block
        if "class DBWrapper:" in line:
            in_db_wrapper = True
            continue
        if in_db_wrapper:
            if "def get_db_connection():" in line:
                in_db_wrapper = False
                # Re-inject the old logic
                new_lines.append("DB_PATH = os.path.join(os.path.dirname(__file__), 'elitelab.db')")
                new_lines.append("")
                new_lines.append("def get_db_connection():")
                new_lines.append("    conn = sqlite3.connect(DB_PATH)")
                new_lines.append("    conn.row_factory = sqlite3.Row")
                new_lines.append("    return conn")
            continue
            
        # If we see the Postgres connection string in get_db_connection (if it wasn't caught by DBWrapper block)
        if "conn = psycopg2.connect(" in line and "def get_db_connection()" not in line:
            # Skip if it's standalone, but we handled it above if it was in get_db_connection
            pass
            
        # Replace psycopg2 imports
        if "import psycopg2" in line:
            if "sqlite3" not in "\n".join(new_lines):
                new_lines.append("import sqlite3")
            continue
        if "import psycopg2.extras" in line:
            continue
        if "DATABASE_URL = " in line and "postgresql://" in line:
            continue
            
        # Replace execute chaining back to conn.execute if we changed it
        # Actually I changed some cursor.execute back to conn.execute. Let's leave them, conn.execute works in sqlite!
        
        # Replace %s with ? in execute lines
        if 'execute' in line or 'SELECT' in line or 'INSERT' in line or 'UPDATE' in line or 'DELETE' in line:
            if '%s' in line and not ('%' in line and line.count('%') > line.count('%s')):
                # It's an SQL query with %s
                line = line.replace('%s', '?')
                
        # Schema replacements
        if 'SERIAL PRIMARY KEY' in line:
            line = line.replace('SERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT')
            
        new_lines.append(line)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))

revert_file('server.py')
revert_file('schema.py')
revert_file('clean_db.py')

print('Rollback script completed.')
