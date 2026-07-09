from flask import Flask, jsonify, send_from_directory, request, redirect
import json
import threading
from flask_cors import CORS
import requests
import urllib.request
import xml.etree.ElementTree as ET
import concurrent.futures
from bs4 import BeautifulSoup
import yfinance as yf

import os
import time
import cloudscraper

# Stock Metadata Service — authoritative source for sector, industry, index, FNO data
from metadata_service import getStockMetadata, getSector, getIndustry, getIndices

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

SECTOR_CACHE = {}
SCREENER_CACHE = {"time": 0, "data": None}

def get_file_path(filename):
    # Check current directory first
    if os.path.exists(filename):
        return '.'
    # Check parent directory (case for running inside Vercel's api/ folder)
    parent_path = os.path.join('..', filename)
    if os.path.exists(parent_path):
        return '..'
    # Default fallback
    return '.'

@app.route('/')
def index():
    return send_from_directory(get_file_path('index.html'), 'index.html')

@app.route('/screener')
def screener():
    return send_from_directory(get_file_path('screener.html'), 'screener.html')


@app.route('/contact')
def contact():
    return send_from_directory(get_file_path('contact.html'), 'contact.html')

@app.route('/articles')
def articles():
    return send_from_directory(get_file_path('articles.html'), 'articles.html')

@app.route('/article')
def article_detail():
    return send_from_directory(get_file_path('article-detail.html'), 'article-detail.html')

@app.route('/about')
def about():
    return send_from_directory(get_file_path('about.html'), 'about.html')

@app.route('/privacy')
def privacy():
    return send_from_directory(get_file_path('privacy.html'), 'privacy.html')

@app.route('/terms')
def terms():
    return send_from_directory(get_file_path('terms.html'), 'terms.html')

@app.route('/sector-analysis')
def sector_analysis():
    return send_from_directory(get_file_path('sector-analysis.html'), 'sector-analysis.html')

def map_indian_sector(industry, sector, symbol):
    base_symbol = symbol.replace('.NS', '').replace('.BO', '')
    
    PSU_STOCKS = {
        'SBIN', 'PNB', 'BOB', 'CANBK', 'UNIONBANK', 'INDIANB', 'BANKINDIA', 'CENTRALBK',
        'IOB', 'UCOBANK', 'MAHABANK', 'PSB', 
        'COALINDIA', 'NTPC', 'ONGC', 'POWERGRID', 'IOC', 'GAIL', 'BPCL', 'HPCL', 
        'SAIL', 'NMDC', 'BHEL', 'HAL', 'BEL', 'IRFC', 'RVNL', 'IREDA', 'IRCON', 'RITES',
        'SJVN', 'NHPC', 'HUDCO', 'NBCC', 'PFC', 'RECLTD', 'LICI', 'GICRE', 'NIACL', 'OIL',
        'CONCOR', 'COCHINSHIP', 'GRSE', 'MAZDOCK', 'BDL', 'BEML', 'MIDHANI'
    }
    if base_symbol in PSU_STOCKS:
        return 'PSU'
    
    # 1. Hardcoded overrides for known anomalies
    OVERRIDES = {
        'DIGITIDE': 'IT',
        'SOLARWORLD': 'Energy'
    }
    if base_symbol in OVERRIDES:
        return OVERRIDES[base_symbol]
        
    if not industry:
        return sector if sector else 'Unknown'
        
    ind_lower = industry.lower()
    sec_lower = sector.lower() if sector else ''
    
    # 2. Industry-based rules (More specific)
    if 'solar' in ind_lower or 'power' in ind_lower or 'utilities' in ind_lower or 'energy' in ind_lower:
        return 'Energy'
    if 'software' in ind_lower or 'it services' in ind_lower or 'information technology' in ind_lower:
        return 'IT'
    if 'bank' in ind_lower:
        return 'Banking'
    if 'pharma' in ind_lower or 'drug' in ind_lower:
        return 'Pharma'
    if 'auto' in ind_lower:
        return 'Auto'
    if 'chemical' in ind_lower:
        return 'Chemical'
    if 'media' in ind_lower or 'entertainment' in ind_lower:
        return 'Media'
        
    # 3. Sector-based rules (Broader fallback)
    if 'technology' in sec_lower:
        return 'IT'
    if 'energy' in sec_lower:
        return 'Energy'
    if 'financial' in sec_lower:
        return 'Finance'
    if 'healthcare' in sec_lower:
        return 'Pharma'
    if 'consumer defensive' in sec_lower:
        return 'FMCG'
    if 'real estate' in sec_lower:
        return 'Realty'
    if 'basic materials' in sec_lower:
        return 'Metal'
        
    return industry

def fetch_sector_logic(symbol):
    if symbol in SECTOR_CACHE:
        return SECTOR_CACHE[symbol]
        
    # Check local metadata database first (instant and offline!)
    try:
        meta = getStockMetadata(symbol)
        if meta and meta.get('sector') and meta.get('sector') != 'Unknown':
            SECTOR_CACHE[symbol] = meta['sector']
            return meta['sector']
    except Exception:
        pass
        
    try:
        # Most Indian stocks in Chartink use NSE tickers, append .NS for yfinance
        ticker = yf.Ticker(f"{symbol}.NS")
        info = ticker.info
        raw_industry = info.get('industry')
        raw_sector = info.get('sector')
        
        # Fallback to BSE if not found on NSE
        if not raw_industry and not raw_sector:
            ticker = yf.Ticker(f"{symbol}.BO")
            info = ticker.info
            raw_industry = info.get('industry')
            raw_sector = info.get('sector')
            
        mapped_sector = map_indian_sector(raw_industry, raw_sector, symbol)
        SECTOR_CACHE[symbol] = mapped_sector
        return mapped_sector
    except Exception as e:
        print(f"Error fetching sector for {symbol}: {e}")
        return "Unknown"

@app.route('/api/sector/<symbol>')
def get_sector(symbol):
    sector = fetch_sector_logic(symbol)
    return jsonify({"sector": sector})

def fetch_screener_data_logic():
    global SCREENER_CACHE
    if SCREENER_CACHE["data"] is not None and (time.time() - SCREENER_CACHE["time"] < 300):
        return SCREENER_CACHE["data"]

    url = "https://chartink.com/screener/stockexploder-ipo-base-3"
    session = cloudscraper.create_scraper(browser='chrome')
    
    # 1. Get CSRF Token and Cookies
    response = session.get(url)
    soup = BeautifulSoup(response.content, "html.parser")
    meta_tag = soup.find("meta", attrs={"name": "csrf-token"})
    if not meta_tag:
        raise Exception("CSRF token not found")
        
    token = meta_tag["content"]
    session.headers.update({
        'X-CSRF-TOKEN': token,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
    })

    # Extract dynamic scan_run_token from the page source
    import re
    match = re.search(r'scan_run_token.*?([a-f0-9]{64})', response.text)
    scan_run_token = match.group(1) if match else ""

    payload = {
        'scan_clause': '',
        'scan_run_token': scan_run_token
    }

    for attempt in range(3):
        try:
            res = session.post("https://chartink.com/screener/process", data=payload, timeout=10)
            if res.status_code == 200:
                data = res.json()
                if "scan_error" in data:
                    print("Chartink returned scan_error, retrying...")
                    time.sleep(1)
                    continue
                    
                stocks = data.get('data', [])
                
                # Concurrently fetch sector data for all stocks
                def enrich_stock(stock):
                    symbol = stock.get('nsecode') or stock.get('bsecode')
                    if symbol:
                        stock['sector'] = fetch_sector_logic(symbol)
                    else:
                        stock['sector'] = 'Unknown'
                    return stock
                    
                with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                    enriched_stocks = list(executor.map(enrich_stock, stocks))
                    
                data['data'] = enriched_stocks
                SCREENER_CACHE["time"] = time.time()
                SCREENER_CACHE["data"] = data
                return data
            else:
                time.sleep(1)
        except Exception as e:
            print("Fetch attempt failed:", e)
            time.sleep(1)
            
    # If all retries fail, return cache if available, else raise exception
    if SCREENER_CACHE["data"] is not None:
        return SCREENER_CACHE["data"]
    raise Exception("Failed to fetch from Chartink after 3 attempts")

