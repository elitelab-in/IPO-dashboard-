import sys

file_path = "backend/app.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """    if ticker:
        try:
            # Fetch IPO listing details using maximum history with fresh ticker
                    open_val = float(first_row['Open'])"""

replacement = """    if ticker:
        try:
            # Fetch IPO listing details using maximum history with fresh ticker
            try:
                import yfinance as yf
                import requests
                yf_sym = f"{base_symbol}.NS" if "." not in base_symbol else base_symbol
                session = requests.Session()
                fresh_ticker = yf.Ticker(yf_sym, session=session)
                hist = fresh_ticker.history(period="max")
                if not hist.empty:
                    first_row = hist.iloc[0]
                    listing_date = hist.index[0].strftime("%d %b %Y")
                    listing_price = float(first_row['Open'])
                    
                    open_val = float(first_row['Open'])"""

content = content.replace(target, replacement)
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Replaced!")
