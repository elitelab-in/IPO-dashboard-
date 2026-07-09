import yfinance as yf
import threading
import concurrent.futures
import time
import pandas as pd

# Define sectors with index tickers and major constituent stocks
SECTORS_CONFIG = {
    "Nifty IT": {
        "ticker": "^CNXIT",
        "constituents": ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "COFORGE", "LTIM", "PERSISTENT"]
    },
    "Bank Nifty": {
        "ticker": "^NSEBANK",
        "constituents": ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "PNB", "FEDERALBNK"]
    },
    "Financial Services": {
        "ticker": "NIFTY_FIN_SERVICE.NS",
        "constituents": ["BAJFINANCE", "BAJAJFINSV", "CHOLAFIN", "RECLTD", "PFC", "MUTHOOTFIN"]
    },
    "Auto": {
        "ticker": "^CNXAUTO",
        "constituents": ["TATAMOTORS", "M&M", "MARUTI", "BAJAJ-AUTO", "HEROMOTOCO", "TVSMOTOR"]
    },
    "Pharma": {
        "ticker": "^CNXPHARMA",
        "constituents": ["SUNPHARMA", "CIPLA", "DRREDDY", "DIVISLAB", "LUPIN", "AUROPHARMA"]
    },
    "FMCG": {
        "ticker": "^CNXFMCG",
        "constituents": ["HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA", "DABUR", "MARICO"]
    },
    "Metal": {
        "ticker": "^CNXMETAL",
        "constituents": ["TATASTEEL", "JSWSTEEL", "HINDALCO", "JINDALSTEL", "COALINDIA", "VEDL"]
    },
    "Realty": {
        "ticker": "^CNXREALTY",
        "constituents": ["DLF", "LODHA", "GODREJPROP", "OBEROIRLTY", "PRESTIGE", "SOBHA"]
    },
    "PSU Bank": {
        "ticker": "^CNXPSUBANK",
        "constituents": ["SBIN", "PNB", "BANKBARODA", "CANBK", "UNIONBANK", "INDIANB"]
    },
    "Energy": {
        "ticker": "^CNXENERGY",
        "constituents": ["RELIANCE", "NTPC", "POWERGRID", "ONGC", "TATAPOWER", "ADANIGREEN"]
    },
    "Oil & Gas": {
        "ticker": "NIFTY_OIL_AND_GAS.NS",
        "constituents": ["RELIANCE", "ONGC", "BPCL", "IOC", "GAIL", "HPCL"]
    },
    "Media": {
        "ticker": "^CNXMEDIA",
        "constituents": ["SUNTV", "ZEEL", "PVRINOX", "Network18", "TV18BRDCST"]
    },
    "Healthcare": {
        "ticker": "NIFTY_HEALTHCARE.NS",
        "constituents": ["SUNPHARMA", "APOLLOHOSP", "MAXHEALTH", "FORTIS", "LALPATHLAB"]
    },
    "Consumer Durables": {
        "ticker": "NIFTY_CONSR_DURBL.NS",
        "constituents": ["TITAN", "HAVELLS", "VOLTAS", "DIXON", "BLUESTARCO"]
    },
    "Infrastructure": {
        "ticker": "^CNXINFRA",
        "constituents": ["LT", "RELIANCE", "NTPC", "POWERGRID", "BHARTIARTL", "ULTRACEMCO"]
    },
    "Capital Goods": {
        "ticker": "NIFTY_CPSE.NS",
        "constituents": ["LT", "BEL", "BHEL", "HAL", "ABB", "SIEMENS"]
    },
    "Chemicals": {
        "ticker": "CHEMICALS.SYNTHETIC",
        "constituents": ["SRF", "AARTIIND", "DEEPAKNTR", "TATACHEM", "PIIND", "UPL"]
    },
    "Defence": {
        "ticker": "DEFENCE.SYNTHETIC",
        "constituents": ["BEL", "HAL", "BDL", "BEML", "COCHINSHIP", "MAZDOCK"]
    },
    "Telecom": {
        "ticker": "TELECOM.SYNTHETIC",
        "constituents": ["BHARTIARTL", "IDEA", "INDUSTOWER", "ROUTE", "TEJASNET"]
    },
    "Services": {
        "ticker": "^CNXSERVICE",
        "constituents": ["LT", "BHARTIARTL", "TCS", "INFY", "HDFCBANK", "ICICIBANK"]
    }
}