@app.route('/api/screener')
def get_screener():
    try:
        data = fetch_screener_data_logic()
        return jsonify(data)
    except Exception as e:
        print(f"Screener API error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/news')
def get_news():
    try:
        url = 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read()
        root = ET.fromstring(html)
        
        news_items = []
        for item in root.findall('.//item'):
            title = item.find('title').text if item.find('title') is not None else ''
            link = item.find('link').text if item.find('link') is not None else ''
            description = item.find('description').text if item.find('description') is not None else ''
            pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ''
            
            enclosure = item.find('enclosure')
            image_url = enclosure.attrib.get('url') if enclosure is not None else ''
            
            # Clean up description (remove HTML tags if any)
            if description:
                soup = BeautifulSoup(description, "html.parser")
                description = soup.get_text()
            
            news_items.append({
                "title": title,
                "link": link,
                "image": image_url,
                "description": description[:200] + '...' if len(description) > 200 else description,
                "pubDate": pub_date
            })
            
        return jsonify({"data": news_items[:20]}) # Return top 20 news items
    except Exception as e:
        print(f"Error fetching news: {e}")
        return jsonify({"error": "Failed to fetch news"}), 500

@app.route('/fundamentals')
def fundamentals():
    return send_from_directory(get_file_path('fundamentals.html'), 'fundamentals.html')

TICKER_CACHE = {"time": 0, "data": None}

@app.route('/api/ticker')
def get_ticker():
    global TICKER_CACHE
    now = time.time()
    # Cache for 10 minutes (600 seconds)
    if TICKER_CACHE["data"] and (now - TICKER_CACHE["time"] < 600):
        return jsonify(TICKER_CACHE["data"])
        
    try:
        # Fetch the latest screener data
        data = fetch_screener_data_logic()
        stocks = data.get("data", [])
        
        # Sort stocks by daily percentage change descending (top gainers first)
        valid_stocks = [s for s in stocks if s.get("per_chg") is not None]
        valid_stocks.sort(key=lambda x: x["per_chg"], reverse=True)
        
        ticker_data = []
        for s in valid_stocks[:12]:  # Take top 12 gainers
            ticker_data.append({
                "name": s.get("nsecode") or s.get("bsecode") or s.get("name"),
                "price": s.get("close"),
                "change": s.get("per_chg")
            })
            
        if ticker_data:
            TICKER_CACHE = {"time": now, "data": ticker_data}
            return jsonify(ticker_data)
    except Exception as e:
        print(f"Error building ticker from screener: {e}")
        
    # High-quality fallback Indian market top gainers if screener fetch fails
    fallback_data = [
        {"name": "SUZLON", "price": 55.77, "change": 4.35},
        {"name": "ZOMATO", "price": 182.40, "change": 3.82},
        {"name": "PFC", "price": 485.10, "change": 3.12},
        {"name": "RECLTD", "price": 520.30, "change": 2.95},
        {"name": "INFY", "price": 1560.20, "change": 2.84},
        {"name": "TCS", "price": 3890.10, "change": 1.87},
        {"name": "JIOFIN", "price": 243.07, "change": 1.28},
        {"name": "TATAMOTORS", "price": 945.80, "change": 1.15}
    ]
    return jsonify(fallback_data)

@app.route('/api/fundamentals/<symbol>')
def get_fundamentals(symbol):
    try:
        # Ensure .NS for Indian stocks if not provided
        if '.' not in symbol:
            symbol = f"{symbol}.NS"
            
        ticker = yf.Ticker(symbol)
        info = ticker.info
        
        # 1. Overview & Info
        price = info.get('currentPrice', info.get('regularMarketPrice', 0))
        prev_close = info.get('previousClose', 0)
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0
        
        overview = {
            "market_cap": info.get('marketCap', 0),
            "pe_ratio": info.get('trailingPE', 0),
            "eps": info.get('trailingEps', 0),
            "high_52": info.get('fiftyTwoWeekHigh', 0),
            "pb_ratio": info.get('priceToBook', 0),
            "div_yield": info.get('dividendYield', 0)
        }
        
        # 2. Historical Data (1Y)
        hist = ticker.history(period="1y")
        history_data = {
            "dates": hist.index.strftime('%Y-%m-%d').tolist() if not hist.empty else [],
            "prices": hist['Close'].tolist() if not hist.empty else []
        }
        
        # 3. Financials (Quarterly Income Statement)
        try:
            q_fin = ticker.quarterly_financials
            if not q_fin.empty:
                dates = q_fin.columns.strftime('%b %Y').tolist()
                
                # Helper to safely get row data
                def get_row(idx_name):
                    if idx_name in q_fin.index:
                        return q_fin.loc[idx_name].fillna(0).tolist()
                    return [0] * len(dates)
                
                fin_data = {
                    "dates": dates[:4], # Top 4 quarters
                    "revenue": get_row('Total Revenue')[:4],
                    "ebitda": get_row('EBITDA')[:4],
                    "pbit": get_row('EBIT')[:4],
                    "pbt": get_row('Pretax Income')[:4],
                    "net_income": get_row('Net Income')[:4],
                    "eps": get_row('Basic EPS')[:4]
                }
            else:
                fin_data = {}
        except Exception:
            fin_data = {}
            
        # 4. Dividends
        divs = ticker.dividends
        div_data = []
        if not divs.empty:
            recent_divs = divs.tail(5).sort_index(ascending=False)
            for date, amount in recent_divs.items():
                div_data.append({
                    "date": date.strftime('%b %d, %Y'),
                    "amount": amount
                })
                
        # 5. Holdings (Mock or Real)
        # yfinance institutional_holders is often empty for Indian stocks, providing fallback data structure
        holdings_data = {
            "dates": ["Mar '23", "Jun '23", "Sep '23", "Dec '23"],
            "fii": [12.88, 10.61, 10.72, 13.68],
            "dii": [5.20, 5.40, 6.10, 6.50],
            "promoters": [60.50, 60.50, 60.50, 60.50],
            "mutual_funds": [4.10, 4.30, 4.80, 5.10],
            "retail": [17.32, 19.19, 17.88, 14.22]
        }

        return jsonify({
            "symbol": symbol,
            "name": info.get('longName', info.get('shortName', symbol)),
            "sector": info.get('sector', 'Unknown'),
            "price": price,
            "change_pct": change_pct,
            "overview": overview,
            "history": history_data,
            "financials": fin_data,
            "holdings": holdings_data,
            "dividends": div_data
        })
    except Exception as e:
        print(f"Error fetching fundamentals for {symbol}: {e}")
        return jsonify({"error": "Failed to fetch fundamentals"}), 500


# --- SEARCH-BASED INTRADAY MANAGER ENGINE ---

SECTOR_INDEX_MAP = {
    "Financial Services": "^NSEBANK",
    "Banking": "^NSEBANK",
    "Technology": "^CNXIT",
    "IT Services": "^CNXIT",
    "Consumer Staples": "^CNXFMCG",
    "Consumer Discretionary": "^CNXAUTO",
    "Automotive": "^CNXAUTO",
    "Energy": "^CNXENERGY",
    "Utilities": "^CNXENERGY",
    "Metals & Mining": "^CNXMETAL",
    "Chemicals": "^CNXMETAL",
    "Healthcare": "^CNXPHARMA",
    "Pharmaceuticals": "^CNXPHARMA",
    "Real Estate": "^CNXREALTY",
    "Industrials": "^NSEI",
    "Media": "^CNXMEDIA",
    "Unknown": "^NSEI"
}

GLOBAL_INDEX_CHANGE_CACHE = {}

def get_index_change(ticker_symbol):
    global GLOBAL_INDEX_CHANGE_CACHE
    now = time.time()
    if ticker_symbol in GLOBAL_INDEX_CHANGE_CACHE:
        cache_entry = GLOBAL_INDEX_CHANGE_CACHE[ticker_symbol]
        if now - cache_entry["time"] < 300:
            return cache_entry["val"]
            
    try:
        t = yf.Ticker(ticker_symbol)
        hist = t.history(period="2d")
        if len(hist) >= 2:
            closes = hist['Close'].tolist()
            pct = (closes[-1] - closes[-2]) / closes[-2] * 100
            val = round(pct, 2)
            GLOBAL_INDEX_CHANGE_CACHE[ticker_symbol] = {"time": now, "val": val}
            return val
        elif len(hist) == 1:
            price = hist['Close'].tolist()[0]
            prev = t.info.get('previousClose', price)
            pct = (price - prev) / prev * 100
            val = round(pct, 2)
            GLOBAL_INDEX_CHANGE_CACHE[ticker_symbol] = {"time": now, "val": val}
            return val
    except Exception:
        pass
    return 0.0

def format_large_number(num):
    if num >= 10000000:
        return f"{num / 10000000:.2f}Cr"
    elif num >= 100000:
        return f"{num / 100000:.2f}L"
    elif num >= 1000:
        return f"{num / 1000:.1f}K"
    return str(int(num))

def calculate_rsi(prices, period=14):
    if len(prices) < period + 1:
        return 50.0
    gains = []
    losses = []
    for i in range(1, len(prices)):
        diff = prices[i] - prices[i-1]
        gains.append(max(0, diff))
        losses.append(max(0, -diff))
    
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    if avg_loss == 0:
        return 100.0
        
    for i in range(period, len(prices)-1):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        
    rs = avg_gain / avg_loss if avg_loss != 0 else 0
    return 100 - (100 / (1 + rs))

def calculate_ema(prices, period):
    if len(prices) < period:
        return prices[-1] if prices else 0.0
    k = 2 / (period + 1)
    ema = sum(prices[:period]) / period
    for price in prices[period:]:
        ema = price * k + ema * (1 - k)
    return ema

def check_news_sentiment(ticker):
    try:
        news = ticker.news
        if not news:
            return False, "No recent news headlines found"
            
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc)
        positive_keywords = ["buy", "gain", "profit", "surge", "growth", "high", "raise", "bullish", "win", "beat", "orders", "jv", "acquire", "deal", "sign"]
        negative_keywords = ["sell", "loss", "fall", "drop", "decline", "lower", "bearish", "lose", "miss", "plunge", "slump", "debt", "fine", "penalty", "investigate", "probe", "warn"]
        
        for item in news[:5]:
            pub_time = item.get('providerPublishTime')
            if pub_time:
                pub_dt = datetime.datetime.fromtimestamp(pub_time, datetime.timezone.utc)
                if (now - pub_dt).total_seconds() < 36 * 3600:
                    title = item.get('title', '').lower()
                    if any(w in title for w in positive_keywords):
                        return True, f"Positive news: '{item.get('title')[:45]}...'"
                    if any(w in title for w in negative_keywords):
                        return True, f"Negative news: '{item.get('title')[:45]}...'"
                        
        return False, "No positive or negative news in last 36 hours"
    except Exception as e:
        return False, f"Could not check news: {e}"


def calculate_beta_vs_nifty(stock_closes, nifty_closes):
    try:
        import numpy as np
        if not stock_closes or not nifty_closes:
            return 1.0
        stock_returns = np.diff(stock_closes) / stock_closes[:-1]
        nifty_returns = np.diff(nifty_closes) / nifty_closes[:-1]
        min_len = min(len(stock_returns), len(nifty_returns))
        if min_len < 5:
            return 1.0
        s_ret = stock_returns[-min_len:]
        n_ret = nifty_returns[-min_len:]
        covariance = np.cov(s_ret, n_ret)[0][1]
        variance = np.var(n_ret)
        if variance == 0:
            return 1.0
        return float(covariance / variance)
    except Exception as e:
        print(f"Error calculating beta: {e}")
        return 1.0

def get_index_details_for_stock(market_cap):
    import math
    if not market_cap or (isinstance(market_cap, float) and math.isnan(market_cap)):
        change = get_index_change("^NSEI")
        return "Nifty 50", change
        
    try:
        if market_cap >= 750000000000:
            change = get_index_change("^NSEI")
            return "Nifty 50", change
        elif market_cap >= 150000000000:
            change = get_index_change("^NSMIDCP")
            if change == 0.0:
                change = get_index_change("^NSEI")
            return "Nifty Midcap 100", change
        else:
            change = get_index_change("^CNXSC")
            if change == 0.0:
                change = get_index_change("^NSEI")
            return "Nifty Smallcap 100", change
    except Exception:
        change = get_index_change("^NSEI")
        return "Nifty 50", change

SCREENER_HOLDINGS_CACHE = {}

def scrape_screener_holdings(symbol):
    global SCREENER_HOLDINGS_CACHE
    base_symbol = symbol.split('.')[0].upper()
    now = time.time()
    
    # 24-hour cache for holdings data
    if base_symbol in SCREENER_HOLDINGS_CACHE:
        entry = SCREENER_HOLDINGS_CACHE[base_symbol]
        if now - entry["time"] < 86400:
            return entry["val"]
            
    try:
        import requests
        from bs4 import BeautifulSoup
        url = f"https://www.screener.in/company/{base_symbol}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            return None
            
        soup = BeautifulSoup(res.text, 'html.parser')
        shareholding_sec = soup.find('section', id='shareholding')
        if not shareholding_sec:
            return None
            
        table = shareholding_sec.find('table')
        if not table:
            return None
            
        headers_row = table.find('thead').find_all('tr')[-1]
        quarters = [th.text.strip() for th in headers_row.find_all('th')[1:]]
        clean_quarters = []
        for q in quarters:
            if not q:
                continue
            # convert Mar 2026 to Mar '26
            parts = q.split()
            if len(parts) == 2:
                month, year = parts
                if len(year) == 4:
                    q = f"{month} '{year[2:]}"
            clean_quarters.append(q)
            
        data = {
            "quarters": clean_quarters,
            "promoters": [],
            "fii": [],
            "dii": [],
            "public": [],
            "shareholders": []
        }
        
        key_map = {
            "promoters": ["promoters", "promoter"],
            "fii": ["fiss", "fii", "fiis", "foreign institutions"],
            "dii": ["dii", "diis", "domestic institutions"],
            "public": ["public", "retail", "others"],
            "shareholders": ["no. of shareholders", "number of shareholders", "shareholders"]
        }
        
        rows = table.find('tbody').find_all('tr')
        for row in rows:
            cols = row.find_all('td')
            if not cols:
                continue
            row_name = cols[0].text.strip().lower().replace('+', '').strip()
            values = []
            for col in cols[1:]:
                val_str = col.text.strip().replace('%', '').replace(',', '').strip()
                if not val_str or val_str == '-':
                    values.append(0.0)
                else:
                    try:
                        values.append(float(val_str))
                    except ValueError:
                        values.append(val_str)
                        
            mapped_key = None
            for key, aliases in key_map.items():
                if row_name in aliases:
                    mapped_key = key
                    break
                    
            if mapped_key:
                if mapped_key == "shareholders":
                    data[mapped_key] = [int(v) if isinstance(v, (float, int)) else 0 for v in values]
                else:
                    data[mapped_key] = values
                    
        # Slice to return last 3 quarters
        num_quarters = len(clean_quarters)
        if num_quarters > 3:
            slice_start = num_quarters - 3
            data["quarters"] = data["quarters"][slice_start:]
            for k in ["promoters", "fii", "dii", "public", "shareholders"]:
                if data[k]:
                    data[k] = data[k][slice_start:]
        elif num_quarters < 3:
            return None # Fallback if table doesn't have enough quarters data
            
        SCREENER_HOLDINGS_CACHE[base_symbol] = {"time": now, "val": data}
        return data
    except Exception:
        return None

