from flask import Blueprint, send_from_directory
import os

views_bp = Blueprint('views', __name__)

@views_bp.route('/')
def index():
    return send_from_directory(get_file_path('index.html'), 'index.html')

@views_bp.route('/screener')
def screener():
    return send_from_directory(get_file_path('screener.html'), 'screener.html')

@views_bp.route('/contact')
def contact():
    return send_from_directory(get_file_path('contact.html'), 'contact.html')

@views_bp.route('/articles')
def articles():
    return send_from_directory(get_file_path('articles.html'), 'articles.html')

@views_bp.route('/article')
def article_detail():
    return send_from_directory(get_file_path('article-detail.html'), 'article-detail.html')

@views_bp.route('/about')
def about():
    return send_from_directory(get_file_path('about.html'), 'about.html')

@views_bp.route('/privacy')
def privacy():
    return send_from_directory(get_file_path('privacy.html'), 'privacy.html')

@views_bp.route('/terms')
def terms():
    return send_from_directory(get_file_path('terms.html'), 'terms.html')

@views_bp.route('/refund-policy')
def refund_policy():
    return send_from_directory(get_file_path('refund-policy.html'), 'refund-policy.html')

@views_bp.route('/sector-analysis')
def sector_analysis():
    return send_from_directory(get_file_path('sector-analysis.html'), 'sector-analysis.html')

@views_bp.route('/block-deals')
def block_deals():
    return send_from_directory(get_file_path('block-deals.html'), 'block-deals.html')

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

@views_bp.route('/fundamentals')
def fundamentals():
    return send_from_directory(get_file_path('fundamentals.html'), 'fundamentals.html')

TICKER_CACHE = {"time": 0, "data": None}

@views_bp.route('/economy')
def economy():
    return send_from_directory(get_file_path('economy.html'), 'economy.html')

@views_bp.route('/login')
def login_page():
    if 'user_id' in session:
        return redirect(url_for('dashboard_page'))
    return send_from_directory(get_file_path('login.html'), 'login.html')

@views_bp.route('/register')
def register_page():
    if 'user_id' in session:
        return redirect(url_for('dashboard_page'))
    return send_from_directory(get_file_path('register.html'), 'register.html')

@views_bp.route('/pricing')
def pricing_page():
    return send_from_directory(get_file_path('pricing.html'), 'pricing.html')

@views_bp.route('/dashboard')
@login_required
def dashboard_page():
    return send_from_directory(get_file_path('dashboard.html'), 'dashboard.html')

# Auth APIs