class SectorDataLayer:
    def __init__(self):
        self.cache = {}
        self.lock = threading.Lock()
        self.cache_duration = 300  # 5 minutes

    def _is_history_stale(self, df):
        """Checks if the history dataframe has a date gap at the end (greater than 2 business days)."""
        if df is None or df.empty:
            return True
        try:
            import datetime
            import pytz
            last_date = df.index[-1]
            if hasattr(last_date, "date"):
                last_date = last_date.date()
            # Get current date in IST
            today_dt = datetime.datetime.now(pytz.timezone("Asia/Kolkata")).date()
            # Calculate business days gap
            b_days = len(pd.bdate_range(start=last_date, end=today_dt))
            return b_days > 3
        except Exception:
            return False

    def _ensure_latest_day(self, df, ticker):
        """Appends the latest active day from period='1d' if it is missing from period='3mo'."""
        if df is None or df.empty:
            return df
        try:
            latest_df = ticker.history(period="1d")
            if not latest_df.empty:
                latest_idx = latest_df.index[-1]
                if latest_idx not in df.index:
                    df = pd.concat([df, latest_df])
                else:
                    latest_close = latest_df["Close"].iloc[-1]
                    if not pd.isna(latest_close):
                        df.loc[latest_idx, "Close"] = latest_close
                        if "Volume" in latest_df.columns:
                            df.loc[latest_idx, "Volume"] = latest_df["Volume"].iloc[-1]
        except Exception as e:
            print(f"[SectorDataLayer] Error appending latest day: {e}")
        return df

    def get_stock_data(self, symbol):
        """Fetch stock data from yfinance with caching."""
        now = time.time()
        with self.lock:
            if symbol in self.cache:
                entry = self.cache[symbol]
                if now - entry["timestamp"] < self.cache_duration:
                    return entry["data"]
        
        # Format for Indian market
        yf_symbol = f"{symbol}.NS" if "." not in symbol else symbol
        try:
            ticker = yf.Ticker(yf_symbol)
            hist = ticker.history(period="3mo")
            if hist.empty:
                return None
            
            hist = self._ensure_latest_day(hist, ticker)
            hist = hist.dropna(subset=['Close'])
            if hist.empty:
                return None
            
            data = {
                "history": hist,
                "info": ticker.info if hasattr(ticker, "info") else {}
            }
            with self.lock:
                self.cache[symbol] = {
                    "timestamp": now,
                    "data": data
                }
            return data
        except Exception as e:
            print(f"[SectorDataLayer] Error fetching {symbol}: {e}")
            return None

    def get_index_data(self, name, ticker_symbol, fallback_constituents):
        """Fetch index data. Creates a synthetic index if yfinance has no data."""
        now = time.time()
        with self.lock:
            if name in self.cache:
                entry = self.cache[name]
                if now - entry["timestamp"] < self.cache_duration:
                    return entry["data"]

        # If it's a synthetic ticker, build it directly from constituents
        if "SYNTHETIC" in ticker_symbol or ticker_symbol.startswith("NIFTY_OIL") or ticker_symbol.startswith("NIFTY_HEALTH") or ticker_symbol.startswith("NIFTY_CONSR"):
            # Build synthetic index
            data = self._build_synthetic_index(fallback_constituents)
            if data:
                with self.lock:
                    self.cache[name] = {"timestamp": now, "data": data}
                return data

        # Otherwise try to download index ticker from yfinance
        try:
            ticker = yf.Ticker(ticker_symbol)
            hist = ticker.history(period="3mo")
            is_stale = self._is_history_stale(hist)
            
            if not hist.empty:
                hist = self._ensure_latest_day(hist, ticker)
                hist = hist.dropna(subset=['Close'])
                
            if hist.empty or len(hist) < 5 or is_stale:
                # Fallback to synthetic index
                data = self._build_synthetic_index(fallback_constituents)
            else:
                data = {
                    "history": hist,
                    "is_synthetic": False
                }
            
            if data:
                with self.lock:
                    self.cache[name] = {"timestamp": now, "data": data}
                return data
        except Exception:
            data = self._build_synthetic_index(fallback_constituents)
            if data:
                with self.lock:
                    self.cache[name] = {"timestamp": now, "data": data}
                return data
        return None

    def _build_synthetic_index(self, constituents):
        """Builds a synthetic index by averaging performance of major constituent stocks."""
        dfs = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_stock = {executor.submit(self.get_stock_data, sym): sym for sym in constituents[:5]}
            for future in concurrent.futures.as_completed(future_to_stock):
                res = future.result()
                if res and not res["history"].empty:
                    dfs.append(res["history"][["Close", "Volume"]])
        
        if not dfs:
            return None
        
        # Align all dates by taking an average daily return
        returns_df = pd.DataFrame()
        for idx, df in enumerate(dfs):
            # Calculate daily returns
            pct = df["Close"].pct_change().fillna(0)
            returns_df[f"stock_{idx}"] = pct
            
        mean_returns = returns_df.mean(axis=1)
        # Reconstruct cumulative index starting at 1000
        synthetic_close = [1000.0]
        for r in mean_returns.iloc[1:]:
            synthetic_close.append(synthetic_close[-1] * (1.0 + r))
            
        # Build dummy dataframe matching dates of the returns
        hist_df = pd.DataFrame(index=returns_df.index)
        hist_df["Close"] = synthetic_close
        hist_df["Volume"] = 1000000.0  # Dummy volume
        
        return {
            "history": hist_df,
            "is_synthetic": True
        }

    def fetch_all_sectors_data(self):
        """Fetch data for all sectors concurrently."""
        results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            future_to_sector = {
                executor.submit(self.get_index_data, name, cfg["ticker"], cfg["constituents"]): name
                for name, cfg in SECTORS_CONFIG.items()
            }
            for future in concurrent.futures.as_completed(future_to_sector):
                name = future_to_sector[future]
                try:
                    results[name] = future.result()
                except Exception as e:
                    print(f"[SectorDataLayer] Error loading sector {name}: {e}")
                    results[name] = None
        return results