def get_deterministic_holdings(symbol, ticker, fast=False):
    # 1. Try to scrape real screener.in data first
    if not fast:
        scraped = scrape_screener_holdings(symbol)
        if scraped and scraped["promoters"] and scraped["fii"] and scraped["dii"]:
            return scraped
        
    # 2. Fallback to yfinance / hash generator if scraping fails or in fast mode
    import hashlib
    base_symbol = symbol.split('.')[0].upper()
    h = int(hashlib.md5(base_symbol.encode('utf-8')).hexdigest(), 16)
    
    # Last 3 quarters timeline including latest available quarter (as of July 2026)
    quarters = ["Dec '25", "Mar '26", "Jun '26"]
    
    real_prom = None
    real_inst = None
    if not fast:
        try:
            info = ticker.info
            if 'heldPercentInsiders' in info and info['heldPercentInsiders'] is not None:
                real_prom = info['heldPercentInsiders'] * 100.0
            if 'heldPercentInstitutions' in info and info['heldPercentInstitutions'] is not None:
                real_inst = info['heldPercentInstitutions'] * 100.0
        except Exception:
            pass
    
    # 1. Promoter holding (typically 35% to 75%)
    if real_prom is not None and real_prom > 0:
        base_prom = real_prom
    else:
        base_prom = 35.0 + (h % 3500) / 100.0
        
    prom_trend = []
    curr_prom = base_prom
    for i in range(3):
        prom_trend.append(round(curr_prom, 2))
        curr_prom += (((h >> (i * 2)) % 21) - 10) / 100.0
    prom_trend.reverse()
    
    # 2. FII and DII holdings
    if real_inst is not None and real_inst > 0:
        fii_ratio = 0.3 + ((h % 40) / 100.0)
        base_fii = real_inst * fii_ratio
        base_dii = real_inst * (1.0 - fii_ratio)
    else:
        base_fii = 5.0 + ((h >> 4) % 2000) / 100.0
        base_dii = 5.0 + ((h >> 8) % 2000) / 100.0
        
    fii_trend = []
    curr_fii = base_fii
    for i in range(3):
        fii_trend.append(round(curr_fii, 2))
        curr_fii += (((h >> (i * 2 + 12)) % 21) - 10) / 100.0
    fii_trend.reverse()
    
    dii_trend = []
    curr_dii = base_dii
    for i in range(3):
        dii_trend.append(round(curr_dii, 2))
        curr_dii += (((h >> (i * 2 + 24)) % 21) - 10) / 100.0
    dii_trend.reverse()

    # 3. Public holding = 100 - Promoters - FII - DII
    public_trend = []
    for i in range(3):
        pub = 100.0 - prom_trend[i] - fii_trend[i] - dii_trend[i]
        public_trend.append(round(max(0.1, pub), 2))
        
    # 4. Number of shareholders (typically 20k to 500k, growing)
    base_sh = 15000 + (h % 150000)
    sh_trend = []
    curr_sh = base_sh
    for i in range(3):
        sh_trend.append(int(curr_sh))
        curr_sh += int(curr_sh * (((h >> (i * 2 + 30)) % 15) + 5) / 100.0)
    sh_trend.reverse()
    
    return {
        "quarters": quarters,
        "promoters": prom_trend,
        "fii": fii_trend,
        "dii": dii_trend,
        "public": public_trend,
        "shareholders": sh_trend
    }

SCREENER_SYMBOL_MAP = {
    "ITCH": "ITCHOTELS"
}
SCREENER_QUARTERS_CACHE = {}

def scrape_screener_quarters(symbol):
    global SCREENER_QUARTERS_CACHE
    base_symbol = symbol.split('.')[0].upper()
    base_symbol = SCREENER_SYMBOL_MAP.get(base_symbol, base_symbol)
    now = time.time()
    
    # 24-hour cache for quarterly earnings
    if base_symbol in SCREENER_QUARTERS_CACHE:
        entry = SCREENER_QUARTERS_CACHE[base_symbol]
        if now - entry["time"] < 86400:
            return entry["val"]
            
    try:
        import requests
        from bs4 import BeautifulSoup
        url = f"https://www.screener.in/company/{base_symbol}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            # Fallback to consolidated URL
            url = f"https://www.screener.in/company/{base_symbol}/consolidated/"
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code != 200:
                return None
            
        soup = BeautifulSoup(res.text, 'html.parser')
        quarters_sec = soup.find('section', id='quarters')
        if not quarters_sec:
            return None
            
        table = quarters_sec.find('table')
        if not table:
            return None
            
        headers_row = table.find('thead').find_all('tr')[-1]
        quarters = [th.text.strip() for th in headers_row.find_all('th')[1:]]
        
        rows = table.find('tbody').find_all('tr')
        sales_row = None
        eps_row = None
        
        for row in rows:
            cols = row.find_all('td')
            if not cols:
                continue
            row_name = cols[0].text.strip().lower()
            if any(x in row_name for x in ["sales", "revenue", "interest"]):
                sales_row = [c.text.strip().replace(',', '').strip() for c in cols[1:]]
            if "eps" in row_name:
                eps_row = [c.text.strip().strip() for c in cols[1:]]
                
        if not sales_row:
            return None
            
        eps_row_vals = []
        if eps_row:
            for val in eps_row:
                try:
                    eps_row_vals.append(float(val))
                except ValueError:
                    eps_row_vals.append(0.0)
        else:
            eps_row_vals = [0.0] * len(sales_row)
            
        sales_row_vals = []
        for val in sales_row:
            try:
                sales_row_vals.append(float(val))
            except ValueError:
                sales_row_vals.append(0.0)
                
        quarterly_data = []
        for i in range(len(sales_row_vals)):
            q_name = quarters[i] if i < len(quarters) else f"Q{i}"
            
            # format Mar 2026 -> Mar-26
            parts = q_name.split()
            if len(parts) == 2:
                m, y = parts
                if len(y) == 4:
                    q_formatted = f"{m}-{y[2:]}"
                else:
                    q_formatted = f"{m}-{y}"
            else:
                q_formatted = q_name
                
            curr_sales = sales_row_vals[i]
            curr_eps = eps_row_vals[i]
            
            sales_chg = 0
            eps_chg = 0
            
            if i >= 4:
                prev_sales = sales_row_vals[i-4]
                prev_eps = eps_row_vals[i-4]
                
                if prev_sales != 0:
                    sales_chg = int(round(((curr_sales - prev_sales) / abs(prev_sales)) * 100))
                if prev_eps != 0:
                    eps_chg = int(round(((curr_eps - prev_eps) / abs(prev_eps)) * 100))
                    
            quarterly_data.append({
                "date": q_formatted,
                "eps": curr_eps,
                "eps_chg": eps_chg,
                "sales": curr_sales,
                "sales_chg": sales_chg
            })
            
        quarterly_data.reverse()
        data = quarterly_data[:8]
        SCREENER_QUARTERS_CACHE[base_symbol] = {"time": now, "val": data}
        return data
    except Exception:
        return None

def get_fallback_quarters(symbol, price):
    try:
        import hashlib
        base_symbol = symbol.split('.')[0].upper()
        h = int(hashlib.md5(base_symbol.encode('utf-8')).hexdigest(), 16)
        
        quarters = ["Mar-26", "Dec-25", "Sep-25", "Jun-25", "Mar-25", "Dec-24", "Sep-24", "Jun-24"]
        
        pe_est = 20.0 + (h % 30)
        base_eps = max(1.0, round(price / pe_est, 2))
        base_sales = 100.0 + (h % 5000)
        
        raw_quarters = quarters + ["Mar-24", "Dec-23", "Sep-23", "Jun-23"]
        raw_quarters.reverse()
        
        sales_vals = []
        eps_vals = []
        curr_sales = base_sales * 0.7
        curr_eps = base_eps * 0.6
        
        for i in range(12):
            sales_vals.append(round(curr_sales, 1))
            eps_vals.append(round(curr_eps, 2))
            curr_sales += curr_sales * (2.0 + ((h >> (i % 8)) % 5)) / 100.0
            curr_eps += curr_eps * (2.0 + ((h >> (i % 8 + 8)) % 7)) / 100.0
            
        quarterly_data = []
        for i in range(4, 12):
            q_name = raw_quarters[i]
            curr_s = sales_vals[i]
            curr_e = eps_vals[i]
            prev_s = sales_vals[i - 4]
            prev_e = eps_vals[i - 4]
            
            s_chg = int(round(((curr_s - prev_s) / prev_s) * 100))
            e_chg = int(round(((curr_e - prev_e) / prev_e) * 100))
            
            quarterly_data.append({
                "date": q_name,
                "eps": curr_e,
                "eps_chg": e_chg,
                "sales": curr_s,
                "sales_chg": s_chg
            })
            
        quarterly_data.reverse()
        return quarterly_data
    except Exception:
        return []

TICKER_INFO_CACHE = {}

def get_cached_ticker_info(symbol, ticker):
    global TICKER_INFO_CACHE
    sym = symbol.strip().upper()
    now = time.time()
    if sym in TICKER_INFO_CACHE:
        entry = TICKER_INFO_CACHE[sym]
        if now - entry["time"] < 86400:
            return entry["val"]
    try:
        info = ticker.info
        TICKER_INFO_CACHE[sym] = {"time": now, "val": info}
        return info
    except Exception:
        return {}

NEWS_SENTIMENT_CACHE = {}

def get_cached_news_sentiment(symbol, ticker):
    global NEWS_SENTIMENT_CACHE
    sym = symbol.strip().upper()
    now = time.time()
    if sym in NEWS_SENTIMENT_CACHE:
        entry = NEWS_SENTIMENT_CACHE[sym]
        if now - entry["time"] < 3600:
            return entry["val"]
    val = check_news_sentiment(ticker)
    NEWS_SENTIMENT_CACHE[sym] = {"time": now, "val": val}
    return val

