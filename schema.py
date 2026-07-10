import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), 'elitelab.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create Users Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email_verified INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Create Plans Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_name TEXT NOT NULL,
        price REAL NOT NULL,
        duration_days INTEGER NOT NULL,
        features TEXT NOT NULL, -- JSON formatted list of strings
        status TEXT NOT NULL DEFAULT 'active'
    )
    ''')
    
    # Create Payments Table (must exist before subscriptions for fk constraint)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_gateway TEXT NOT NULL DEFAULT 'Razorpay',
        transaction_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'success',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')
    
    # Create Subscriptions Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        plan_id INTEGER NOT NULL,
        payment_id INTEGER,
        order_id TEXT,
        start_date TIMESTAMP NOT NULL,
        expiry_date TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(plan_id) REFERENCES plans(id),
        FOREIGN KEY(payment_id) REFERENCES payments(id)
    )
    ''')
    
    # Clear plans to update them with new structures
    cursor.execute("DELETE FROM plans")
    
    initial_plans = [
        (
            "Free Plan", 
            0.0, 
            36500, # ~100 years
            json.dumps(["Economy Analyser Features", "Daily Sentiment Analysis", "Market Breadth Tickers"]), 
            "active"
        ),
        (
            "Elite Monthly", 
            299.0, 
            30, 
            json.dumps(["Economy Analyser", "Sector Analysis", "Fundamental Analysis", "Standard Filters"]), 
            "active"
        ),
        (
            "Elite Pro Monthly", 
            500.0, 
            30, 
            json.dumps(["AI Scanner (Intraday + Swing)", "Sector Analysis", "Fundamental Analysis", "Economy Analyser", "Unlimited Usage", "Priority Support"]), 
            "active"
        ),
        (
            "Elite Yearly", 
            3500.0, 
            365, 
            json.dumps(["Economy Analyser", "Sector Analysis", "Fundamental Analysis", "Standard Filters", "Discounted Price"]), 
            "active"
        ),
        (
            "Elite Pro Yearly", 
            5000.0, 
            365, 
            json.dumps(["AI Scanner (Intraday + Swing)", "Sector Analysis", "Fundamental Analysis", "Economy Analyser", "Unlimited Usage", "Priority Support", "Super Saver Yearly"]), 
            "active"
        )
    ]
    cursor.executemany('''
        INSERT INTO plans (plan_name, price, duration_days, features, status)
        VALUES (?, ?, ?, ?, ?)
    ''', initial_plans)
    print("[Database] Seeded new default subscription plans.")
        
    conn.commit()
    conn.close()
    print("[Database] SQLite database initialized successfully.")

if __name__ == '__main__':
    init_db()