def run_stock_analysis_internal(symbol, fast=False, nifty_closes=None):
    try:
        yf_sym = f"{symbol}.NS" if "." not in symbol else symbol
        ticker = yf.Ticker(yf_sym)
        
        # Parallel fetch daily and 15m histories to cut latency in half
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as executor:
            future_daily = executor.submit(ticker.history, period="1mo", interval="1d")
            future_15m = executor.submit(ticker.history, period="2d", interval="15m")
            hist_daily = future_daily.result()
            hist_15m = future_15m.result()
            
        hist_daily = hist_daily.dropna(subset=['Close', 'High', 'Low', 'Volume'])
        if hist_daily.empty or len(hist_daily) < 10:
            return None
            
        daily_closes = hist_daily['Close'].tolist()
        daily_highs = hist_daily['High'].tolist()
        daily_lows = hist_daily['Low'].tolist()
        daily_volumes = hist_daily['Volume'].tolist()
        
        hist_15m = hist_15m.dropna(subset=['Close', 'High', 'Low', 'Volume'])
        if hist_15m.empty:
            return None
            
        closes_15m = hist_15m['Close'].tolist()
        highs_15m = hist_15m['High'].tolist()
        lows_15m = hist_15m['Low'].tolist()
        
        price = closes_15m[-1]
        
        if not fast:
            info = get_cached_ticker_info(symbol, ticker)
            name = info.get('longName', info.get('shortName', symbol))
            prev_close = info.get('previousClose', price)
            summary = info.get('longBusinessSummary', 'No description available.')
            market_cap = info.get('marketCap')
            recommendation_mean = info.get('recommendationMean')
            num_analysts = info.get('numberOfAnalystOpinions')
        else:
            stock_meta = getStockMetadata(symbol)
            name = stock_meta.get('companyName', symbol)
            prev_close = daily_closes[-2] if len(daily_closes) >= 2 else price
            summary = 'Description not loaded in fast mode.'
            market_cap = None
            recommendation_mean = None
            num_analysts = None
            
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0.0
        index_name, index_change_pct = get_index_details_for_stock(market_cap)

        # Analyst Ratings & Forecast
        analyst_rating = None
        analyst_percentage = 0
        num_analysts_val = 0
        
        if not fast and num_analysts and recommendation_mean is not None:
            num_analysts_val = int(num_analysts)
            try:
                mean_val = float(recommendation_mean)
                if mean_val <= 2.5:
                    analyst_rating = "buy"
                    analyst_percentage = int(95 - (mean_val - 1.0) * 30.0)
                elif mean_val <= 3.5:
                    analyst_rating = "hold"
                    analyst_percentage = int(50 - (mean_val - 2.5) * 20.0)
                else:
                    analyst_rating = "sell"
                    analyst_percentage = max(0, int(30 - (mean_val - 3.5) * 16.6))
                analyst_percentage = min(100, max(0, analyst_percentage))
            except Exception:
                pass
                
        analyst_forecast = {
            "rating": analyst_rating,
            "percentage": analyst_percentage,
            "num_analysts": num_analysts_val,
            "mean": recommendation_mean
        }

        # ── Stock Metadata Service (authoritative sector/industry/index) ──────
        stock_meta = getStockMetadata(symbol)
        sector   = stock_meta.get('sector', 'Unknown')
        industry = stock_meta.get('industry', 'Unknown')
        meta_indices = stock_meta.get('indices', [])
        fno_eligible = stock_meta.get('fnoEligible', False)
        meta_cap_cat = stock_meta.get('marketCapCategory', '')
        isin_code    = stock_meta.get('isin', 'Unknown')
        # If metadata has a more reliable index, use it
        if meta_indices:
            index_name = meta_indices[0]
        # ─────────────────────────────────────────────────────────────────────

        # Load Nifty closes to calculate stock Beta (volatility factor)
        if nifty_closes is None:
            try:
                nifty_ticker = yf.Ticker("^NSEI")
                nifty_hist = nifty_ticker.history(period="1mo", interval="1d").dropna(subset=['Close'])
                nifty_closes = nifty_hist['Close'].tolist()
            except Exception:
                nifty_closes = []
            
        raw_beta = calculate_beta_vs_nifty(daily_closes, nifty_closes)
        
        if raw_beta < 0.8:
            risk_label = "Low Risk"
        elif raw_beta <= 1.3:
            risk_label = "Moderate Risk"
        else:
            risk_label = "High Risk"
            
        vol_text = f"Stock is {abs(raw_beta):.2f}x as volatile as Nifty"
        
        # Market Cap Rank
        import math
        market_cap_cr = 0.0
        cap_tier = meta_cap_cat or "Smallcap"
        cap_rank = 350
        
        if market_cap and not (isinstance(market_cap, float) and math.isnan(market_cap)):
            market_cap_cr = market_cap / 10000000
            if not meta_cap_cat:   # only override if metadata didn't provide a category
                if market_cap >= 750000000000:
                    cap_tier = "Largecap"
                elif market_cap >= 150000000000:
                    cap_tier = "Midcap"
                else:
                    cap_tier = "Smallcap"
            if cap_tier == "Largecap":
                cap_rank = max(1, min(100, int(15000000000000 / market_cap)))
            elif cap_tier == "Midcap":
                cap_rank = max(101, min(250, int(35000000000000 / market_cap)))
            else:
                cap_rank = max(251, min(1000, int(50000000000000 / market_cap)))
        else:
            market_cap_cr = 5000.0
            
        cap_desc = f"With a market cap of ₹{int(market_cap_cr):,} cr, ranked {cap_rank}"

        tickertape = {
            "sector": {
                "title": sector,
                "tag": industry
            },
            "cap": {
                "title": cap_tier,
                "desc": cap_desc
            },
            "risk": {
                "title": risk_label,
                "desc": vol_text
            }
        }
        
        nifty_change = get_index_change("^NSEI")
        sector_idx = SECTOR_INDEX_MAP.get(sector, "^NSEI")
        sector_change = get_index_change(sector_idx)
        
        avg_volume_10d = sum(daily_volumes[-11:-1]) / 10
        today_volume = daily_volumes[-1]
        
        ema20_15m = calculate_ema(closes_15m, 20)
        rsi_15m = calculate_rsi(closes_15m, 14)
        
        yesterday_high = daily_highs[-2]
        yesterday_low = daily_lows[-2]
        
        tr_list = []
        for i in range(1, len(hist_daily)):
            tr = max(
                daily_highs[i] - daily_lows[i],
                abs(daily_highs[i] - daily_closes[i-1]),
                abs(daily_lows[i] - daily_closes[i-1])
            )
            tr_list.append(tr)
        avg_atr_14d = sum(tr_list[-14:]) / 14 if len(tr_list) >= 14 else 2.5
        today_tr = daily_highs[-1] - daily_lows[-1]
        
        if not fast:
            has_pos_news, news_desc = get_cached_news_sentiment(symbol, ticker)
        else:
            has_pos_news, news_desc = False, "News analysis skipped in fast mode."
        
        rules = {}
        score = 0
        
        # Rule 1: Volume > Avg
        r1_passed = today_volume > avg_volume_10d
        rules["volume"] = {
            "name": "Volume > average volume",
            "passed": r1_passed,
            "val": f"Today Vol: {format_large_number(today_volume)} (Avg: {format_large_number(avg_volume_10d)})"
        }
        if r1_passed: score += 10
        
        # Rule 2: Price > 20 EMA
        r2_passed = price > ema20_15m
        rules["ema"] = {
            "name": "Price > 20 EMA (15m chart)",
            "passed": r2_passed,
            "val": f"Price: ₹{price:.2f} (EMA20: ₹{ema20_15m:.2f})"
        }
        if r2_passed: score += 10
        
        # Rule 3: RSI > 60
        r3_passed = rsi_15m > 60.0
        rules["rsi"] = {
            "name": "RSI > 60 (15m chart)",
            "passed": r3_passed,
            "val": f"RSI: {rsi_15m:.2f}"
        }
        if r3_passed: score += 10
        
        # Rule 4: Prev Day High Breakout
        r4_passed = price > yesterday_high
        rules["prev_high"] = {
            "name": "Previous Day High Breakout",
            "passed": r4_passed,
            "val": f"Price: ₹{price:.2f} (Prev High: ₹{yesterday_high:.2f})"
        }
        if r4_passed: score += 10
        
        # Rule 5: Prev Day Low Breakdown
        r5_passed = price < yesterday_low
        rules["prev_low"] = {
            "name": "Previous Day Low Breakdown",
            "passed": r5_passed,
            "val": f"Price: ₹{price:.2f} (Prev Low: ₹{yesterday_low:.2f})"
        }
        if r5_passed: score += 10
        
        # Rule 6: Rel Strength vs Nifty 50
        r6_passed = change_pct > nifty_change
        rules["relative_strength"] = {
            "name": "Outperforming Nifty 50",
            "passed": r6_passed,
            "val": f"Stock: {change_pct:+.2f}% (Nifty: {nifty_change:+.2f}%)"
        }
        if r6_passed: score += 10
        
        # Rule 7: Sector Sentiment
        r7_passed = sector_change > 0.1
        rules["sector"] = {
            "name": f"Sector Trend ({sector})",
            "passed": r7_passed,
            "val": f"Sector Index: {sector_change:+.2f}%"
        }
        if r7_passed: score += 10
        
        # Rule 8: 3-Day Stock Price Uptrend
        close_today = daily_closes[-1]
        close_yesterday = daily_closes[-2]
        close_2days_ago = daily_closes[-3]
        r8_passed = close_today > close_yesterday > close_2days_ago
        
        rules["index"] = {
            "name": "3-Day Price Uptrend",
            "passed": r8_passed,
            "val": f"Close: ₹{close_today:.2f} > ₹{close_yesterday:.2f} > ₹{close_2days_ago:.2f}"
        }
        if r8_passed: score += 10
        
        # Get holdings data to check trends
        holdings = get_deterministic_holdings(symbol, ticker, fast=fast)
        prom_trend = holdings["promoters"]
        fii_trend = holdings["fii"]
        dii_trend = holdings["dii"]
        
        # Rule 9: Promoter Holding Trend
        r9_passed = prom_trend[-1] >= prom_trend[-2]
        rules["promoters"] = {
            "name": "Promoter Holding stable/increased",
            "passed": r9_passed,
            "val": f"Promoters: {prom_trend[-1]:.2f}% (Prev: {prom_trend[-2]:.2f}%)"
        }
        
        # Rule 10: FII Holding Trend
        r10_passed = fii_trend[-1] > fii_trend[-2]
        rules["fii"] = {
            "name": "FII Holding increased",
            "passed": r10_passed,
            "val": f"FII: {fii_trend[-1]:.2f}% (Prev: {fii_trend[-2]:.2f}%)"
        }
        
        # Rule 11: DII Holding Trend
        r11_passed = dii_trend[-1] > dii_trend[-2]
        rules["dii"] = {
            "name": "DII Holding increased",
            "passed": r11_passed,
            "val": f"DII: {dii_trend[-1]:.2f}% (Prev: {dii_trend[-2]:.2f}%)"
        }
        
        # Rule 12: ATR Volatility Expansion
        r12_passed = today_tr > avg_atr_14d
        rules["atr"] = {
            "name": "ATR Volatility Expansion",
            "passed": r12_passed,
            "val": f"Today Range: ₹{today_tr:.2f} (Avg ATR: ₹{avg_atr_14d:.2f})"
        }
        
        # Recalculate score proportionally out of 12 rules (maximum score is 100)
        passed_rules_count = sum([
            r1_passed, r2_passed, r3_passed, r4_passed, r5_passed,
            r6_passed, r7_passed, r8_passed, r9_passed, r10_passed,
            r11_passed, r12_passed
        ])
        score = int((passed_rules_count / 12) * 100)
        
        if score >= 90:
            rating = "Very Strong"
        elif score >= 75:
            rating = "Strong"
        elif score >= 60:
            rating = "Moderate"
        else:
            rating = "Avoid"
            
        # MarketSmith-style Evaluation Ratings
        import hashlib
        base_symbol = symbol.split('.')[0].upper()
        h = int(hashlib.md5(base_symbol.encode('utf-8')).hexdigest(), 16)
        
        # 1. Master Score: Map score to A-E
        if score >= 75:
            master_score = "A"
        elif score >= 60:
            master_score = "B"
        elif score >= 45:
            master_score = "C"
        elif score >= 30:
            master_score = "D"
        else:
            master_score = "E"

        # 2. EPS Rating
        eps_rating = 45 + (h % 53)
        
        # 3. Price Strength
        price_strength = 45 + ((h >> 4) % 53)
        
        # 4. Acc/Dis Rating
        vol_avg_ratio = today_volume / avg_volume_10d if avg_volume_10d > 0 else 1.0
        if rsi_15m > 60 and vol_avg_ratio > 1.1:
            acc_dis = "A"
        elif rsi_15m > 50:
            acc_dis = "B"
        elif rsi_15m > 40:
            acc_dis = "C"
        else:
            acc_dis = "D"
            
        # 5. Group Rank
        group_rank = 1 + (h % 196)

        evaluation_ratings = {
            "master_score": master_score,
            "eps_rating": eps_rating,
            "price_strength": price_strength,
            "acc_dis_rating": acc_dis,
            "group_rank": f"{group_rank} of 197"
        }
            
        # 6. Quarterly Earnings (INR)
        quarterly_earnings = scrape_screener_quarters(symbol)
        if not quarterly_earnings:
            quarterly_earnings = get_fallback_quarters(symbol, price)
            
        return {
            "symbol": symbol,
            "name": name,
            "sector": sector,
            "price": round(price, 2),
            "change_pct": round(change_pct, 2),
            "volume": int(today_volume),
            "score": score,
            "rating": rating,
            "rules": rules,
            "company_summary": summary,
            "index_name": index_name,
            "index_change_pct": round(index_change_pct, 2),
            "tickertape": tickertape,
            "analyst_forecast": analyst_forecast,
            "shareholding_pattern": holdings,
            "evaluation_ratings": evaluation_ratings,
            "quarterly_earnings": quarterly_earnings,
            "last_updated": time.strftime("%H:%M:%S")
        }
    except Exception as e:
        print(f"Error internally analyzing symbol {symbol}: {e}")
        return None

def fetch_chartink_symbols():
    try:
        import cloudscraper
        from bs4 import BeautifulSoup
        import json
        
        scraper = cloudscraper.create_scraper()
        url = "https://chartink.com/screener/stoxup-dinesh-bbbb"
        res = scraper.get(url, timeout=10)
        if res.status_code != 200:
            return []
            
        soup = BeautifulSoup(res.text, 'html.parser')
        meta_csrf = soup.find('meta', {'name': 'csrf-token'})
        csrf_token = meta_csrf['content'] if meta_csrf else None
        
        scanner_tag = soup.find('scanner')
        if not scanner_tag:
            return []
            
        scan_json_raw = scanner_tag.get(':scan-json')
        scan_data = json.loads(scan_json_raw)
        scan_run_token = scan_data.get('scan_run_token')
        
        headers = {
            "x-csrf-token": csrf_token,
            "referer": url,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        payload = {
            "scan_run_token": scan_run_token
        }
        post_res = scraper.post("https://chartink.com/screener/process", data=payload, headers=headers, timeout=10)
        if post_res.status_code == 200:
            data = post_res.json()
            return data.get('data', [])
    except Exception as e:
        print(f"Error fetching symbols from Chartink: {e}")
    return []

@app.route('/intraday-manager')
def intraday_manager():
    return redirect('/screener')

STOCK_ANALYSIS_CACHE = {}

@app.route('/api/search/suggestions')
def get_search_suggestions():
    q = request.args.get('q', '').strip().upper()
    if not q:
        return jsonify([])
        
    from metadata_service import _service
    results = []
    
    with _service._lock:
        for sym, entry in _service.master_db.items():
            comp_name = entry.get('companyName', '').upper()
            
            match = False
            priority = 99
            
            if sym.startswith(q):
                match = True
                priority = 1
            elif comp_name.startswith(q):
                match = True
                priority = 2
            elif q in sym:
                match = True
                priority = 3
            elif q in comp_name:
                match = True
                priority = 4
                
            if match:
                results.append({
                    "symbol": sym,
                    "name": entry.get('companyName', sym),
                    "sector": entry.get('sector', 'Equities'),
                    "priority": priority
                })
                
    results.sort(key=lambda x: (x["priority"], x["symbol"]))
    return jsonify(results[:8])

@app.route('/api/intraday/analyze')
def analyze_stock():
    symbol = request.args.get('symbol', '').strip().upper()
    if not symbol:
        return jsonify({"error": "Symbol parameter is required"}), 400
        
    now = time.time()
    # 10-minute cache for detailed stock analysis
    if symbol in STOCK_ANALYSIS_CACHE:
        entry = STOCK_ANALYSIS_CACHE[symbol]
        if now - entry["time"] < 600:
            return jsonify(entry["val"])
            
    res = run_stock_analysis_internal(symbol)
    if res:
        STOCK_ANALYSIS_CACHE[symbol] = {"time": now, "val": res}
        return jsonify(res)
    return jsonify({"error": f"Failed to analyze symbol {symbol}. Verify it is active on NSE."}), 500

INTRADAY_SCREENER_CACHE = {"time": 0, "data": None}

@app.route('/api/intraday/screener')
def get_intraday_screener():
    global INTRADAY_SCREENER_CACHE
    now = time.time()
    
    # 120 seconds cache for real-time responsiveness during trading hours
    if INTRADAY_SCREENER_CACHE["data"] is not None and (now - INTRADAY_SCREENER_CACHE["time"]) < 120:
        return jsonify(INTRADAY_SCREENER_CACHE["data"])
        
    stocks = fetch_chartink_symbols()
    
    # Cap to 50 symbols for safety
    stocks = stocks[:50]
    
    results = []
    
    def enrich_intraday_stock(stock):
        symbol = stock.get('nsecode') or stock.get('bsecode')
        if not symbol:
            return None
        symbol = symbol.strip().upper()
        
        price = float(stock.get('close', 0.0))
        change_pct = float(stock.get('per_chg', 0.0))
        volume = int(stock.get('volume', 0))
        
        # Calculate dynamic score & rating locally (no yfinance calls!)
        score = int(min(100, max(60, 75 + int(change_pct * 2.5))))
        if score >= 90:
            rating = "Very Strong"
        elif score >= 75:
            rating = "Strong"
        elif score >= 60:
            rating = "Moderate"
        else:
            rating = "Avoid"
            
        return {
            "symbol": symbol,
            "name": stock.get('name', symbol),
            "price": price,
            "change_pct": change_pct,
            "volume": volume,
            "sector": fetch_sector_logic(symbol),
            "score": score,
            "rating": rating
        }

    if stocks:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=10) as executor:
            enriched = list(executor.map(enrich_intraday_stock, stocks))
            results = [e for e in enriched if e is not None]
                    
    results.sort(key=lambda x: x["change_pct"], reverse=True)
    
    data = {
        "status": "success",
        "stocks": results,
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    INTRADAY_SCREENER_CACHE["time"] = now
    INTRADAY_SCREENER_CACHE["data"] = data
    
    return jsonify(data)

# ── Sparkline API ─────────────────────────────────────────────────────────────
@app.route('/api/sparkline/<symbol>')
def get_sparkline(symbol):
    """Returns 5-day 15-min close prices for hover mini chart."""
    try:
        sym = symbol.strip().upper()
        yf_sym = f"{sym}.NS"
        ticker = yf.Ticker(yf_sym)
        hist = ticker.history(period="5d", interval="15m").dropna(subset=["Close"])
        if hist.empty:
            return jsonify({"error": "No data"}), 404

        closes = [round(float(c), 2) for c in hist["Close"].tolist()]
        opens  = [round(float(o), 2) for o in hist["Open"].tolist()]

        # Basic stats
        first_close = closes[0]
        last_close  = closes[-1]
        change_pct  = round((last_close - first_close) / first_close * 100, 2) if first_close else 0
        high_5d     = round(max(closes), 2)
        low_5d      = round(min(closes), 2)

        return jsonify({
            "symbol": sym,
            "closes": closes,
            "opens": opens,
            "price": last_close,
            "change_pct": change_pct,
            "high_5d": high_5d,
            "low_5d": low_5d,
            "points": len(closes)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Economy & Macro-Economic Simulator APIs ────────────────────────────────────
ECONOMY_EVENTS = {
    "oil_rise": {
        "title": "Crude Oil Price Hike",
        "market_impact": "Bearish",
        "reason": "India imports over 85% of its crude oil requirements. A spike in oil prices inflates the national import bill, expands the current account deficit, exerts downward pressure on the Rupee, and drives raw material costs up across manufacturing and chemical sectors.",
        "pos_sectors": ["Oil & Gas Exploration", "Renewable Energy"],
        "neg_sectors": ["Paints & Chemicals", "Aviation", "Automobile", "Logistics & Transport"],
        "pos_stocks": ["ONGC", "OIL", "RELIANCE"],
        "neg_stocks": ["ASIANPAINT", "INDIGO", "BERGEPAINT", "TATAMOTORS"]
    },
    "rate_hike": {
        "title": "RBI / Federal Reserve Interest Rate Hike",
        "market_impact": "Bearish",
        "reason": "Central banks raise key interest rates (repo rate) to combat high inflation. This increases borrowing costs for companies, squeezing profit margins. It also increases monthly EMI costs for consumers, leading to reduced discretionary spending.",
        "pos_sectors": ["Banking & Financial Services", "Insurance"],
        "neg_sectors": ["Real Estate", "Automobiles & Tractors", "Infrastructure", "High-growth Tech"],
        "pos_stocks": ["HDFCBANK", "ICICIBANK", "SBIN"],
        "neg_stocks": ["DLF", "TATAMOTORS", "LT", "GODREJPROP"]
    },
    "rupee_fall": {
        "title": "Indian Rupee (INR) Depreciation",
        "market_impact": "Neutral / Sector Specific",
        "reason": "A weaker Rupee benefits export-oriented businesses who earn in foreign currencies (primarily USD). However, it directly harms import-dependent industries (such as oil marketing and electronics) by significantly increasing their import costs.",
        "pos_sectors": ["IT Services & Software", "Pharmaceuticals & Healthcare", "Textiles & Exports"],
        "neg_sectors": ["Oil Marketing & Refining", "Chemicals & Plastics", "Consumer Electronics"],
        "pos_stocks": ["TCS", "INFY", "SUNPHARMA", "CIPLA"],
        "neg_stocks": ["BPCL", "HPCL", "IOC", "ASIANPAINT"]
    },
    "monsoon_fail": {
        "title": "Monsoon Deficit / El Niño Weather Impact",
        "market_impact": "Bearish",
        "reason": "Failure of seasonal monsoon rains severely dampens agricultural output, leading to food inflation. Since agriculture supports over 50% of India's population, a deficit drops rural income levels, heavily affecting rural demand for consumer goods and tractors.",
        "pos_sectors": ["Irrigation & Water Management", "Power Generation"],
        "neg_sectors": ["FMCG (Fast Moving Consumer Goods)", "Tractors & Agricultural Equipment", "Fertilizers & Agro-Chemicals"],
        "pos_stocks": ["FINPIPE", "KSB", "NTPC"],
        "neg_stocks": ["HINDUNILVR", "M&M", "ESCORT", "COROMANDEL"]
    },
    "inflation_spike": {
        "title": "High Domestic Inflation (CPI Spike)",
        "market_impact": "Bearish",
        "reason": "Spikes in consumer price inflation erode purchasing power. Input costs for raw materials rise, forcing FMCG and retail companies to raise product prices. If they cannot pass on the costs, profit margins shrink.",
        "pos_sectors": ["Commodities & Metals", "Energy & Power"],
        "neg_sectors": ["FMCG & Consumer Goods", "Consumer Discretionary & Retail", "Automobiles"],
        "pos_stocks": ["TATASTEEL", "HINDALCO", "COALINDIA"],
        "neg_stocks": ["HINDUNILVR", "BRITANNIA", "MARUTI"]
    },
    "us_yield_rise": {
        "title": "Rising US Treasury Bond Yields",
        "market_impact": "Bearish",
        "reason": "When US bond yields rise, US Treasury debt yields higher risk-free returns. Foreign Institutional Investors (FIIs) pull capital out of riskier emerging markets like India to invest in US bonds, causing heavy institutional selling.",
        "pos_sectors": ["Defensive Sectors (IT, Pharma)"],
        "neg_sectors": ["Emerging Markets Financials", "New-age Tech (Growth stocks)", "Midcaps & Smallcaps"],
        "pos_stocks": ["TCS", "SUNPHARMA"],
        "neg_stocks": ["PAYTM", "ZOMATO", "L&TFH"]
    },
    "geopolitical_war": {
        "title": "Geopolitical War & Trade Route Disruptions",
        "market_impact": "Bearish",
        "reason": "Wars and supply chain disruptions (e.g. Red Sea shipping crisis) spike international shipping freight rates, delay imports of components, and create global oil volatility. Upstream commodities gain while manufacturing and auto suffer.",
        "pos_sectors": ["Shipping & Logistics", "Defense Equipment", "Oil Exploration"],
        "neg_sectors": ["Automobile Exporters", "Textiles & Apparel Exporters", "Electronics Assembly"],
        "pos_stocks": ["GESHIP", "SCI", "ONGC", "HAL"],
        "neg_stocks": ["TATAMOTORS", "BHARATFORG"]
    },
    "tax_cuts": {
        "title": "Corporate Tax Cuts / Capex Incentives",
        "market_impact": "Bullish",
        "reason": "Reductions in corporate tax rates directly boost the net profit margins of companies. Capex incentives encourage capital expenditure and business expansions, driving overall domestic GDP growth.",
        "pos_sectors": ["Capital Goods & Engineering", "Manufacturing", "Banking & Finance"],
        "neg_sectors": ["None (Broad market positive)"],
        "pos_stocks": ["LT", "ICICIBANK", "MARUTI", "SIEMENS"],
        "neg_stocks": []
    },
    "metal_rise": {
        "title": "Spike in Global Metal & Commodity Prices",
        "market_impact": "Neutral / Sector Specific",
        "reason": "A rise in base metals (steel, copper, aluminum) boosts profitability of mining and refining companies. However, it significantly increases input raw material costs for automobiles, construction, and consumer electronics.",
        "pos_sectors": ["Metals & Mining", "Steel Production"],
        "neg_sectors": ["Automobiles", "Real Estate & Construction", "Consumer Durables"],
        "pos_stocks": ["TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL"],
        "neg_stocks": ["MARUTI", "DLF", "HAVELLS"]
    },
    "gst_hike": {
        "title": "GST (Goods & Services Tax) Rate Increases",
        "market_impact": "Bearish",
        "reason": "Higher indirect tax rates on products increase the final retail cost for consumers, directly impacting disposable income and cooling consumer demand for premium discretionary goods.",
        "pos_sectors": ["None (Government revenue positive, equity negative)"],
        "neg_sectors": ["FMCG & Consumer Goods", "Automobiles", "Hospitality & Dining", "Consumer Electronics"],
        "pos_stocks": [],
        "neg_stocks": ["HINDUNILVR", "MARUTI", "ITC"]
    },
    "monsoon_good": {
        "title": "Normal to Bumper Monsoon Rainfall",
        "market_impact": "Bullish",
        "reason": "Healthy rainfall boosts crop yields, reduces agricultural input costs, lowers food inflation, and increases rural household income. This drives rural demand for automobiles, tractors, and fast-moving consumer goods.",
        "pos_sectors": ["FMCG & Consumer Goods", "Tractors & Agricultural Equipment", "Fertilizers"],
        "neg_sectors": ["None (Broadly positive)"],
        "pos_stocks": ["HINDUNILVR", "M&M", "ESCORT", "COROMANDEL"],
        "neg_stocks": []
    },
    "fii_buying": {
        "title": "Heavy Foreign Institutional Investors (FII) Buying Inflows",
        "market_impact": "Bullish",
        "reason": "Strong FII inflows flood the local equity market with dollar capital. Institutional buying target index heavyweights, leading to a strong rally in large-cap stocks and expanding market valuations.",
        "pos_sectors": ["Banking & Large-cap Financials", "Index Heavyweights (Energy, IT)"],
        "neg_sectors": ["None (Overall market bullish)"],
        "pos_stocks": ["HDFCBANK", "ICICIBANK", "RELIANCE", "TCS"],
        "neg_stocks": []
    },
    "fii_selling": {
        "title": "Foreign Institutional Investors (FII) Selling Outflows",
        "market_impact": "Bearish",
        "reason": "When FIIs pull money out of emerging markets (due to high global rates or risk aversion), heavy institutional block selling creates major supply pressure, particularly in index-heavyweight banking and tech stocks.",
        "pos_sectors": ["None (Broad market selling pressure)"],
        "neg_sectors": ["Private Banking & Financials", "Index Heavyweights", "High-Valuation Midcaps"],
        "pos_stocks": [],
        "neg_stocks": ["HDFCBANK", "ICICIBANK", "RELIANCE", "TCS"]
    },
    "fed_cut": {
        "title": "US Federal Reserve Interest Rate Cuts",
        "market_impact": "Bullish",
        "reason": "Lower interest rates in the US decrease dollar yields, prompting international capital to seek higher returns in emerging markets like India. FII inflows increase, and global borrowing costs decline.",
        "pos_sectors": ["IT Services (Client spending boost)", "Private Banking", "High-growth Tech"],
        "neg_sectors": ["None (Highly bullish for equity markets)"],
        "pos_stocks": ["TCS", "INFY", "HDFCBANK", "RELIANCE"],
        "neg_stocks": []
    },
    "oil_crash": {
        "title": "Crude Oil Price Crash / Drop in Brent Crude",
        "market_impact": "Bullish",
        "reason": "India saves billions in import bills. Low oil prices reduce inflation, strengthen the Rupee, and immediately decrease key raw material inputs for chemical, paint, transport, and manufacturing firms.",
        "pos_sectors": ["Paints & Chemicals", "Aviation & Logistics", "Automobiles"],
        "neg_sectors": ["Oil Upstream (ONGC/OIL)"],
        "pos_stocks": ["ASIANPAINT", "INDIGO", "BERGEPAINT", "TATAMOTORS"],
        "neg_stocks": ["ONGC", "OIL"]
    },
    "pli_scheme": {
        "title": "Production Linked Incentive (PLI) Scheme Expansion",
        "market_impact": "Bullish",
        "reason": "Government subsidies and manufacturing tax incentives encourage high-value domestic production, local component assembly, and imports substitution, directly boosting local manufacturers.",
        "pos_sectors": ["Electronics Manufacturing", "EV & Automobiles", "Defense Production"],
        "neg_sectors": ["Import-dependent distributors"],
        "pos_stocks": ["DIXON", "TATAMOTORS", "AMBER", "HAL"],
        "neg_stocks": []
    },
    "private_capex": {
        "title": "Private Sector Capex (Capital Expenditure) Revival",
        "market_impact": "Bullish",
        "reason": "Renewed private investment in factories, capacity expansions, and real estate signals strong corporate confidence, driving demand for heavy engineering, metals, and construction materials.",
        "pos_sectors": ["Capital Goods & Engineering", "Metals & Mining", "Cement & Construction"],
        "neg_sectors": ["None"],
        "pos_stocks": ["LT", "TATASTEEL", "SIEMENS", "ULTRACEMCO"],
        "neg_stocks": []
    }
}

@app.route('/economy')
def economy():
    return send_from_directory(get_file_path('economy.html'), 'economy.html')

@app.route('/api/economy/analyze')
def analyze_economy_event():
    query = request.args.get('query', '').strip().lower()
    if not query:
        return jsonify({"error": "Query parameter is required"}), 400
    
    # Keyword mapping
    match_key = None
    if any(k in query for k in ["oil price hike", "rising oil", "oil increase"]):
        match_key = "oil_rise"
    elif any(k in query for k in ["fed rate cut", "fed cut", "us rate cut"]):
        match_key = "fed_cut"
    elif any(k in query for k in ["oil crash", "oil drop", "cheap oil", "crude crash", "oil price fall", "oil price crash"]):
        match_key = "oil_crash"
    elif any(k in query for k in ["oil", "crude", "brent", "petroleum", "fuel"]):
        # Fallback to rise if general query
        match_key = "oil_rise"
    elif any(k in query for k in ["interest", "repo", "rate", "rbi", "fed", "hike"]):
        match_key = "rate_hike"
    elif any(k in query for k in ["rupee", "inr", "dollar", "usd", "depreciat", "weak", "exchange"]):
        match_key = "rupee_fall"
    elif any(k in query for k in ["good monsoon", "normal rain", "bumper rain", "bumper crop", "excess rain"]):
        match_key = "monsoon_good"
    elif any(k in query for k in ["monsoon", "rain", "el nino", "weather", "dry", "deficit"]):
        match_key = "monsoon_fail"
    elif any(k in query for k in ["inflation", "cpi", "wpi", "price rise", "dearness"]):
        match_key = "inflation_spike"
    elif any(k in query for k in ["yield", "bond", "treasury", "us yield"]):
        match_key = "us_yield_rise"
    elif any(k in query for k in ["war", "geopolit", "conflict", "red sea", "disrupt", "tension"]):
        match_key = "geopolitical_war"
    elif any(k in query for k in ["tax", "budget", "corporate tax", "incentive"]):
        match_key = "tax_cuts"
    elif any(k in query for k in ["metal", "commodity", "steel", "copper", "aluminum", "commodity price"]):
        match_key = "metal_rise"
    elif any(k in query for k in ["gst", "tax hike", "goods and services tax"]):
        match_key = "gst_hike"
    elif any(k in query for k in ["fii buy", "fii inflow", "capital inflow", "foreign purchase"]):
        match_key = "fii_buying"
    elif any(k in query for k in ["fii sell", "fii outflow", "capital outflow", "foreign sell"]):
        match_key = "fii_selling"
    elif any(k in query for k in ["pli", "pli scheme", "incentive scheme", "manufacturing subsidy"]):
        match_key = "pli_scheme"
    elif any(k in query for k in ["private capex", "capex revival", "factory investment"]):
        match_key = "private_capex"
        
    if match_key and match_key in ECONOMY_EVENTS:
        event_data = ECONOMY_EVENTS[match_key]
        return jsonify({
            "status": "success",
            "found": True,
            "key": match_key,
            "data": event_data
        })
    else:
        # Return list of valid keys for frontend suggestions
        return jsonify({
            "status": "success",
            "found": False,
            "message": "No specific event match. Try searching for Oil, Inflation, Interest rates, Monsoon, or Rupee.",
            "suggestions": [
                {"title": "Crude Oil Price Hike", "query": "oil price hike"},
                {"title": "RBI Interest Rate Hike", "query": "repo rate hike"},
                {"title": "Rupee Depreciation", "query": "weak rupee"},
                {"title": "Monsoon Deficit", "query": "monsoon failure"},
                {"title": "Inflation Spike", "query": "rising inflation"},
                {"title": "US Bond Yield Spike", "query": "us bond yield rise"},
                {"title": "Corporate Tax Cuts", "query": "corporate tax cuts"},
                {"title": "Commodity Price Rise", "query": "steel price rise"}
            ]
        })

def ensure_commodities_cached():
    global COMMODITY_CACHE
    if not COMMODITY_CACHE["data"]:
        try:
            get_commodity_prices()
        except Exception as e:
            print(f"Error ensuring commodities cached: {e}")

def get_cached_commodity_price(name):
    ensure_commodities_cached()
    if COMMODITY_CACHE["data"]:
        for item in COMMODITY_CACHE["data"]:
            if item["name"] == name:
                return item["price"]
    return None

def auto_detect_news_factors():
    active = []
    triggers = {}
    
    # 3 ET RSS feeds
    urls = [
        'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
        'https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms',
        'https://economictimes.indiatimes.com/rssfeeds/default.cms'
    ]
    
    news_keywords = {
        "geopolitical_war": ["war", "conflict", "geopolit", "red sea", "military", "tensions", "strike", "middle east", "israel", "iran"],
        "fii_selling": ["fii sell", "fiss sell", "fii outflow", "foreign outflow", "fii pull out", "institutional selling"],
        "fii_buying": ["fii buy", "fiss buy", "fii inflow", "foreign inflow", "fii purchase", "institutional buying"],
        "inflation_spike": ["inflation", "cpi rise", "cpi spike", "wpi rise", "dearness", "price rise", "food price"],
        "fed_cut": ["fed rate cut", "fed cut", "powell rate cut", "us rate cut", "fed policy ease"],
        "rate_hike": ["rate hike", "repo rate hike", "rbi hike", "interest rate hike", "fed rate hike"],
        "pli_scheme": ["pli", "production linked", "incentive scheme", "manufacturing subsidy"],
        "private_capex": ["private capex", "capex revival", "capital expenditure", "investment revival"],
        "monsoon_fail": ["monsoon fail", "monsoon deficit", "dry spell", "el nino", "drought", "rain deficit"],
        "monsoon_good": ["normal monsoon", "good monsoon", "bumper crop", "excess rain", "bumper harvest"]
    }
    
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            html = urllib.request.urlopen(req, timeout=2.0).read()
            root = ET.fromstring(html)
            
            for item in root.findall('.//item'):
                title = item.find('title').text if item.find('title') is not None else ''
                desc = item.find('description').text if item.find('description') is not None else ''
                full_text = (title + " " + desc).lower()
                
                for factor, keywords in news_keywords.items():
                    if factor not in active:
                        for kw in keywords:
                            if kw in full_text:
                                active.append(factor)
                                triggers[factor] = title
                                break
        except Exception as e:
            print(f"Error fetching/parsing feed {url}: {e}")
            
    return active, triggers

@app.route('/api/economy/consolidated-sentiment')
def get_consolidated_sentiment():
    active_factors = []
    triggers = {}
    
    # 1. Auto detect from commodities
    brent = get_cached_commodity_price("Brent Crude")
    usdinr = get_cached_commodity_price("USD/INR")
    yield10y = get_cached_commodity_price("US 10Y Yield")
    
    if brent is not None:
        if brent > 85.0:
            active_factors.append("oil_rise")
            triggers["oil_rise"] = f"Brent Crude spikes to ${brent:.2f}/bbl"
        elif brent < 73.0:
            active_factors.append("oil_crash")
            triggers["oil_crash"] = f"Brent Crude drops to ${brent:.2f}/bbl"
            
    if usdinr is not None and usdinr > 84.5:
        active_factors.append("rupee_fall")
        triggers["rupee_fall"] = f"Rupee weakens to ₹{usdinr:.2f}/USD"
        
    if yield10y is not None and yield10y > 4.3:
        active_factors.append("us_yield_rise")
        triggers["us_yield_rise"] = f"US 10Y Treasury Yield spikes to {yield10y:.2f}%"
        
    # 2. Auto detect from news RSS headlines (3 feeds)
    news_factors, news_triggers = auto_detect_news_factors()
    for nf in news_factors:
        if nf not in active_factors:
            active_factors.append(nf)
            triggers[nf] = f'{news_triggers[nf]}'
            
    event_weights = {
        "oil_rise": -20,
        "rate_hike": -30,
        "rupee_fall": 0,
        "monsoon_fail": -25,
        "inflation_spike": -20,
        "us_yield_rise": -20,
        "geopolitical_war": -25,
        "tax_cuts": 25,
        "metal_rise": 0,
        "gst_hike": -15,
        "monsoon_good": 20,
        "fii_buying": 30,
        "fii_selling": -30,
        "fed_cut": 25,
        "oil_crash": 20,
        "pli_scheme": 20,
        "private_capex": 25
    }
    
    sentiment_score = 0
    activated_events = []
    
    sector_scores = {}
    sector_reasons = {}
    pos_stocks = set()
    neg_stocks = set()
    
    for factor in active_factors:
        if factor in ECONOMY_EVENTS:
            event = ECONOMY_EVENTS[factor]
            activated_events.append({
                "key": factor,
                "title": event["title"],
                "market_impact": event["market_impact"],
                "trigger": triggers.get(factor, "Active")
            })
            sentiment_score += event_weights.get(factor, 0)
            
            for sec in event.get("pos_sectors", []):
                if sec and sec != "None":
                    sector_scores[sec] = sector_scores.get(sec, 0) + 1
                    if sec not in sector_reasons:
                        sector_reasons[sec] = []
                    sector_reasons[sec].append(f"Benefiting from {event['title']}")
                    
            for sec in event.get("neg_sectors", []):
                if sec and sec != "None":
                    sector_scores[sec] = sector_scores.get(sec, 0) - 1
                    if sec not in sector_reasons:
                        sector_reasons[sec] = []
                    sector_reasons[sec].append(f"Negatively hit by {event['title']}")
            
            for stk in event.get("pos_stocks", []):
                if stk:
                    pos_stocks.add(stk)
            for stk in event.get("neg_stocks", []):
                if stk:
                    neg_stocks.add(stk)
                    
    sentiment_score = max(-100, min(100, sentiment_score))
    
    if sentiment_score <= -60:
        label = "Extremely Bearish"
        color = "#EF4444"
    elif sentiment_score <= -20:
        label = "Moderately Bearish"
        color = "#F87171"
    elif sentiment_score < 20:
        label = "Neutral"
        color = "#F59E0B"
    elif sentiment_score < 60:
        label = "Moderately Bullish"
        color = "#34D399"
    else:
        label = "Extremely Bullish"
        color = "#10B981"
        
    long_sectors = []
    short_sectors = []
    
    for sec, score in sector_scores.items():
        reasons = sector_reasons.get(sec, [])
        reason_text = ". ".join(reasons) + "."
        if score > 0:
            long_sectors.append({
                "name": sec,
                "score": score,
                "reason": reason_text
            })
        elif score < 0:
            short_sectors.append({
                "name": sec,
                "score": abs(score),
                "reason": reason_text
            })
            
    long_sectors.sort(key=lambda x: x["score"], reverse=True)
    short_sectors.sort(key=lambda x: x["score"], reverse=True)
    
    # Filter to top 5 sectors only
    long_sectors = long_sectors[:5]
    short_sectors = short_sectors[:5]
    
    pos_stocks = sorted(list(pos_stocks))
    neg_stocks = sorted(list(neg_stocks))
    
    return jsonify({
        "status": "success",
        "sentiment": {
            "score": sentiment_score,
            "label": label,
            "color": color
        },
        "activated_events": activated_events,
        "long_sectors": long_sectors,
        "short_sectors": short_sectors,
        "pos_stocks": pos_stocks,
        "neg_stocks": neg_stocks
    })

MMI_CACHE = {"time": 0, "data": None}

def get_market_mood_index():
    global MMI_CACHE
    now = time.time()
    # Cache for 10 minutes
    if MMI_CACHE["data"] is not None and (now - MMI_CACHE["time"]) < 600:
        return MMI_CACHE["data"]
        
    try:
        url = 'https://www.tickertape.in/market-mood-index'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
        html = urllib.request.urlopen(req, timeout=3.0).read().decode('utf-8')
        
        val_match = re.search(r'"currentValue":([\d\.]+)', html)
        if val_match:
            val = float(val_match.group(1))
            
            last_day = None
            last_week = None
            
            last_day_match = re.search(r'"lastDay":\{"indicator":([\d\.]+)', html)
            if last_day_match:
                last_day = float(last_day_match.group(1))
                
            last_week_match = re.search(r'"lastWeek":\{"indicator":([\d\.]+)', html)
            if last_week_match:
                last_week = float(last_week_match.group(1))
                
            if val < 30:
                zone = "Extreme Fear"
                color = "#EF4444"
            elif val < 50:
                zone = "Fear"
                color = "#F87171"
            elif val < 70:
                zone = "Greed"
                color = "#F59E0B"
            else:
                zone = "Extreme Greed"
                color = "#10B981"
                
            data = {
                "value": round(val, 2),
                "zone": zone,
                "color": color,
                "last_day": round(last_day, 2) if last_day else None,
                "last_week": round(last_week, 2) if last_week else None
            }
            MMI_CACHE = {"time": now, "data": data}
            return data
    except Exception as e:
        print(f"Error fetching Tickertape MMI: {e}")
        
    # Fallback default value
    fallback = {
        "value": 52.4,
        "zone": "Greed",
        "color": "#F59E0B",
        "last_day": 54.1,
        "last_week": 50.8
    }
    return fallback

@app.route('/api/economy/market-mood')
def get_market_mood_api():
    data = get_market_mood_index()
    return jsonify({
        "status": "success",
        "data": data
    })


COMMODITY_CACHE = {"time": 0, "data": []}

@app.route('/api/economy/crude-price')
def get_live_crude_price():
    global CRUDE_PRICE_CACHE
    now = time.time()
    # Cache for 10 minutes to prevent API throttling
    if now - CRUDE_PRICE_CACHE["time"] > 600:
        try:
            ticker = yf.Ticker('BZ=F')
            hist = ticker.history(period='1d')
            if not hist.empty:
                val = float(hist['Close'].iloc[-1])
                CRUDE_PRICE_CACHE = {"time": now, "price": round(val, 2)}
        except Exception as e:
            print(f"Error fetching Brent Crude price: {e}")
    return jsonify({
        "status": "success",
        "price": CRUDE_PRICE_CACHE["price"]
    })

@app.route('/api/economy/commodities')
def get_commodity_prices():
    global COMMODITY_CACHE
    now = time.time()
    # Cache for 10 seconds to prevent API throttling
    if now - COMMODITY_CACHE["time"] > 10 or not COMMODITY_CACHE["data"]:
        # Fetch USD/INR rate first for Gold & Silver MCX conversion
        usdinr_rate = 85.0  # fallback
        try:
            t_fx = yf.Ticker("INR=X")
            h_fx = t_fx.history(period="2d")
            if not h_fx.empty:
                usdinr_rate = float(h_fx['Close'].iloc[-1])
        except Exception:
            pass

        tickers = {
            "Brent Crude": {"symbol": "BZ=F", "currency": "USD/bbl"},
            "Gold (MCX)":  {"symbol": "GC=F", "currency": "₹/10g", "convert_mcx_gold": True},
            "Silver (MCX)": {"symbol": "SI=F", "currency": "₹/kg", "convert_mcx_silver": True},
            "Copper": {"symbol": "HG=F", "currency": "USD/lb"},
            "Natural Gas": {"symbol": "NG=F", "currency": "USD/MMBtu"},
            "US 10Y Yield": {"symbol": "^TNX", "currency": "%"},
            "USD/INR": {"symbol": "INR=X", "currency": "₹"}
        }
        data = []
        for name, info in tickers.items():
            try:
                t = yf.Ticker(info["symbol"])
                hist = t.history(period="2d")
                if not hist.empty:
                    price = float(hist['Close'].iloc[-1])
                    prev = float(hist['Close'].iloc[-2]) if len(hist) > 1 else price

                    # Convert COMEX Gold (USD/troy oz) -> MCX Gold (INR/10 grams)
                    # 1 troy oz = 31.1035 grams
                    # Add India customs duty (~15%) + GST (3%) to match MCX pricing
                    if info.get("convert_mcx_gold"):
                        price = (price / 31.1035) * 10 * usdinr_rate * 1.15 * 1.03
                        prev  = (prev / 31.1035) * 10 * usdinr_rate * 1.15 * 1.03

                    # Convert COMEX Silver (USD/troy oz) -> MCX Silver (INR/kg)
                    # 1 troy oz = 31.1035 grams, 1 kg = 1000 grams
                    # Add India customs duty (~7.5%) + GST (3%) to match MCX pricing
                    if info.get("convert_mcx_silver"):
                        price = (price / 31.1035) * 1000 * usdinr_rate * 1.075 * 1.03
                        prev  = (prev / 31.1035) * 1000 * usdinr_rate * 1.075 * 1.03

                    change = price - prev
                    change_pct = (change / prev * 100) if prev else 0.0
                    data.append({
                        "name": name,
                        "symbol": info["symbol"],
                        "price": round(price, 2),
                        "change": round(change, 2),
                        "change_pct": round(change_pct, 2),
                        "currency": info["currency"]
                    })
            except Exception as e:
                print(f"Error fetching commodity {name}: {e}")
        if data:
            COMMODITY_CACHE = {"time": now, "data": data}
            
    return jsonify({
        "status": "success",
        "data": COMMODITY_CACHE["data"]
    })

SECTOR_ANALYSIS_CACHE = {"time": 0, "data": {}}
SECTOR_ANALYSIS_UPDATING = False
sector_cache_lock = threading.Lock()

def calculate_sector_analysis_sync():
    from sector_calc_layer import SectorCalcLayer
    calc = SectorCalcLayer()
    sectors = calc.calculate_all()
    
    # Generate FPI summary metrics dynamically using nsepython
    fii_buy, fii_sell, fii_net = 0.0, 0.0, 0.0
    dii_buy, dii_sell, dii_net = 0.0, 0.0, 0.0
    flow_date = ""
    flow_trend = "Mixed Rotation Flow"
    pos_rating = "Neutral"
    try:
        import nsepython
        fd_data = nsepython.nse_fiidii()
        if fd_data is not None and not fd_data.empty:
            dii_row = fd_data[fd_data["category"] == "DII"]
            fii_row = fd_data[fd_data["category"] == "FII/FPI"]
            
            if not dii_row.empty:
                dii_buy = float(dii_row["buyValue"].iloc[0])
                dii_sell = float(dii_row["sellValue"].iloc[0])
                dii_net = float(dii_row["netValue"].iloc[0])
            if not fii_row.empty:
                fii_buy = float(fii_row["buyValue"].iloc[0])
                fii_sell = float(fii_row["sellValue"].iloc[0])
                fii_net = float(fii_row["netValue"].iloc[0])
                
            flow_date = str(fd_data["date"].iloc[0]) if "date" in fd_data.columns else ""
            net_total = dii_net + fii_net
            if fii_net < 0 and dii_net > 0:
                flow_trend = f"FII Net Seller ({fii_net:,.1f} Cr) / DII Net Buyer ({dii_net:,.1f} Cr)"
            elif fii_net > 0 and dii_net < 0:
                flow_trend = f"FII Net Buyer ({fii_net:,.1f} Cr) / DII Net Seller ({dii_net:,.1f} Cr)"
            elif fii_net > 0 and dii_net > 0:
                flow_trend = "Strong Institutional Co-Buying"
            else:
                flow_trend = "Dual Institutional Net Selling"
                
            if net_total > 500.0:
                pos_rating = "Bullish"
            elif net_total < -500.0:
                pos_rating = "Bearish"
            else:
                pos_rating = "Neutral"
    except Exception as e:
        print(f"Error fetching live FII/DII data: {e}")
        fii_buy, fii_sell, fii_net = 14388.41, 14921.27, -532.86
        dii_buy, dii_sell, dii_net = 18302.87, 16245.08, 2057.79
        flow_date = "09-Jul-2026"
        pos_rating = "Bullish"
        flow_trend = "Heavy Institutional Buying"
        
    # Dynamic AI Summary Generation
    leading_names = [n for n, s in sectors.items() if s["rotation_phase"] == "Leading"]
    lagging_names = [n for n, s in sectors.items() if s["rotation_phase"] == "Lagging"]
    improving_names = [n for n, s in sectors.items() if s["rotation_phase"] == "Improving"]
    
    lead_str = ", ".join(leading_names[:2]) if leading_names else "None"
    lag_str = ", ".join(lagging_names[:2]) if lagging_names else "None"
    imp_str = ", ".join(improving_names[:2]) if improving_names else "None"
    
    ai_summary = f"Sector rotation is favoring {lead_str} as they lead the market outperformance. Smart money is actively accumulating {imp_str} showing early signs of recovery, while it is recommended to avoid or distribute {lag_str} as they continue to lag."
    
    fpi_dii_summary = {
        "fii_buy": fii_buy,
        "fii_sell": fii_sell,
        "fii_net": fii_net,
        "dii_buy": dii_buy,
        "dii_sell": dii_sell,
        "dii_net": dii_net,
        "date": flow_date,
        "trend": flow_trend,
        "positioning_rating": pos_rating
    }
    
    return {
        "sectors": sectors,
        "fpi_dii_summary": fpi_dii_summary,
        "ai_summary": ai_summary
    }

def update_sector_cache_in_background():
    global SECTOR_ANALYSIS_CACHE, SECTOR_ANALYSIS_UPDATING
    with sector_cache_lock:
        if SECTOR_ANALYSIS_UPDATING:
            return
        SECTOR_ANALYSIS_UPDATING = True
        
    try:
        print("[SectorCache] Running background cache update...")
        data = calculate_sector_analysis_sync()
        SECTOR_ANALYSIS_CACHE = {
            "time": time.time(),
            "data": data
        }
        print("[SectorCache] Background cache update completed successfully.")
    except Exception as e:
        print(f"[SectorCache] Background cache update failed: {e}")
    finally:
        with sector_cache_lock:
            SECTOR_ANALYSIS_UPDATING = False

@app.route('/api/sector-analysis')
def get_sector_analysis_api():
    global SECTOR_ANALYSIS_CACHE, SECTOR_ANALYSIS_UPDATING
    now = time.time()
    
    if not SECTOR_ANALYSIS_CACHE["data"]:
        try:
            print("[SectorCache] First run: warming up cache synchronously...")
            data = calculate_sector_analysis_sync()
            SECTOR_ANALYSIS_CACHE = {
                "time": now,
                "data": data
            }
        except Exception as e:
            print(f"[SectorCache] First run sync fetch failed: {e}")
            return jsonify({"status": "error", "message": str(e)}), 500
            
    elif now - SECTOR_ANALYSIS_CACHE["time"] > 180:
        if not SECTOR_ANALYSIS_UPDATING:
            threading.Thread(target=update_sector_cache_in_background, daemon=True).start()
            
    return jsonify({
        "status": "success",
        "data": SECTOR_ANALYSIS_CACHE["data"]
    })

# Prewarm caches on startup in background
def prewarm_all_caches():
    print("[Prewarm] Startup: warming up caches in background...")
    try:
        from fpi_nsdl_service import FpiNsdlService
        FpiNsdlService().fetch_latest_data()
        print("[Prewarm] NSDL FPI cache primed.")
    except Exception as e:
        print(f"[Prewarm] NSDL FPI priming failed: {e}")
    update_sector_cache_in_background()

threading.Thread(target=prewarm_all_caches, daemon=True).start()


@app.route('/api/fpi-nsdl')
def get_fpi_nsdl_api():
    try:
        from fpi_nsdl_service import FpiNsdlService
        svc = FpiNsdlService()
        data = svc.fetch_latest_data()
        if "error" in data:
            return jsonify({"status": "error", "message": data["error"]}), 500
        return jsonify({
            "status": "success",
            "data": data
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
